// ============================================================
// EGAC Platform — POST /api/cron/academy-rollover
// src/api/cron/academy-rollover.ts
//
// Rolls unplaced waitlist entries from expired academy seasons
// into the next upcoming season. Sets is_returning = true for
// athletes who were accepted in any previous season.
// Marks the old season as 'closed'.
//
// Idempotent — only processes seasons that are 'open' and
// past their end_date, so repeated runs are safe.
//
// Auth: Authorization: Bearer <CRON_SECRET>
// ============================================================

import { ok, err, checkCronAuth } from '../helpers.js';
import {
  listAcademySeasons,
  listWaitlistBySeason,
  rolloverWaitlistEntry,
  hasAcceptedEntryForEnquiry,
  updateSeasonStatus,
  getUpcomingAcademySeason,
} from '../../lib/repositories/academy.js';
import type { Env } from '../../lib/db/schema.js';

// ------------------------------------------------------------
// runAcademyRollover
// ------------------------------------------------------------
export async function runAcademyRollover(
  env: Env
): Promise<{ rolledOver: number; seasonsClosed: number }> {
  const today = new Date().toISOString().split('T')[0];
  const seasons = await listAcademySeasons(env);

  // Only process seasons that are 'open' and have ended
  const expiredOpenSeasons = seasons.filter((s) => s.status === 'open' && s.end_date < today);

  if (expiredOpenSeasons.length === 0) {
    return { rolledOver: 0, seasonsClosed: 0 };
  }

  // Find the earliest upcoming season to roll entries into
  const nextSeason = await getUpcomingAcademySeason(env);

  let rolledOver = 0;
  let seasonsClosed = 0;

  for (const season of expiredOpenSeasons) {
    const entries = await listWaitlistBySeason(season.id, env);

    // Entries that never got a confirmed place
    const unplaced = entries.filter((e) => e.status === 'waiting' || e.status === 'invited');

    for (const entry of unplaced) {
      const isReturning = await hasAcceptedEntryForEnquiry(entry.enquiry_id, env);
      await rolloverWaitlistEntry(entry.id, nextSeason?.id ?? null, season.id, isReturning, env);
      rolledOver++;
    }

    await updateSeasonStatus(season.id, 'closed', env);
    seasonsClosed++;

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'academy_season_closed',
        season_id: season.id,
        unplaced_rolled: unplaced.length,
        rolled_to: nextSeason?.id ?? 'unassigned',
      })
    );
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'academy_rollover_complete',
      rolledOver,
      seasonsClosed,
    })
  );

  return { rolledOver, seasonsClosed };
}

// ------------------------------------------------------------
// handleAcademyRollover
// ------------------------------------------------------------
export async function handleAcademyRollover(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);
  if (!checkCronAuth(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const result = await runAcademyRollover(env);
  return ok(result);
}

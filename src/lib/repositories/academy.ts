// ============================================================
// EGAC Platform — Academy Repository
// src/lib/repositories/academy.ts
//
// Covers both academy_waitlist and academy_seasons tables.
// ============================================================

import { generateId, generateToken, now, one, many, run, getDB, getEnv } from '../db/client.js';
import type {
  AcademyWaitlistEntry,
  AcademySeason,
  AcademyWaitlistStatus,
  Env,
} from '../db/schema.js';

// ── Waitlist ─────────────────────────────────────────────────

export async function addToWaitlist(enquiryId: string, env: Env): Promise<AcademyWaitlistEntry> {
  const db = getDB(env);
  const environment = getEnv(env);
  const id = generateId('awl');
  const token = generateToken(24);
  const createdAt = now();

  await run(
    db
      .prepare(
        `INSERT INTO academy_waitlist
       (id, enquiry_id, token, status, is_returning, send_attempts, created_at, environment)
       VALUES (?, ?, ?, 'waiting', 0, 0, ?, ?)`
      )
      .bind(id, enquiryId, token, createdAt, environment)
  );

  const entry = await getWaitlistEntryById(id, env);
  if (!entry) throw new Error(`Failed to retrieve waitlist entry after insert: ${id}`);
  return entry;
}

export async function getWaitlistEntryById(
  id: string,
  env: Env
): Promise<AcademyWaitlistEntry | null> {
  const db = getDB(env);
  const environment = getEnv(env);
  return one<AcademyWaitlistEntry>(
    db
      .prepare('SELECT * FROM academy_waitlist WHERE id = ? AND environment = ?')
      .bind(id, environment)
  );
}

export async function getWaitlistEntryByToken(
  token: string,
  env: Env
): Promise<AcademyWaitlistEntry | null> {
  const db = getDB(env);
  const environment = getEnv(env);
  return one<AcademyWaitlistEntry>(
    db
      .prepare('SELECT * FROM academy_waitlist WHERE token = ? AND environment = ?')
      .bind(token, environment)
  );
}

export async function getWaitlistEntryByEnquiry(
  enquiryId: string,
  env: Env
): Promise<AcademyWaitlistEntry | null> {
  const db = getDB(env);
  const environment = getEnv(env);
  return one<AcademyWaitlistEntry>(
    db
      .prepare(
        `SELECT * FROM academy_waitlist WHERE enquiry_id = ? AND environment = ?
       ORDER BY created_at DESC LIMIT 1`
      )
      .bind(enquiryId, environment)
  );
}

export async function listWaitlistBySeason(
  seasonId: string,
  env: Env
): Promise<AcademyWaitlistEntry[]> {
  const db = getDB(env);
  const environment = getEnv(env);
  return many<AcademyWaitlistEntry>(
    db
      .prepare(
        `SELECT * FROM academy_waitlist
       WHERE season_id = ? AND environment = ?
       ORDER BY is_returning DESC, position ASC, created_at ASC`
      )
      .bind(seasonId, environment)
  );
}

export async function listUnassignedWaitlist(env: Env): Promise<AcademyWaitlistEntry[]> {
  const db = getDB(env);
  const environment = getEnv(env);
  return many<AcademyWaitlistEntry>(
    db
      .prepare(
        `SELECT * FROM academy_waitlist
       WHERE season_id IS NULL AND status = 'waiting' AND environment = ?
       ORDER BY created_at ASC`
      )
      .bind(environment)
  );
}

export async function updateWaitlistStatus(
  id: string,
  status: AcademyWaitlistStatus,
  env: Env
): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);
  await run(
    db
      .prepare('UPDATE academy_waitlist SET status = ? WHERE id = ? AND environment = ?')
      .bind(status, id, environment)
  );
}

export async function markWaitlistInviteSent(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);
  await run(
    db
      .prepare(
        `UPDATE academy_waitlist
       SET status = 'invited', invited_at = ?, send_attempts = send_attempts + 1
       WHERE id = ? AND environment = ?`
      )
      .bind(now(), id, environment)
  );
}

export async function recordWaitlistResponse(
  token: string,
  response: 'yes' | 'no',
  env: Env
): Promise<AcademyWaitlistEntry> {
  const db = getDB(env);
  const environment = getEnv(env);

  const entry = await getWaitlistEntryByToken(token, env);
  if (!entry) throw new Error(`Waitlist entry not found for token: ${token}`);

  const status: AcademyWaitlistStatus = response === 'yes' ? 'accepted' : 'declined';

  await run(
    db
      .prepare(
        `UPDATE academy_waitlist
       SET response = ?, responded_at = ?, status = ?
       WHERE token = ? AND environment = ?`
      )
      .bind(response, now(), status, token, environment)
  );

  const updated = await getWaitlistEntryById(entry.id, env);
  if (!updated) throw new Error(`Waitlist entry not found after update: ${entry.id}`);
  return updated;
}

export async function assignWaitlistToSeason(
  id: string,
  seasonId: string,
  position: number,
  isReturning: boolean,
  env: Env
): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);
  await run(
    db
      .prepare(
        `UPDATE academy_waitlist
       SET season_id = ?, position = ?, is_returning = ?
       WHERE id = ? AND environment = ?`
      )
      .bind(seasonId, position, isReturning ? 1 : 0, id, environment)
  );
}

export async function countAcceptedForSeason(seasonId: string, env: Env): Promise<number> {
  const db = getDB(env);
  const result = await one<{ count: number }>(
    db
      .prepare(
        `SELECT COUNT(*) as count FROM academy_waitlist
       WHERE season_id = ? AND status = 'accepted'`
      )
      .bind(seasonId)
  );
  return result?.count ?? 0;
}

// ── Seasons ───────────────────────────────────────────────────

export async function createAcademySeason(
  data: Pick<
    AcademySeason,
    'code' | 'label' | 'start_date' | 'end_date' | 'capacity' | 'age_group_id'
  >,
  env: Env
): Promise<AcademySeason> {
  const db = getDB(env);
  const id = generateId('acs');
  const createdAt = now();

  await run(
    db
      .prepare(
        `INSERT INTO academy_seasons
       (id, code, label, start_date, end_date, capacity, status, age_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`
      )
      .bind(
        id,
        data.code,
        data.label,
        data.start_date,
        data.end_date,
        data.capacity,
        data.age_group_id,
        createdAt
      )
  );

  const season = await getAcademySeasonById(id, env);
  if (!season) throw new Error(`Failed to retrieve season after insert: ${id}`);
  return season;
}

export async function getAcademySeasonById(id: string, env: Env): Promise<AcademySeason | null> {
  const db = getDB(env);
  return one<AcademySeason>(db.prepare('SELECT * FROM academy_seasons WHERE id = ?').bind(id));
}

export async function getOpenAcademySeason(env: Env): Promise<AcademySeason | null> {
  const db = getDB(env);
  return one<AcademySeason>(
    db.prepare(
      "SELECT * FROM academy_seasons WHERE status = 'open' ORDER BY start_date DESC LIMIT 1"
    )
  );
}

export async function listAcademySeasons(env: Env): Promise<AcademySeason[]> {
  const db = getDB(env);
  return many<AcademySeason>(db.prepare('SELECT * FROM academy_seasons ORDER BY start_date DESC'));
}

export async function updateSeasonStatus(
  id: string,
  status: AcademySeason['status'],
  env: Env
): Promise<void> {
  const db = getDB(env);
  await run(
    db
      .prepare('UPDATE academy_seasons SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now(), id)
  );
}

// ── Rollover helpers ─────────────────────────────────────────

// Returns the earliest upcoming season (status = 'upcoming').
export async function getUpcomingAcademySeason(env: Env): Promise<AcademySeason | null> {
  const db = getDB(env);
  return one<AcademySeason>(
    db.prepare(
      "SELECT * FROM academy_seasons WHERE status = 'upcoming' ORDER BY start_date ASC LIMIT 1"
    )
  );
}

// Moves a waitlist entry to a new season (or back to the unassigned pool).
// Sets rolled_over_from_season_id and resets status to 'waiting'.
export async function rolloverWaitlistEntry(
  id: string,
  newSeasonId: string | null,
  oldSeasonId: string,
  isReturning: boolean,
  env: Env
): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);
  await run(
    db
      .prepare(
        `UPDATE academy_waitlist
         SET season_id = ?, rolled_over_from_season_id = ?,
             is_returning = ?, status = 'waiting', position = NULL
         WHERE id = ? AND environment = ?`
      )
      .bind(newSeasonId, oldSeasonId, isReturning ? 1 : 0, id, environment)
  );
}

// Returns true if this enquiry has ever been accepted in any academy season.
export async function hasAcceptedEntryForEnquiry(enquiryId: string, env: Env): Promise<boolean> {
  const db = getDB(env);
  const environment = getEnv(env);
  const result = await one<{ count: number }>(
    db
      .prepare(
        `SELECT COUNT(*) as count FROM academy_waitlist
         WHERE enquiry_id = ? AND status = 'accepted' AND environment = ?`
      )
      .bind(enquiryId, environment)
  );
  return (result?.count ?? 0) > 0;
}

// ============================================================
// EGAC Platform — POST /api/cron/expire-invites
// src/api/cron/expire-invites.ts
//
// Marks sent invites older than 14 days as expired.
// Safe to run daily — idempotent by design (already-expired
// invites are not in the 'sent' status bucket).
//
// Auth: Authorization: Bearer <CRON_SECRET>
// ============================================================

import { ok, err, checkCronAuth } from '../helpers.js';
import { listSentInvitesOlderThan, markInviteExpired } from '../../lib/repositories/invites.js';
import { appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import type { Env } from '../../lib/db/schema.js';

const INVITE_TTL_DAYS = 14;

// ------------------------------------------------------------
// runExpireInvites
// Core logic — called by the HTTP handler and the scheduled event.
// ------------------------------------------------------------
export async function runExpireInvites(env: Env): Promise<{ expired: number }> {
  const stale = await listSentInvitesOlderThan(INVITE_TTL_DAYS, env);
  let expired = 0;

  for (const invite of stale) {
    await markInviteExpired(invite.id, env);

    // Log to enquiry event trail — non-fatal if it fails
    await appendEnquiryEvent(invite.enquiry_id, { type: 'invite_expired' }, env).catch(
      (e: unknown) => {
        console.error(
          JSON.stringify({
            level: 'warn',
            event: 'expire_event_log_failed',
            invite_id: invite.id,
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    );

    expired++;
  }

  console.log(JSON.stringify({ level: 'info', event: 'expire_invites_complete', expired }));
  return { expired };
}

// ------------------------------------------------------------
// handleExpireInvites
// HTTP entry point — validates CRON_SECRET then delegates.
// ------------------------------------------------------------
export async function handleExpireInvites(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);
  if (!checkCronAuth(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const result = await runExpireInvites(env);
  return ok(result);
}

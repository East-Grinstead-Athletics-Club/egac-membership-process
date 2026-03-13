// ============================================================
// EGAC Platform — POST /api/cron/retry-invites
// src/api/cron/retry-invites.ts
//
// Retries pending booking invite emails that have not yet been
// sent successfully. Stops after MAX_ATTEMPTS total failures
// and marks the invite as 'failed'.
//
// Auth: Authorization: Bearer <CRON_SECRET>
// ============================================================

import { ok, err, checkCronAuth } from '../helpers.js';
import {
  listPendingInvites,
  markInviteSent,
  markInviteFailed,
  incrementSendAttempts,
} from '../../lib/repositories/invites.js';
import { getEnquiryById, appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import { sendBookingInvite } from '../../lib/email/templates.js';
import { getNextNTuesdayDates } from '../../lib/business/age.js';
import { getConfig } from '../../lib/config.js';
import type { Env } from '../../lib/db/schema.js';

const MAX_ATTEMPTS = 3;

// ------------------------------------------------------------
// runRetryInvites
// ------------------------------------------------------------
export async function runRetryInvites(env: Env): Promise<{ retried: number; failed: number }> {
  // listPendingInvites already applies: status = 'pending' AND send_attempts < 3
  const pending = await listPendingInvites(env);
  const config = await getConfig(env);
  const weeksAhead = parseInt(config.weeks_ahead_booking ?? '8', 10);
  const availableDates = getNextNTuesdayDates(weeksAhead);

  let retried = 0;
  let failed = 0;

  for (const invite of pending) {
    const enquiry = await getEnquiryById(invite.enquiry_id, env);
    if (!enquiry) {
      console.error(
        JSON.stringify({
          level: 'warn',
          event: 'retry_enquiry_not_found',
          invite_id: invite.id,
          enquiry_id: invite.enquiry_id,
        })
      );
      continue;
    }

    const result = await sendBookingInvite(enquiry, invite, availableDates, env);

    if (result.success) {
      await markInviteSent(invite.id, env);
      await appendEnquiryEvent(invite.enquiry_id, { type: 'invite_resent' }, env).catch(() => {});
      retried++;
    } else {
      await incrementSendAttempts(invite.id, result.error ?? null, env);

      // After this increment, total attempts = invite.send_attempts + 1
      if (invite.send_attempts + 1 >= MAX_ATTEMPTS) {
        await markInviteFailed(invite.id, env);
        failed++;
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'invite_failed_max_attempts',
            invite_id: invite.id,
            enquiry_id: invite.enquiry_id,
          })
        );
      }
    }
  }

  console.log(JSON.stringify({ level: 'info', event: 'retry_invites_complete', retried, failed }));
  return { retried, failed };
}

// ------------------------------------------------------------
// handleRetryInvites
// ------------------------------------------------------------
export async function handleRetryInvites(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);
  if (!checkCronAuth(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const result = await runRetryInvites(env);
  return ok(result);
}

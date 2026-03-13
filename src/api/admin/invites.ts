// ============================================================
// EGAC Platform — POST /api/admin/invites/resend
// src/api/admin/invites.ts
//
// Resends a booking invite for an enquiry.
// Reuses the existing pending invite if one exists; otherwise
// creates a new one. Always sends a fresh invite email.
//
// Auth: Authorization: Bearer <ADMIN_TOKEN> (or x-admin-token)
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { getEnquiryById, appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import {
  getInviteByEnquiryId,
  createInviteForEnquiry,
  markInviteSent,
} from '../../lib/repositories/invites.js';
import { sendBookingInvite } from '../../lib/email/templates.js';
import { getNextNTuesdayDates } from '../../lib/business/age.js';
import { getConfig } from '../../lib/config.js';
import type { Env } from '../../lib/db/schema.js';

// ------------------------------------------------------------
// handleAdminInviteResend
// ------------------------------------------------------------
export async function handleAdminInviteResend(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<{ enquiry_id?: string }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const { enquiry_id } = body;
  if (!enquiry_id) return err('enquiry_id is required', 422, 'MISSING_ENQUIRY_ID');

  // Load enquiry
  const enquiry = await getEnquiryById(enquiry_id, env);
  if (!enquiry) return err('Enquiry not found', 404, 'NOT_FOUND');

  // Reuse the existing pending invite, or create a new one
  const existing = await getInviteByEnquiryId(enquiry_id, env);
  const reused = !!existing && (existing.status === 'pending' || existing.status === 'sent');

  const invite = reused && existing ? existing : await createInviteForEnquiry(enquiry_id, env);

  // Build available dates and send
  const config = await getConfig(env);
  const weeksAhead = parseInt(config.weeks_ahead_booking ?? '8', 10);
  const availableDates = getNextNTuesdayDates(weeksAhead);

  const result = await sendBookingInvite(enquiry, invite, availableDates, env);

  if (!result.success) {
    return err(`Failed to send invite email: ${result.error}`, 502, 'EMAIL_FAILED');
  }

  await markInviteSent(invite.id, env);
  await appendEnquiryEvent(enquiry_id, { type: 'invite_resent' }, env).catch(() => {});

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'admin_invite_resent',
      enquiry_id,
      invite_id: invite.id,
      reused,
    })
  );

  return ok({ invite_id: invite.id, reused });
}

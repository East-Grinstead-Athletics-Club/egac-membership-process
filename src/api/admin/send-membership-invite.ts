// ============================================================
// EGAC Platform — POST /api/admin/send-membership-invite
// src/api/admin/send-membership-invite.ts
//
// Generates a membership OTP and sends a membership invite email.
// Used by both the admin portal and the coach app check-in.
//
// Body: {
//   enquiry_id: string
// }
//
// Auth: Authorization: Bearer <ADMIN_TOKEN> or Bearer <CRON_SECRET>
// (CRON_SECRET allows this from scheduled jobs and coach app)
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { getEnquiryById, appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import { sendMembershipInvite } from '../../lib/email/templates.js';
import { getDB, getEnv, generateId, generateToken, now } from '../../lib/db/client.js';
import type { Env } from '../../lib/db/schema.js';

export async function handleSendMembershipInvite(
  request: Request,
  env: Env
): Promise<Response> {
  // Accept both ADMIN_TOKEN and CRON_SECRET for flexibility
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const isAdmin = token === env.ADMIN_TOKEN;
  const isCron = token === env.CRON_SECRET;

  if (!isAdmin && !isCron) {
    return err('Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (request.method !== 'POST') {
    return err('Method not allowed', 405);
  }

  const body = await parseBody<{ enquiry_id?: string }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const enquiryId = body.enquiry_id ? String(body.enquiry_id).trim() : '';
  if (!enquiryId) {
    return err('enquiry_id is required', 422, 'MISSING_FIELD');
  }

  // Load enquiry
  const enquiry = await getEnquiryById(enquiryId, env);
  if (!enquiry) {
    return err('Enquiry not found', 404, 'ENQUIRY_NOT_FOUND');
  }

  const db = getDB(env);
  const environment = getEnv(env);

  // Check if membership OTP already exists and hasn't been used
  const existingOtp = await db
    .prepare(
      `SELECT id, token, used_at FROM membership_otps
       WHERE enquiry_id = ? AND environment = ? AND used_at IS NULL
       LIMIT 1`
    )
    .bind(enquiryId, environment)
    .first<{ id: string; token: string; used_at: string | null }>();

  let otpToken: string;
  let otpId: string;
  let isNewOtp = false;

  if (existingOtp) {
    // Reuse the existing token
    otpToken = existingOtp.token;
    otpId = existingOtp.id;
  } else {
    // Generate new OTP
    otpToken = generateToken(32);
    otpId = generateId('otp');
    isNewOtp = true;

    await db
      .prepare(
        `INSERT INTO membership_otps (id, enquiry_id, token, created_at, used_at, environment)
         VALUES (?, ?, ?, ?, NULL, ?)`
      )
      .bind(otpId, enquiryId, otpToken, now(), environment)
      .run();
  }

  // Send membership invite email
  const result = await sendMembershipInvite(enquiry, otpToken, env);

  if (result.success) {
    if (isNewOtp) {
      await appendEnquiryEvent(enquiryId, { type: 'membership_invite_sent', otp_id: otpId }, env);
    }

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'membership_invite_sent',
        enquiry_id: enquiryId,
        is_new_otp: isNewOtp,
      })
    );

    return ok({
      enquiry_id: enquiryId,
      membership_invite_sent: true,
      reused_existing_token: !isNewOtp,
    });
  } else {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'membership_invite_failed',
        enquiry_id: enquiryId,
        error: result.error,
      })
    );

    return err(`Failed to send membership invite: ${result.error}`, 500, 'SEND_FAILED');
  }
}

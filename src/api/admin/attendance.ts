// ============================================================
// EGAC Platform — POST /api/admin/bookings/:id/attendance
// src/api/admin/attendance.ts
//
// Records attendance for a booking and optionally sends a
// membership invite when the athlete attended.
//
// Body: {
//   status: 'attended' | 'no_show' | 'cancelled'
//   note?: string
//   send_membership_link?: boolean
// }
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { getBookingById, updateBookingStatus } from '../../lib/repositories/bookings.js';
import { getEnquiryById, appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import { sendMembershipInvite } from '../../lib/email/templates.js';
import { getDB, getEnv, generateId, generateToken, now } from '../../lib/db/client.js';
import type { Env, BookingStatus } from '../../lib/db/schema.js';

const VALID_STATUSES: BookingStatus[] = ['attended', 'no_show', 'cancelled'];

// ------------------------------------------------------------
// handleAdminAttendance
// ------------------------------------------------------------
export async function handleAdminAttendance(
  request: Request,
  env: Env,
  bookingId: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<{
    status?: string;
    note?: string;
    send_membership_link?: boolean;
  }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const status = body.status as BookingStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return err(`status must be one of: ${VALID_STATUSES.join(', ')}`, 422, 'INVALID_STATUS');
  }

  const note = body.note ? String(body.note).trim() : null;
  const sendMembership = status === 'attended' && body.send_membership_link === true;

  // Load booking
  const booking = await getBookingById(bookingId, env);
  if (!booking) return err('Booking not found', 404, 'NOT_FOUND');

  // Load enquiry
  const enquiry = await getEnquiryById(booking.enquiry_id, env);
  if (!enquiry) return err('Enquiry not found', 404, 'ENQUIRY_NOT_FOUND');

  // Update booking status
  await updateBookingStatus(bookingId, status, note, env);

  // Append attendance event
  await appendEnquiryEvent(
    enquiry.id,
    { type: 'attendance_recorded', booking_id: bookingId, status, note },
    env
  );

  let membershipTokenSent: string | null = null;

  if (sendMembership) {
    // Generate membership OTP and store it
    const otpToken = generateToken(32);
    const otpId = generateId('otp');
    const db = getDB(env);
    const environment = getEnv(env);

    await db
      .prepare(
        `INSERT INTO membership_otps (id, enquiry_id, token, created_at, used_at, environment)
         VALUES (?, ?, ?, ?, NULL, ?)`
      )
      .bind(otpId, enquiry.id, otpToken, now(), environment)
      .run();

    // Send membership invite email
    const result = await sendMembershipInvite(enquiry, otpToken, env);

    if (result.success) {
      await appendEnquiryEvent(enquiry.id, { type: 'membership_invite_sent', otp_id: otpId }, env);
      membershipTokenSent = otpToken;

      console.log(
        JSON.stringify({
          level: 'info',
          event: 'membership_invite_sent',
          enquiry_id: enquiry.id,
          booking_id: bookingId,
        })
      );
    } else {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'membership_invite_failed',
          enquiry_id: enquiry.id,
          error: result.error,
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'attendance_recorded',
      booking_id: bookingId,
      enquiry_id: enquiry.id,
      status,
    })
  );

  return ok({
    booking_id: bookingId,
    status,
    membership_invite_sent: !!membershipTokenSent,
  });
}

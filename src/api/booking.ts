// ============================================================
// EGAC Platform — POST /api/booking
// src/api/booking.ts
//
// Creates a taster session booking via an invite token.
// Age group is resolved from D1 — no hardcoded slot codes.
// ============================================================

import { ok, err, parseBody } from './helpers.js';
import { getInviteByToken, markInviteAccepted } from '../lib/repositories/invites.js';
import { getEnquiryById, appendEnquiryEvent } from '../lib/repositories/enquiries.js';
import {
  createBooking,
  countBookingsForDateAndGroup,
  getBookingByInviteAndDate,
} from '../lib/repositories/bookings.js';
import { getAgeGroupById, listAgeGroups } from '../lib/repositories/age-groups.js';
import { validateBookingRequest, buildBookingConfirmation } from '../lib/business/booking.js';
import { resolveAgeGroup } from '../lib/business/age.js';
import { isInviteExpired } from '../lib/business/tokens.js';
import { sendBookingConfirmation } from '../lib/email/templates.js';
import { getConfig, resolveVenueForDate } from '../lib/config.js';
import type { Env } from '../lib/db/schema.js';

export async function handleBooking(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<{ token: string; date: string; age_group_id?: string }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const { token, date } = body;

  if (!token) return err('Invite token is required', 422, 'MISSING_TOKEN');
  if (!date) return err('Session date is required', 422, 'MISSING_DATE');

  // 1. Look up invite
  const invite = await getInviteByToken(token, env);
  if (!invite) return err('Invite not found', 404, 'INVITE_NOT_FOUND');

  if (invite.status === 'accepted')
    return err('This invite has already been used', 409, 'INVITE_USED');
  if (invite.status === 'expired') return err('This invite has expired', 410, 'INVITE_EXPIRED');
  if (isInviteExpired(invite.created_at))
    return err('This invite has expired', 410, 'INVITE_EXPIRED');

  // 2. Look up enquiry
  const enquiry = await getEnquiryById(invite.enquiry_id, env);
  if (!enquiry) return err('Enquiry not found', 404, 'ENQUIRY_NOT_FOUND');

  // 3. Resolve the athlete's age group from D1
  const allGroups = await listAgeGroups(env);
  const tasterGroups = allGroups.filter((g) => g.booking_type === 'taster');

  let ageGroup = resolveAgeGroup(enquiry.dob, date, tasterGroups);

  // If a specific age_group_id was passed (admin override or URL param), use that
  if (body.age_group_id) {
    const overrideGroup = await getAgeGroupById(body.age_group_id, env);
    if (overrideGroup && overrideGroup.booking_type === 'taster') {
      ageGroup = overrideGroup;
    }
  }

  if (!ageGroup) {
    return err(
      'No matching age group found for this date. Please contact the club.',
      422,
      'NO_AGE_GROUP'
    );
  }

  // 4. Validate the session date against the age group rules
  const validation = validateBookingRequest(date, enquiry.dob, ageGroup);
  if (!validation.valid) return err(validation.reason ?? 'Invalid booking', 422, 'SLOT_INVALID');

  // 5. Duplicate booking check
  const existing = await getBookingByInviteAndDate(invite.id, date, env);
  if (existing) return err('You already have a booking for this date', 409, 'DUPLICATE_BOOKING');

  // 6. Capacity check
  const config = await getConfig(env);
  const capacity = ageGroup.capacity_per_session ?? parseInt(config.weeks_ahead_booking ?? '2', 10);
  const currentCount = await countBookingsForDateAndGroup(date, ageGroup.id, env);

  if (currentCount >= capacity) {
    return err('This session is full. Please choose a different date.', 409, 'SLOT_FULL');
  }

  // 7. Create booking
  const booking = await createBooking(
    enquiry.id,
    invite.id,
    ageGroup.id,
    date,
    ageGroup.session_time,
    env
  );

  // 8. Mark invite accepted + record event
  await markInviteAccepted(invite.id, env);
  await appendEnquiryEvent(enquiry.id, { type: 'booking_created', booking_id: booking.id }, env);

  // 9. Build confirmation and send email (fire-and-forget)
  const venueName = resolveVenueForDate(date, config);
  const siteUrl = config.site_url ?? 'https://egac.pages.dev';
  const confirmation = buildBookingConfirmation(enquiry, booking, ageGroup, venueName, siteUrl);

  try {
    const emailResult = await sendBookingConfirmation(
      enquiry,
      booking,
      venueName,
      confirmation.calendarUrl,
      env
    );

    if (!emailResult.success) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'booking_confirmation_email_failed',
          booking_id: booking.id,
          error: emailResult.error ?? 'Unknown email delivery failure',
        })
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'booking_confirmation_email_exception',
        booking_id: booking.id,
        error: String(e),
      })
    );
  }

  return ok({
    booking_id: booking.id,
    session_date: booking.session_date,
    session_time: booking.session_time,
    age_group: ageGroup.label,
    venue: venueName,
    message: 'Booking confirmed. A confirmation email is on its way.',
  });
}

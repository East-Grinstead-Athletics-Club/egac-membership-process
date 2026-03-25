// ============================================================
// EGAC Platform — POST /api/cron/send-reminders
// src/api/cron/send-reminders.ts
//
// Sends session reminder emails for bookings exactly
// REMINDER_DAYS_AHEAD days from today. Idempotent — checks
// the enquiry event log for a prior 'reminder_sent' event
// tied to the same booking, so running multiple times on the
// same day is safe.
//
// Auth: Authorization: Bearer <CRON_SECRET>
// ============================================================

import { ok, err, checkCronAuth } from '../helpers.js';
import { listBookingsForDate } from '../../lib/repositories/bookings.js';
import { getEnquiryById, appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import { sendBookingReminder } from '../../lib/email/templates.js';
import { getConfig, resolveVenueForDate } from '../../lib/config.js';
import type { Env, EnquiryEvent } from '../../lib/db/schema.js';

const REMINDER_DAYS_AHEAD = 7;

// ------------------------------------------------------------
// runSendReminders
// ------------------------------------------------------------
export async function runSendReminders(env: Env): Promise<{ sent: number; skipped: number }> {
  const config = await getConfig(env);

  // Target: sessions happening exactly REMINDER_DAYS_AHEAD from today
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + REMINDER_DAYS_AHEAD);
  const targetDateIso = targetDate.toISOString().split('T')[0];

  const bookings = await listBookingsForDate(targetDateIso, env);

  let sent = 0;
  let skipped = 0;

  for (const booking of bookings) {
    if (booking.status !== 'confirmed') {
      skipped++;
      continue;
    }

    const enquiry = await getEnquiryById(booking.enquiry_id, env);
    if (!enquiry) {
      skipped++;
      continue;
    }

    // Idempotency: skip if a reminder was already sent for this booking
    let events: EnquiryEvent[] = [];
    try {
      events = JSON.parse(enquiry.events || '[]');
    } catch {
      /* non-fatal — treat as no events */
    }

    const alreadySent = events.some(
      (e) =>
        e.type === 'reminder_sent' &&
        (e as unknown as Record<string, unknown>).booking_id === booking.id
    );

    if (alreadySent) {
      skipped++;
      continue;
    }

    const venueName = resolveVenueForDate(booking.session_date, config);
    const result = await sendBookingReminder(enquiry, booking, venueName, env);

    if (result.success) {
      await appendEnquiryEvent(
        enquiry.id,
        { type: 'reminder_sent', booking_id: booking.id },
        env
      ).catch(() => {});
      sent++;
    } else {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'reminder_send_failed',
          booking_id: booking.id,
          enquiry_id: enquiry.id,
          error: result.error,
        })
      );
      skipped++;
    }
  }

  console.log(JSON.stringify({ level: 'info', event: 'send_reminders_complete', sent, skipped }));
  return { sent, skipped };
}

// ------------------------------------------------------------
// handleSendReminders
// ------------------------------------------------------------
export async function handleSendReminders(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);
  if (!checkCronAuth(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const result = await runSendReminders(env);
  return ok(result);
}

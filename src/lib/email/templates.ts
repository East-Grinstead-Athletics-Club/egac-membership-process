// ============================================================
// EGAC Platform — Email Template Senders
// src/lib/email/templates.ts
//
// One function per email type. Each function:
//   1. Fetches the template from D1
//   2. Renders it with the correct variables
//   3. Sends via the email client
//   4. Returns the send result
//
// All functions are safe to call — they log failures but
// do not throw, so a broken template never crashes a request.
// ============================================================

import { sendEmailWithRetry } from './client.js';
import { getEmailTemplateByKey } from '../repositories/templates.js';
import { renderTemplate } from '../business/templates.js';
import { formatDateForDisplay } from '../business/age.js';
import type { Enquiry, Invite, AcademyWaitlistEntry, Booking, Env } from '../db/schema.js';
import type { SendEmailResult } from './client.js';

function getPublicSiteUrl(env: Env): string {
  const explicit = (env as unknown as Record<string, string>).SITE_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/$/, '');

  // Production fallback used when SITE_URL is not configured.
  if (env.APP_ENV === 'production') return 'https://egac-cl9.pages.dev';

  return 'https://egac.pages.dev';
}

// ------------------------------------------------------------
// sendBookingInvite
// Sent when a non-academy enquiry is processed.
// Includes a link to the booking page and a list of available dates.
// ------------------------------------------------------------
export async function sendBookingInvite(
  enquiry: Enquiry,
  invite: Invite,
  availableDates: string[],
  env: Env
): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('booking_invite', env);
  if (!template) {
    console.error(
      JSON.stringify({ level: 'error', event: 'template_not_found', key: 'booking_invite' })
    );
    return { success: false, error: 'Template booking_invite not found or inactive' };
  }

  const siteUrl = getPublicSiteUrl(env);
  const bookingUrl = `${siteUrl}/book/${invite.token}`;
  const datesList = availableDates.map((d) => `• ${formatDateForDisplay(d)}`).join('\n');

  try {
    const html = renderTemplate(template.html, {
      contact_name: enquiry.name || 'there',
      booking_url: bookingUrl,
      available_dates_list: datesList,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          contact_name: enquiry.name || 'there',
          booking_url: bookingUrl,
          available_dates_list: datesList,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'booking_invite',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendBookingConfirmation
// Sent when a taster session booking is created.
// Includes session details and a Google Calendar link.
// ------------------------------------------------------------
export async function sendBookingConfirmation(
  enquiry: Enquiry,
  booking: Booking,
  venueName: string,
  calendarUrl: string,
  env: Env
): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('booking_confirmation', env);
  if (!template) {
    return { success: false, error: 'Template booking_confirmation not found or inactive' };
  }

  const sessionTime = booking.session_time ?? '';
  const ageGroupLabel = (booking as unknown as Record<string, string>).age_group_label ?? '';

  try {
    const html = renderTemplate(template.html, {
      contact_name: enquiry.name || 'there',
      session_date: formatDateForDisplay(booking.session_date),
      session_time: sessionTime,
      age_group_label: ageGroupLabel,
      venue: venueName,
      add_to_calendar_url: calendarUrl,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          contact_name: enquiry.name || 'there',
          session_date: formatDateForDisplay(booking.session_date),
          session_time: sessionTime,
          age_group_label: ageGroupLabel,
          venue: venueName,
          add_to_calendar_url: calendarUrl,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'booking_confirmation',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendAcademyWaitlist
// Sent when an under-10 enquiry is routed to the academy path.
// Includes a link to confirm/decline when a place becomes available.
// ------------------------------------------------------------
export async function sendAcademyWaitlist(
  enquiry: Enquiry,
  invitation: AcademyWaitlistEntry,
  env: Env
): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('academy_waitlist', env);
  if (!template) {
    return { success: false, error: 'Template academy_waitlist not found or inactive' };
  }

  const siteUrl = getPublicSiteUrl(env);
  const responseUrl = `${siteUrl}/academy/respond/${invitation.token}`;

  try {
    const html = renderTemplate(template.html, {
      parent_name: enquiry.name || 'there',
      child_name: enquiry.name || 'your child',
      response_url: responseUrl,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          parent_name: enquiry.name || 'there',
          child_name: enquiry.name || 'your child',
          response_url: responseUrl,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'academy_waitlist',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendAcademyRejection
// Sent when an applicant is too young for the Academy (below Year 5).
// Explains the minimum age and invites them to reapply.
// ------------------------------------------------------------
export async function sendAcademyRejection(enquiry: Enquiry, env: Env): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('academy_rejection', env);
  if (!template) {
    return { success: false, error: 'Template academy_rejection not found or inactive' };
  }

  const parentName = enquiry.name || 'there';
  // For on-behalf enquiries the note is "Enquiring about: <athlete name>"
  const noteMatch = enquiry.note?.match(/^Enquiring about:\s*(.+)$/i);
  const childName = noteMatch ? noteMatch[1].trim() : parentName;

  try {
    const html = renderTemplate(template.html, {
      parent_name: parentName,
      child_name: childName,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          parent_name: parentName,
          child_name: childName,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'academy_rejection',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendMembershipInvite
// Sent after a successful taster session attendance is recorded.
// Includes a one-time link to complete club membership.
// ------------------------------------------------------------
export async function sendMembershipInvite(
  enquiry: Enquiry,
  membershipToken: string,
  env: Env
): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('membership_invite', env);
  if (!template) {
    return { success: false, error: 'Template membership_invite not found or inactive' };
  }

  const siteUrl = getPublicSiteUrl(env);
  const membershipUrl = `${siteUrl}/join?token=${membershipToken}`;

  try {
    const html = renderTemplate(template.html, {
      contact_name: enquiry.name || 'there',
      membership_url: membershipUrl,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          contact_name: enquiry.name || 'there',
          membership_url: membershipUrl,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'membership_invite',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendBookingReminder
// Sent ~7 days before an upcoming session by the cron job.
// ------------------------------------------------------------
export async function sendBookingReminder(
  enquiry: Enquiry,
  booking: Booking,
  venueName: string,
  env: Env
): Promise<SendEmailResult> {
  const template = await getEmailTemplateByKey('booking_reminder', env);
  if (!template) {
    return { success: false, error: 'Template booking_reminder not found or inactive' };
  }

  const sessionTime = booking.session_time ?? '';
  const ageGroupLabel = (booking as unknown as Record<string, string>).age_group_label ?? '';

  try {
    const html = renderTemplate(template.html, {
      contact_name: enquiry.name || 'there',
      session_date: formatDateForDisplay(booking.session_date),
      session_time: sessionTime,
      age_group_label: ageGroupLabel,
      venue: venueName,
    });

    const text = template.text_content
      ? renderTemplate(template.text_content, {
          contact_name: enquiry.name || 'there',
          session_date: formatDateForDisplay(booking.session_date),
          session_time: sessionTime,
          age_group_label: ageGroupLabel,
          venue: venueName,
        })
      : undefined;

    return sendEmailWithRetry({ to: enquiry.email, subject: template.subject, html, text }, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_render_failed',
        key: 'booking_reminder',
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ============================================================
// EGAC Platform — Booking Business Logic
// src/lib/business/booking.ts
// ============================================================

import { validateSessionDate, isAgeGroupEligible, formatDateForDisplay } from './age.js';
import type { AgeGroupConfig } from './age.js';
import type { Enquiry, Booking } from '../db/schema.js';

export interface BookingSlotValidation {
  valid: boolean;
  reason?: string;
}

export interface BookingConfirmationData {
  sessionDate: string;
  sessionDateFormatted: string;
  sessionTime: string;
  ageGroupLabel: string;
  venueName: string;
  calendarUrl: string;
}

// ------------------------------------------------------------
// validateBookingRequest
// Validates a booking attempt against business rules.
// All age group config comes from D1 — nothing hardcoded.
// ------------------------------------------------------------
export function validateBookingRequest(
  sessionDateIso: string,
  dob: string | null,
  ageGroup: AgeGroupConfig
): BookingSlotValidation {
  // Must be a valid future session day for this age group
  if (!validateSessionDate(sessionDateIso, ageGroup)) {
    const validDays = JSON.parse(ageGroup.session_days ?? '["Tuesday"]').join(' or ');
    return {
      valid: false,
      reason: `Session must be a future ${validDays}`,
    };
  }

  // If we have a DOB, verify the athlete is in the correct age group
  if (dob) {
    if (!isAgeGroupEligible(dob, sessionDateIso, ageGroup)) {
      return {
        valid: false,
        reason: `Your child is not in the ${ageGroup.label} age group for this session date`,
      };
    }
  }

  return { valid: true };
}

// ------------------------------------------------------------
// buildBookingConfirmation
// Builds the data payload for the confirmation email and
// the API response. Includes a Google Calendar deep-link.
// ------------------------------------------------------------
export function buildBookingConfirmation(
  _enquiry: Pick<Enquiry, 'name' | 'email'>,
  booking: Pick<Booking, 'session_date' | 'session_time' | 'age_group_id'>,
  ageGroup: AgeGroupConfig,
  venueName: string,
  _siteUrl: string
): BookingConfirmationData {
  const sessionTime = booking.session_time ?? ageGroup.session_time ?? '18:30';

  const calendarUrl = buildGoogleCalendarUrl({
    title: `EGAC Taster Session — ${ageGroup.label}`,
    date: booking.session_date,
    time: sessionTime,
    durationMinutes: 60,
    location: venueName,
    description: `EGAC taster session for ${ageGroup.label}`,
  });

  return {
    sessionDate: booking.session_date,
    sessionDateFormatted: formatDateForDisplay(booking.session_date),
    sessionTime,
    ageGroupLabel: ageGroup.label,
    venueName,
    calendarUrl,
  };
}

// ------------------------------------------------------------
// buildAvailabilityList
// Returns a summary of remaining capacity per session date.
// ------------------------------------------------------------
export function buildAvailabilityList(
  dates: string[],
  bookedCountByDate: Record<string, number>,
  capacity: number
): Array<{ date: string; available: number; full: boolean }> {
  return dates.map((date) => {
    const booked = bookedCountByDate[date] ?? 0;
    const available = Math.max(0, capacity - booked);
    return { date, available, full: available === 0 };
  });
}

// ------------------------------------------------------------
// buildGoogleCalendarUrl
// ------------------------------------------------------------
function buildGoogleCalendarUrl(opts: {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string;
  description: string;
}): string {
  const [hours, minutes] = opts.time.split(':').map(Number);
  const startDate = new Date(`${opts.date}T${opts.time}:00`);
  const endDate = new Date(startDate.getTime() + opts.durationMinutes * 60 * 1000);

  const fmt = (d: Date): string => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    location: opts.location,
    details: opts.description,
  });

  // suppress unused variable warning — hours/minutes used implicitly via startDate
  void hours;
  void minutes;

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

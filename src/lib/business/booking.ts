// ============================================================
// EGAC Platform — Booking Business Logic
// src/lib/business/booking.ts
//
// Pure validation functions for the booking flow.
// All rules are enforced here before anything is written to D1.
// ============================================================

import {
  slotForDobOnDate,
  validateSessionDate,
  slotLabel,
  slotTime,
  formatDateForDisplay,
} from './age.js';
import type { Booking, Enquiry, SlotCode } from '../db/schema.js';

// ------------------------------------------------------------
// validateBookingSlot
// The core booking guard. Returns {valid: true} or
// {valid: false, reason: string}.
//
// Rules enforced (in order):
//   1. Session date must be a valid future Tuesday
//   2. Slot must be valid code
//   3. Capacity must not be exceeded
//   4. If enquiry has a DOB, slot must match age-derived slot
// ------------------------------------------------------------
export function validateBookingSlot(
  enquiry: { dob: string | null },
  sessionDate: string,
  slot: SlotCode,
  currentCount: number,
  maxCapacity: number,
  today: Date = new Date()
): { valid: boolean; reason?: string } {
  // 1. Valid future Tuesday
  if (!validateSessionDate(sessionDate, today)) {
    return {
      valid: false,
      reason: `Session date ${sessionDate} is not a valid future Tuesday`,
    };
  }

  // 2. Valid slot code
  if (slot !== 'u13' && slot !== 'u15plus') {
    return {
      valid: false,
      reason: `Slot must be 'u13' or 'u15plus', got '${slot}'`,
    };
  }

  // 3. Capacity check
  if (currentCount >= maxCapacity) {
    return {
      valid: false,
      reason: `The ${slotLabel(slot)} slot on ${sessionDate} is full (${maxCapacity}/${maxCapacity})`,
    };
  }

  // 4. Age-slot match (only enforced when DOB is known)
  if (enquiry.dob) {
    const requiredSlot = slotForDobOnDate(enquiry.dob, sessionDate);
    if (requiredSlot && requiredSlot !== slot) {
      return {
        valid: false,
        reason: `Based on date of birth, this athlete must attend the ${slotLabel(requiredSlot)} session, not ${slotLabel(slot)}`,
      };
    }
  }

  return { valid: true };
}

// ------------------------------------------------------------
// buildBookingConfirmation
// Assembles the data needed to send a booking confirmation email
// and generate a Google Calendar deep link.
// ------------------------------------------------------------
export interface BookingConfirmationData {
  contact_name: string;
  session_date: string; // YYYY-MM-DD
  session_date_display: string; // 'Tuesday, 15 April 2026'
  session_time: string; // '18:30'
  slot_label: string; // 'U13 (Tuesday 18:30)'
  venue: string;
  add_to_calendar_url: string;
}

export function buildBookingConfirmation(
  enquiry: Pick<Enquiry, 'name' | 'email'>,
  booking: Pick<Booking, 'session_date' | 'slot'>,
  venueName: string,
  _siteUrl: string
): BookingConfirmationData {
  const slot = booking.slot as SlotCode;
  const time = slotTime(slot);
  const label = slotLabel(slot);
  const dateDisplay = formatDateForDisplay(booking.session_date);

  // Google Calendar deep link
  // Dates in YYYYMMDDTHHMMSS format (local time, no Z suffix)
  const [year, month, day] = booking.session_date.split('-');
  const [hour, minute] = time.split(':');
  const startDt = `${year}${month}${day}T${hour}${minute}00`;
  // Session is 1 hour
  const endHour = String(parseInt(hour, 10) + 1).padStart(2, '0');
  const endDt = `${year}${month}${day}T${endHour}${minute}00`;

  const calParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'EGAC Taster Session',
    dates: `${startDt}/${endDt}`,
    details: `Your EGAC taster session — ${label}`,
    location: venueName,
  });

  return {
    contact_name: enquiry.name || 'there',
    session_date: booking.session_date,
    session_date_display: dateDisplay,
    session_time: time,
    slot_label: label,
    venue: venueName,
    add_to_calendar_url: `https://calendar.google.com/calendar/render?${calParams.toString()}`,
  };
}

// ------------------------------------------------------------
// buildAvailabilityList
// Takes raw booking counts per date/slot and returns a
// structured availability object for the booking page UI.
// ------------------------------------------------------------
export interface SlotAvailability {
  available: boolean;
  remaining: number;
  total: number;
}

export interface DateAvailability {
  date: string;
  date_display: string;
  slots: {
    u13: SlotAvailability;
    u15plus: SlotAvailability;
  };
}

export function buildAvailabilityList(
  dates: string[],
  counts: Record<string, { u13: number; u15plus: number }>,
  maxCapacity: number
): DateAvailability[] {
  return dates.map((date) => {
    const c = counts[date] ?? { u13: 0, u15plus: 0 };
    return {
      date,
      date_display: formatDateForDisplay(date),
      slots: {
        u13: {
          available: c.u13 < maxCapacity,
          remaining: Math.max(0, maxCapacity - c.u13),
          total: maxCapacity,
        },
        u15plus: {
          available: c.u15plus < maxCapacity,
          remaining: Math.max(0, maxCapacity - c.u15plus),
          total: maxCapacity,
        },
      },
    };
  });
}

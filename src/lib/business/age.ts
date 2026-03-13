// ============================================================
// EGAC Platform — Age & Slot Business Logic
// src/lib/business/age.ts
//
// Pure functions. No I/O, no env, no database.
// These are the canonical source of truth for all age-related
// rules in the system. Import and call — never re-implement.
// ============================================================

// ------------------------------------------------------------
// Constants
// The age boundary below which an athlete goes in the U13 slot.
// Default is 13 — athletes aged 11 or 12 are U13,
// athletes aged 13+ are U15+.
// Exported so tests can assert against the exact value.
// ------------------------------------------------------------
export const DEFAULT_AGE_BOUNDARY_FOR_U15 = 13;
export const DEFAULT_ACADEMY_MAX_AGE = 10;
export const ACADEMY_INTAKE_DATE = '2026-08-31';
export const SESSION_DAY_OF_WEEK = 2; // Tuesday (0=Sun, 1=Mon, 2=Tue...)

// ------------------------------------------------------------
// computeAgeOnDate
// Returns the athlete's age in whole years on a given date.
// Returns null if dob is blank, null, or unparseable.
//
// Example: dob='2013-06-15', date='2026-08-31' → 13
// ------------------------------------------------------------
export function computeAgeOnDate(
  dobIso: string | null | undefined,
  dateIso: string
): number | null {
  if (!dobIso || !dobIso.trim()) return null;

  const dob = new Date(dobIso);
  const at = new Date(dateIso);

  if (isNaN(dob.getTime()) || isNaN(at.getTime())) return null;

  let age = at.getFullYear() - dob.getFullYear();

  // Subtract one if the birthday hasn't occurred yet in the target year
  const monthDiff = at.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

// ------------------------------------------------------------
// slotForAge
// Returns the training slot code for a given age.
// Returns null if age is null (no DOB provided).
//
// Rule: age < ageBoundary → 'u13', else → 'u15plus'
// Default boundary is 13.
// ------------------------------------------------------------
export function slotForAge(
  age: number | null,
  ageBoundary = DEFAULT_AGE_BOUNDARY_FOR_U15
): 'u13' | 'u15plus' | null {
  if (age === null || age === undefined) return null;
  return age < ageBoundary ? 'u13' : 'u15plus';
}

// ------------------------------------------------------------
// slotForDobOnDate
// Convenience — combines computeAgeOnDate + slotForAge.
// ------------------------------------------------------------
export function slotForDobOnDate(
  dobIso: string | null | undefined,
  sessionDateIso: string,
  ageBoundary = DEFAULT_AGE_BOUNDARY_FOR_U15
): 'u13' | 'u15plus' | null {
  const age = computeAgeOnDate(dobIso, sessionDateIso);
  return slotForAge(age, ageBoundary);
}

// ------------------------------------------------------------
// isAcademyEligible
// Returns true if the athlete will be <= maxAge on the intake date.
// Used to route enquiries to the academy waiting list.
//
// Rule: age at intake <= academyMaxAge → academy path
// ------------------------------------------------------------
export function isAcademyEligible(
  dobIso: string | null | undefined,
  intakeDate: string = ACADEMY_INTAKE_DATE,
  maxAge: number = DEFAULT_ACADEMY_MAX_AGE
): boolean {
  const age = computeAgeOnDate(dobIso, intakeDate);
  if (age === null) return false;
  return age <= maxAge;
}

// ------------------------------------------------------------
// getNextNTuesdayDates
// Returns the next N upcoming Tuesday dates as YYYY-MM-DD strings.
// Starts from tomorrow (never returns today even if today is Tuesday).
// Used to populate the booking date picker.
// ------------------------------------------------------------
export function getNextNTuesdayDates(n: number, fromDate: Date = new Date()): string[] {
  const dates: string[] = [];
  const cursor = new Date(fromDate);

  // Start from tomorrow
  cursor.setDate(cursor.getDate() + 1);

  while (dates.length < n) {
    if (cursor.getDay() === SESSION_DAY_OF_WEEK) {
      dates.push(toIsoDateString(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

// ------------------------------------------------------------
// validateSessionDate
// Returns true if the date string is:
//   1. A valid date
//   2. A Tuesday
//   3. In the future (strictly after today)
// ------------------------------------------------------------
export function validateSessionDate(dateIso: string, today: Date = new Date()): boolean {
  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return false;

  // Must be a Tuesday
  if (date.getDay() !== SESSION_DAY_OF_WEEK) return false;

  // Must be strictly in the future (after today, not equal)
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date > todayMidnight;
}

// ------------------------------------------------------------
// slotLabel
// Returns the human-readable label for a slot code.
// Kept here so it's consistent everywhere (emails, UI, reports).
// ------------------------------------------------------------
export function slotLabel(slot: 'u13' | 'u15plus'): string {
  return slot === 'u13' ? 'U13 (Tuesday 18:30)' : 'U15+ (Tuesday 19:30)';
}

export function slotTime(slot: 'u13' | 'u15plus'): string {
  return slot === 'u13' ? '18:30' : '19:30';
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
export function toIsoDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDateForDisplay(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

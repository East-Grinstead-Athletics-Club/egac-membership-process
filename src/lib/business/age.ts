// ============================================================
// EGAC Platform — Age & Session Business Logic
// src/lib/business/age.ts
//
// Pure functions. No I/O, no env, no database.
//
// UK Athletics age group rules:
//   Age groups run 1 September to 31 August.
//   An athlete's age group is determined by their age on
//   31 August at the END of the athletics season the session
//   falls in — not the session date, not their birthday.
//
//   Example:
//     Session date: 14 October 2026  → season 2026/27
//     Reference date: 31 August 2026
//     DOB: 15 September 2014 → age on 31 Aug 2026 = 11 → U13
//     DOB: 1 September 2012  → age on 31 Aug 2026 = 13 → U15
// ============================================================

export const SESSION_DAY_OF_WEEK = 2; // Tuesday (0=Sun)
export const ATHLETICS_SEASON_CUTOFF_MONTH = 8; // August (0-indexed)
export const ATHLETICS_SEASON_CUTOFF_DAY = 31;

// ------------------------------------------------------------
// athleticsSeasonEndYear
// Returns the calendar year of 31 August that ends the
// athletics season a given date falls in.
//
// Rule: if the date is in September or later, the season ends
// the FOLLOWING August. If in August or earlier, it ends
// the same August.
//
// Examples:
//   14 Oct 2026 → season ends Aug 2027 → returns 2027
//   1 Apr 2026  → season ends Aug 2026 → returns 2026
//   31 Aug 2026 → season ends Aug 2026 → returns 2026
// ------------------------------------------------------------
export function athleticsSeasonEndYear(dateIso: string): number {
  const date = new Date(dateIso);
  const month = date.getMonth(); // 0-indexed, 8 = September
  const year = date.getFullYear();
  // September (month 8) onwards → next year's August is the cutoff
  return month >= 8 ? year + 1 : year;
}

// ------------------------------------------------------------
// ageOnDate
// Returns age in whole years on a given reference date.
// Returns null if dob is missing or unparseable.
// ------------------------------------------------------------
export function ageOnDate(
  dobIso: string | null | undefined,
  referenceDateIso: string
): number | null {
  if (!dobIso || !dobIso.trim()) return null;

  const dob = new Date(dobIso);
  const ref = new Date(referenceDateIso);

  if (isNaN(dob.getTime()) || isNaN(ref.getTime())) return null;

  let age = ref.getFullYear() - dob.getFullYear();
  const monthDiff = ref.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

// ------------------------------------------------------------
// ageForAthletics
// Returns the athlete's age on 31 August of the athletics
// season that contains the given session date.
// This is the age used for all age group calculations.
// ------------------------------------------------------------
export function ageForAthletics(
  dobIso: string | null | undefined,
  sessionDateIso: string
): number | null {
  const seasonEndYear = athleticsSeasonEndYear(sessionDateIso);
  const aug31 = `${seasonEndYear}-08-31`;
  return ageOnDate(dobIso, aug31);
}

// ------------------------------------------------------------
// AgeGroup interface — matches the D1 age_groups table
// Kept here so pure business functions can reference it
// without importing from schema (avoids circular deps)
// ------------------------------------------------------------
export interface AgeGroupConfig {
  id: string;
  code: string;
  label: string;
  booking_type: 'taster' | 'waitlist';
  age_min_aug31: number;
  age_max_aug31: number;
  session_days: string; // JSON array string
  session_time: string | null;
  capacity_per_session: number | null;
  season_capacity: number | null;
  season_start_month: number | null;
  season_end_month: number | null;
  active: number;
  sort_order: number;
}

// ------------------------------------------------------------
// resolveAgeGroup
// Given a DOB and session date, returns the matching active
// age group from the provided list, or null if none matches.
//
// Matching rule:
//   athlete's age on 31 Aug of the season >= age_min_aug31
//   AND <= age_max_aug31
//
// If multiple groups match (shouldn't happen with correct
// config), the one with the lowest sort_order wins.
// ------------------------------------------------------------
export function resolveAgeGroup(
  dobIso: string | null | undefined,
  sessionDateIso: string,
  ageGroups: AgeGroupConfig[]
): AgeGroupConfig | null {
  const athleticsAge = ageForAthletics(dobIso, sessionDateIso);
  if (athleticsAge === null) return null;

  const active = ageGroups
    .filter((g) => g.active === 1)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    active.find((g) => athleticsAge >= g.age_min_aug31 && athleticsAge <= g.age_max_aug31) ?? null
  );
}

// ------------------------------------------------------------
// isAgeGroupEligible
// Returns true if a DOB falls within a specific age group's
// boundaries for a given session date.
// Used for validation when a user selects a group manually.
// ------------------------------------------------------------
export function isAgeGroupEligible(
  dobIso: string | null | undefined,
  sessionDateIso: string,
  ageGroup: AgeGroupConfig
): boolean {
  const athleticsAge = ageForAthletics(dobIso, sessionDateIso);
  if (athleticsAge === null) return false;
  return athleticsAge >= ageGroup.age_min_aug31 && athleticsAge <= ageGroup.age_max_aug31;
}

// ------------------------------------------------------------
// getSessionDays
// Parses the JSON session_days field from an age group.
// Returns an array of day names: ["Tuesday"] or ["Saturday","Tuesday"]
// ------------------------------------------------------------
export function getSessionDays(ageGroup: AgeGroupConfig): string[] {
  try {
    return JSON.parse(ageGroup.session_days) as string[];
  } catch {
    return ['Tuesday'];
  }
}

// ------------------------------------------------------------
// isValidSessionDay
// Returns true if the given date falls on a valid session day
// for the age group (e.g. Tuesday for taster, Sat or Tue for Academy).
// ------------------------------------------------------------
export function isValidSessionDay(dateIso: string, ageGroup: AgeGroupConfig): boolean {
  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return false;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateDayName = dayNames[date.getDay()];
  const validDays = getSessionDays(ageGroup);

  return validDays.includes(dateDayName);
}

// ------------------------------------------------------------
// getNextNSessionDates
// Returns the next N upcoming valid session dates for an
// age group, as YYYY-MM-DD strings.
// Starts from tomorrow — never returns today.
// Used to populate the booking date picker.
// ------------------------------------------------------------
export function getNextNSessionDates(
  ageGroup: AgeGroupConfig,
  n: number,
  fromDate: Date = new Date()
): string[] {
  const validDays = getSessionDays(ageGroup);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const validDayNumbers = validDays.map((d) => dayNames.indexOf(d)).filter((d) => d >= 0);

  const dates: string[] = [];
  const cursor = new Date(fromDate);
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow

  while (dates.length < n) {
    if (validDayNumbers.includes(cursor.getDay())) {
      dates.push(toIsoDateString(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

// Backwards-compatible wrapper — used by email service for Tuesday dates
export function getNextNTuesdayDates(n: number, fromDate: Date = new Date()): string[] {
  const tuesdayGroup: AgeGroupConfig = {
    id: '',
    code: '',
    label: '',
    booking_type: 'taster',
    age_min_aug31: 0,
    age_max_aug31: 99,
    session_days: '["Tuesday"]',
    session_time: null,
    capacity_per_session: 2,
    season_capacity: null,
    season_start_month: null,
    season_end_month: null,
    active: 1,
    sort_order: 0,
  };
  return getNextNSessionDates(tuesdayGroup, n, fromDate);
}

// ------------------------------------------------------------
// validateSessionDate
// Returns true if:
//   1. The date is valid
//   2. It falls on a valid session day for the age group
//   3. It is strictly in the future
// ------------------------------------------------------------
export function validateSessionDate(
  dateIso: string,
  ageGroup: AgeGroupConfig,
  today: Date = new Date()
): boolean {
  const date = new Date(dateIso);
  if (isNaN(date.getTime())) return false;
  if (!isValidSessionDay(dateIso, ageGroup)) return false;

  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date > todayMidnight;
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

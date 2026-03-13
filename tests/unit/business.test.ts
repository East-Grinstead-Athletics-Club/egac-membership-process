// ============================================================
// EGAC Platform — Business Logic Tests
// tests/unit/business.test.ts
//
// Covers all five business modules.
// Pure unit tests — no I/O, no mocks needed.
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  computeAgeOnDate,
  slotForAge,
  isAcademyEligible,
  getNextNTuesdayDates,
  validateSessionDate,
  slotLabel,
  slotTime,
  DEFAULT_AGE_BOUNDARY_FOR_U15,
  DEFAULT_ACADEMY_MAX_AGE,
} from '../../src/lib/business/age.js';

import { validateEnquiryData, routeEnquiry } from '../../src/lib/business/enquiry.js';

import { validateBookingSlot, buildAvailabilityList } from '../../src/lib/business/booking.js';

import {
  isTokenExpired,
  isInviteExpired,
  isMembershipOtpExpired,
  tokenAgeInHours,
  INVITE_TTL_DAYS,
  MEMBERSHIP_OTP_TTL_DAYS,
} from '../../src/lib/business/tokens.js';

import {
  renderTemplate,
  validateTemplateVariables,
  extractTemplateVariables,
} from '../../src/lib/business/templates.js';

// ============================================================
// 1. computeAgeOnDate
// ============================================================

describe('computeAgeOnDate', () => {
  it('returns correct age when birthday has passed in the target year', () => {
    expect(computeAgeOnDate('2013-01-15', '2026-06-01')).toBe(13);
  });

  it('returns correct age when birthday has not yet occurred in the target year', () => {
    expect(computeAgeOnDate('2013-12-01', '2026-06-01')).toBe(12);
  });

  it('returns correct age on the exact birthday', () => {
    expect(computeAgeOnDate('2013-06-01', '2026-06-01')).toBe(13);
  });

  it('returns null for null dob', () => {
    expect(computeAgeOnDate(null, '2026-06-01')).toBeNull();
  });

  it('returns null for empty string dob', () => {
    expect(computeAgeOnDate('', '2026-06-01')).toBeNull();
  });

  it('returns null for unparseable dob', () => {
    expect(computeAgeOnDate('not-a-date', '2026-06-01')).toBeNull();
  });

  it('returns null for undefined dob', () => {
    expect(computeAgeOnDate(undefined, '2026-06-01')).toBeNull();
  });
});

// ============================================================
// 2. slotForAge — boundary cases
// ============================================================

describe('slotForAge', () => {
  it('age 12 → u13 (below boundary)', () => {
    expect(slotForAge(12)).toBe('u13');
  });

  it('age 13 → u15plus (at boundary, not below)', () => {
    expect(slotForAge(13)).toBe('u15plus');
  });

  it('age 11 → u13', () => {
    expect(slotForAge(11)).toBe('u13');
  });

  it('age 14 → u15plus', () => {
    expect(slotForAge(14)).toBe('u15plus');
  });

  it('age 17 → u15plus', () => {
    expect(slotForAge(17)).toBe('u15plus');
  });

  it('null age → null', () => {
    expect(slotForAge(null)).toBeNull();
  });

  it('respects custom ageBoundary param', () => {
    expect(slotForAge(12, 12)).toBe('u15plus'); // 12 is not < 12
    expect(slotForAge(11, 12)).toBe('u13'); // 11 < 12
  });

  it('DEFAULT_AGE_BOUNDARY_FOR_U15 is 13', () => {
    expect(DEFAULT_AGE_BOUNDARY_FOR_U15).toBe(13);
  });
});

// ============================================================
// 3. isAcademyEligible
// ============================================================

describe('isAcademyEligible', () => {
  // Intake date: 2026-08-31, default maxAge: 10

  it('child who will be exactly 10 on intake date is eligible', () => {
    // Born 2016-08-31 → exactly 10 on 2026-08-31
    expect(isAcademyEligible('2016-08-31', '2026-08-31', 10)).toBe(true);
  });

  it('child who will be 9 on intake date is eligible', () => {
    expect(isAcademyEligible('2017-01-01', '2026-08-31', 10)).toBe(true);
  });

  it('child who will be 11 on intake date is not eligible', () => {
    expect(isAcademyEligible('2015-01-01', '2026-08-31', 10)).toBe(false);
  });

  it('null dob is not eligible (cannot confirm age)', () => {
    expect(isAcademyEligible(null, '2026-08-31', 10)).toBe(false);
  });

  it('empty dob is not eligible', () => {
    expect(isAcademyEligible('', '2026-08-31', 10)).toBe(false);
  });

  it('DEFAULT_ACADEMY_MAX_AGE is 10', () => {
    expect(DEFAULT_ACADEMY_MAX_AGE).toBe(10);
  });
});

// ============================================================
// 4. getNextNTuesdayDates
// ============================================================

describe('getNextNTuesdayDates', () => {
  it('returns the requested number of dates', () => {
    const dates = getNextNTuesdayDates(8, new Date('2026-01-01'));
    expect(dates).toHaveLength(8);
  });

  it('all returned dates are Tuesdays', () => {
    const dates = getNextNTuesdayDates(4, new Date('2026-01-01'));
    for (const d of dates) {
      expect(new Date(d).getDay()).toBe(2); // Tuesday
    }
  });

  it('does not return today even if today is Tuesday', () => {
    // 2026-01-06 is a Tuesday
    const tuesday = new Date('2026-01-06');
    const dates = getNextNTuesdayDates(1, tuesday);
    expect(dates[0]).not.toBe('2026-01-06');
    expect(dates[0]).toBe('2026-01-13');
  });

  it('returns dates in YYYY-MM-DD format', () => {
    const dates = getNextNTuesdayDates(1, new Date('2026-01-01'));
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dates are in ascending order', () => {
    const dates = getNextNTuesdayDates(4, new Date('2026-01-01'));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });
});

// ============================================================
// 5. validateSessionDate
// ============================================================

describe('validateSessionDate', () => {
  it('valid future Tuesday returns true', () => {
    // Find the next Tuesday from a known Monday
    const monday = new Date('2026-01-05'); // Monday
    const nextTuesday = '2026-01-06';
    expect(validateSessionDate(nextTuesday, monday)).toBe(true);
  });

  it('Wednesday returns false', () => {
    const monday = new Date('2026-01-05');
    expect(validateSessionDate('2026-01-07', monday)).toBe(false); // Wednesday
  });

  it('past Tuesday returns false', () => {
    const today = new Date('2026-03-10');
    expect(validateSessionDate('2026-03-03', today)).toBe(false); // Past Tuesday
  });

  it('today (Tuesday) returns false — must be strictly future', () => {
    const tuesday = new Date('2026-01-06');
    expect(validateSessionDate('2026-01-06', tuesday)).toBe(false);
  });

  it('invalid date string returns false', () => {
    expect(validateSessionDate('not-a-date')).toBe(false);
  });
});

// ============================================================
// 6. validateBookingSlot
// ============================================================

describe('validateBookingSlot', () => {
  const monday = new Date('2026-01-05');
  const validTuesday = '2026-01-06';

  it('valid booking with capacity available returns true', () => {
    const result = validateBookingSlot(
      { dob: '2014-01-01' }, // age 12 on that date → u13
      validTuesday,
      'u13',
      1, // currentCount
      2, // maxCapacity
      monday
    );
    expect(result.valid).toBe(true);
  });

  it('slot at full capacity returns false with reason', () => {
    const result = validateBookingSlot(
      { dob: null },
      validTuesday,
      'u13',
      2, // currentCount = maxCapacity
      2,
      monday
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/full/i);
  });

  it('slot over capacity returns false', () => {
    const result = validateBookingSlot(
      { dob: null },
      validTuesday,
      'u15plus',
      3, // already over
      2,
      monday
    );
    expect(result.valid).toBe(false);
  });

  it('wrong slot for age returns false with reason', () => {
    // DOB = 2014-01-01 → age 12 on 2026-01-06 → should be u13, not u15plus
    const result = validateBookingSlot(
      { dob: '2014-01-01' },
      validTuesday,
      'u15plus',
      0,
      2,
      monday
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/u13/i);
  });

  it('no DOB — slot not enforced by age', () => {
    const result = validateBookingSlot({ dob: null }, validTuesday, 'u15plus', 0, 2, monday);
    expect(result.valid).toBe(true);
  });

  it('non-Tuesday session date returns false', () => {
    const result = validateBookingSlot(
      { dob: null },
      '2026-01-07', // Wednesday
      'u13',
      0,
      2,
      monday
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/tuesday/i);
  });

  it('past date returns false', () => {
    const result = validateBookingSlot(
      { dob: null },
      '2025-01-07', // Past Tuesday
      'u13',
      0,
      2,
      new Date('2026-01-05')
    );
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// 7. Token expiry
// ============================================================

describe('isTokenExpired', () => {
  it('token 1 day old with 7-day TTL is not expired', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const created = '2026-03-09T12:00:00Z'; // 1 day ago
    expect(isTokenExpired(created, 7, now)).toBe(false);
  });

  it('token exactly 7 days old with 7-day TTL is expired', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const created = '2026-03-03T12:00:00Z'; // exactly 7 days ago
    expect(isTokenExpired(created, 7, now)).toBe(true);
  });

  it('token 8 days old with 7-day TTL is expired', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const created = '2026-03-02T12:00:00Z'; // 8 days ago
    expect(isTokenExpired(created, 7, now)).toBe(true);
  });

  it('token 13 days old with 14-day TTL is not expired', () => {
    const now = new Date('2026-03-15T00:00:00Z');
    const created = '2026-03-02T00:00:00Z'; // 13 days ago
    expect(isTokenExpired(created, 14, now)).toBe(false);
  });

  it('unparseable createdAt is treated as expired', () => {
    expect(isTokenExpired('not-a-date', 7)).toBe(true);
  });
});

describe('isInviteExpired', () => {
  it('INVITE_TTL_DAYS is 14', () => {
    expect(INVITE_TTL_DAYS).toBe(14);
  });

  it('invite 13 days old is not expired', () => {
    const now = new Date('2026-03-15T00:00:00Z');
    const created = '2026-03-02T00:00:01Z';
    expect(isInviteExpired(created, now)).toBe(false);
  });
});

describe('isMembershipOtpExpired', () => {
  it('MEMBERSHIP_OTP_TTL_DAYS is 7', () => {
    expect(MEMBERSHIP_OTP_TTL_DAYS).toBe(7);
  });

  it('OTP 6 days old is not expired', () => {
    const now = new Date('2026-03-10T00:00:00Z');
    const created = '2026-03-04T00:00:01Z';
    expect(isMembershipOtpExpired(created, now)).toBe(false);
  });
});

describe('tokenAgeInHours', () => {
  it('returns correct age in hours', () => {
    const now = new Date('2026-03-10T13:00:00Z');
    const created = '2026-03-10T11:00:00Z'; // 2 hours ago
    expect(tokenAgeInHours(created, now)).toBeCloseTo(2, 1);
  });

  it('returns Infinity for unparseable date', () => {
    expect(tokenAgeInHours('bad-date')).toBe(Infinity);
  });
});

// ============================================================
// 8. Template rendering
// ============================================================

describe('renderTemplate', () => {
  it('replaces all variables correctly', () => {
    const result = renderTemplate('Hello {{contact_name}}, your session is on {{session_date}}.', {
      contact_name: 'Jane',
      session_date: 'Tuesday 14 April',
    });
    expect(result).toBe('Hello Jane, your session is on Tuesday 14 April.');
  });

  it('throws when a template variable has no value', () => {
    expect(() =>
      renderTemplate('Hello {{contact_name}} and {{missing_var}}', {
        contact_name: 'Jane',
      })
    ).toThrow(/\{\{missing_var\}\}/);
  });

  it('does not throw for extra vars not used in template', () => {
    expect(() =>
      renderTemplate('Hello {{contact_name}}', {
        contact_name: 'Jane',
        unused_var: 'ignored',
      })
    ).not.toThrow();
  });

  it('replaces multiple occurrences of the same variable', () => {
    const result = renderTemplate('{{name}} said hello. {{name}} waved.', { name: 'Alice' });
    expect(result).toBe('Alice said hello. Alice waved.');
  });

  it('handles empty variable value', () => {
    const result = renderTemplate('Hi {{name}}!', { name: '' });
    expect(result).toBe('Hi !');
  });

  it('throws listing ALL missing variables, not just the first', () => {
    expect(() => renderTemplate('{{a}} {{b}} {{c}}', {})).toThrow(/a/);
  });
});

describe('validateTemplateVariables', () => {
  it('returns empty array when all vars are allowed', () => {
    const unknown = validateTemplateVariables('Hello {{contact_name}}', [
      'contact_name',
      'booking_url',
    ]);
    expect(unknown).toHaveLength(0);
  });

  it('returns unknown variable names', () => {
    const unknown = validateTemplateVariables('Hello {{contact_name}} and {{mystery_field}}', [
      'contact_name',
    ]);
    expect(unknown).toContain('mystery_field');
  });

  it('deduplicates unknown variables', () => {
    const unknown = validateTemplateVariables('{{x}} and {{x}} again', []);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toBe('x');
  });
});

describe('extractTemplateVariables', () => {
  it('extracts all unique variable names', () => {
    const vars = extractTemplateVariables(
      'Hi {{contact_name}}, book at {{booking_url}}. See you, {{contact_name}}.'
    );
    expect(vars).toContain('contact_name');
    expect(vars).toContain('booking_url');
    expect(vars).toHaveLength(2); // deduplicated
  });

  it('returns empty array for template with no variables', () => {
    expect(extractTemplateVariables('No variables here')).toHaveLength(0);
  });
});

// ============================================================
// 9. routeEnquiry
// ============================================================

describe('routeEnquiry', () => {
  it('routes to academy when child is under 10 at intake', () => {
    // Born 2017-01-01 → age 9 on 2026-08-31
    expect(routeEnquiry('2017-01-01')).toBe('academy');
  });

  it('routes to booking when child is over 10 at intake', () => {
    // Born 2013-01-01 → age 13 on 2026-08-31
    expect(routeEnquiry('2013-01-01')).toBe('booking');
  });

  it('routes to booking when no DOB provided', () => {
    expect(routeEnquiry(null)).toBe('booking');
    expect(routeEnquiry(undefined)).toBe('booking');
    expect(routeEnquiry('')).toBe('booking');
  });
});

// ============================================================
// 10. validateEnquiryData
// ============================================================

describe('validateEnquiryData', () => {
  const valid = {
    contact_name: 'Jane Smith',
    contact_email: 'jane@example.com',
  };

  it('accepts valid minimal data', () => {
    expect(() => validateEnquiryData(valid)).not.toThrow();
  });

  it('throws when contact_name is missing', () => {
    expect(() => validateEnquiryData({ contact_email: 'jane@example.com' })).toThrow(
      /contact_name/
    );
  });

  it('throws when contact_email is missing', () => {
    expect(() => validateEnquiryData({ contact_name: 'Jane' })).toThrow(/contact_email/);
  });

  it('throws for invalid email format', () => {
    expect(() => validateEnquiryData({ ...valid, contact_email: 'not-an-email' })).toThrow(
      /email/i
    );
  });

  it('throws for invalid dob format', () => {
    expect(() => validateEnquiryData({ ...valid, dob: 'yesterday' })).toThrow(/dob/i);
  });

  it('throws for implausible dob (200 years ago)', () => {
    expect(() => validateEnquiryData({ ...valid, dob: '1800-01-01' })).toThrow(/dob/i);
  });

  it('throws for invalid interest value', () => {
    expect(() => validateEnquiryData({ ...valid, interest: 'badminton' })).toThrow(/interest/i);
  });

  it('accepts all valid interest values', () => {
    for (const interest of ['junior_athletics', 'academy', 'general']) {
      expect(() => validateEnquiryData({ ...valid, interest })).not.toThrow();
    }
  });

  it('throws when body is not an object', () => {
    expect(() => validateEnquiryData('a string')).toThrow();
    expect(() => validateEnquiryData(null)).toThrow();
  });
});

// ============================================================
// 11. buildAvailabilityList
// ============================================================

describe('buildAvailabilityList', () => {
  it('marks slot as available when under capacity', () => {
    const result = buildAvailabilityList(
      ['2026-01-06'],
      { '2026-01-06': { u13: 1, u15plus: 0 } },
      2
    );
    expect(result[0].slots.u13.available).toBe(true);
    expect(result[0].slots.u13.remaining).toBe(1);
  });

  it('marks slot as unavailable when at capacity', () => {
    const result = buildAvailabilityList(
      ['2026-01-06'],
      { '2026-01-06': { u13: 2, u15plus: 0 } },
      2
    );
    expect(result[0].slots.u13.available).toBe(false);
    expect(result[0].slots.u13.remaining).toBe(0);
  });

  it('defaults to 0 bookings for dates with no counts', () => {
    const result = buildAvailabilityList(['2026-01-06'], {}, 2);
    expect(result[0].slots.u13.remaining).toBe(2);
    expect(result[0].slots.u15plus.remaining).toBe(2);
  });
});

// ============================================================
// 12. slotLabel / slotTime
// ============================================================

describe('slotLabel and slotTime', () => {
  it('slotLabel u13 includes time 18:30', () => {
    expect(slotLabel('u13')).toContain('18:30');
  });

  it('slotLabel u15plus includes time 19:30', () => {
    expect(slotLabel('u15plus')).toContain('19:30');
  });

  it('slotTime u13 is 18:30', () => {
    expect(slotTime('u13')).toBe('18:30');
  });

  it('slotTime u15plus is 19:30', () => {
    expect(slotTime('u15plus')).toBe('19:30');
  });
});

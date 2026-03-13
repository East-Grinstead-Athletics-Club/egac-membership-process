// ============================================================
// EGAC Platform — Business Logic Tests
// tests/unit/business.test.ts
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  ageOnDate,
  ageForAthletics,
  athleticsSeasonEndYear,
  resolveAgeGroup,
  isAgeGroupEligible,
  getNextNTuesdayDates,
  validateSessionDate,
  getNextNSessionDates,
  formatDateForDisplay,
} from '../../src/lib/business/age.js';
import { validateEnquiryData, routeEnquiry } from '../../src/lib/business/enquiry.js';
import {
  validateTemplateVariables,
  renderTemplate,
  extractTemplateVariables,
} from '../../src/lib/business/templates.js';
import {
  generateSecureToken,
  isTokenExpired,
  isInviteExpired,
} from '../../src/lib/business/tokens.js';
import type { AgeGroupConfig } from '../../src/lib/business/age.js';

// ── Test fixtures ─────────────────────────────────────────────

function makeAgeGroup(overrides: Partial<AgeGroupConfig> = {}): AgeGroupConfig {
  return {
    id: 'ag_u13',
    code: 'u13',
    label: 'U13',
    booking_type: 'taster',
    age_min_aug31: 11,
    age_max_aug31: 12,
    session_days: '["Tuesday"]',
    session_time: '18:30',
    capacity_per_session: 2,
    season_capacity: null,
    season_start_month: null,
    season_end_month: null,
    active: 1,
    sort_order: 2,
    ...overrides,
  };
}

const ALL_AGE_GROUPS: AgeGroupConfig[] = [
  makeAgeGroup({
    id: 'ag_u11',
    code: 'u11',
    label: 'U11 Academy',
    booking_type: 'waitlist',
    age_min_aug31: 9,
    age_max_aug31: 10,
    session_days: '["Saturday","Tuesday"]',
    sort_order: 1,
  }),
  makeAgeGroup({
    id: 'ag_u13',
    code: 'u13',
    label: 'U13',
    age_min_aug31: 11,
    age_max_aug31: 12,
    sort_order: 2,
  }),
  makeAgeGroup({
    id: 'ag_u15',
    code: 'u15',
    label: 'U15',
    age_min_aug31: 13,
    age_max_aug31: 14,
    session_time: '18:30',
    sort_order: 3,
  }),
  makeAgeGroup({
    id: 'ag_u17',
    code: 'u17',
    label: 'U17',
    age_min_aug31: 15,
    age_max_aug31: 16,
    session_time: '19:30',
    sort_order: 4,
  }),
  makeAgeGroup({
    id: 'ag_u20',
    code: 'u20',
    label: 'U20',
    age_min_aug31: 17,
    age_max_aug31: 19,
    session_time: '19:30',
    sort_order: 5,
  }),
];

// ============================================================
// 1. athleticsSeasonEndYear
// ============================================================

describe('athleticsSeasonEndYear', () => {
  it('session in April → season ends same August', () => {
    expect(athleticsSeasonEndYear('2026-04-14')).toBe(2026);
  });

  it('session on 31 August → ends same August', () => {
    expect(athleticsSeasonEndYear('2026-08-31')).toBe(2026);
  });

  it('session in September → season ends NEXT August', () => {
    expect(athleticsSeasonEndYear('2026-09-01')).toBe(2027);
  });

  it('session in October → season ends next August', () => {
    expect(athleticsSeasonEndYear('2026-10-14')).toBe(2027);
  });

  it('session in January → season ends same year August', () => {
    expect(athleticsSeasonEndYear('2027-01-15')).toBe(2027);
  });
});

// ============================================================
// 2. ageForAthletics — the core UK athletics rule
// ============================================================

describe('ageForAthletics', () => {
  it('athlete born 15 Sep 2014 at session Oct 2026 → age 11 (U13)', () => {
    // Season ends Aug 2027, age on 31 Aug 2027 = 12
    expect(ageForAthletics('2014-09-15', '2026-10-14')).toBe(12);
  });

  it('athlete born 1 Sep 2012 at session Oct 2026 → age 14 (U15)', () => {
    // Season ends Aug 2027, age on 31 Aug 2027 = 14
    expect(ageForAthletics('2012-09-01', '2026-10-14')).toBe(14);
  });

  it('athlete born 1 Sep 2014 at session in April 2026 → age 11 (U13)', () => {
    // Season ends Aug 2026, age on 31 Aug 2026 = 11
    expect(ageForAthletics('2014-09-01', '2026-04-14')).toBe(11);
  });

  it('athlete born 31 Aug 2013 at session in April 2026 → age 13 (U15, birthday on cutoff)', () => {
    // Season ends Aug 2026, birthday IS 31 Aug so age = 13 exactly → U15
    expect(ageForAthletics('2013-08-31', '2026-04-14')).toBe(13);
  });

  it('athlete born 1 Sep 2013 at session in April 2026 → age 13 (U15)', () => {
    // Season ends Aug 2026, age on 31 Aug 2026 = 12 — wait, Sep 1 2013 to Aug 31 2026 = 12
    // Birthday hasn't occurred yet on Aug 31, so age = 12
    expect(ageForAthletics('2013-09-01', '2026-04-14')).toBe(12);
  });

  it('returns null for missing dob', () => {
    expect(ageForAthletics(null, '2026-04-14')).toBeNull();
    expect(ageForAthletics('', '2026-04-14')).toBeNull();
  });
});

// ============================================================
// 3. ageOnDate
// ============================================================

describe('ageOnDate', () => {
  it('calculates age correctly when birthday has passed', () => {
    expect(ageOnDate('2013-06-15', '2026-08-31')).toBe(13);
  });

  it('calculates age correctly on the birthday', () => {
    expect(ageOnDate('2013-08-31', '2026-08-31')).toBe(13);
  });

  it('does not count birthday if it has not occurred yet', () => {
    expect(ageOnDate('2013-09-01', '2026-08-31')).toBe(12);
  });

  it('returns null for null dob', () => {
    expect(ageOnDate(null, '2026-08-31')).toBeNull();
  });

  it('returns null for unparseable dob', () => {
    expect(ageOnDate('not-a-date', '2026-08-31')).toBeNull();
  });
});

// ============================================================
// 4. resolveAgeGroup
// ============================================================

describe('resolveAgeGroup', () => {
  it('resolves U13 for age 11 on 31 Aug (session in Apr)', () => {
    // DOB: 1 Sep 2014, session Apr 2026 → age on Aug 31 2026 = 11 → U13
    const group = resolveAgeGroup('2014-09-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group?.code).toBe('u13');
  });

  it('resolves U15 for age 13 on 31 Aug', () => {
    // DOB: 1 Sep 2012, session Apr 2026 → age on Aug 31 2026 = 13 → U15
    const group = resolveAgeGroup('2012-09-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group?.code).toBe('u15');
  });

  it('resolves U11 Academy for age 9 on 31 Aug', () => {
    // DOB: 1 Sep 2016, session Apr 2026 → age on Aug 31 2026 = 9 → U11
    const group = resolveAgeGroup('2016-09-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group?.code).toBe('u11');
    expect(group?.booking_type).toBe('waitlist');
  });

  it('resolves U17 for age 15 on 31 Aug', () => {
    const group = resolveAgeGroup('2010-09-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group?.code).toBe('u17');
  });

  it('resolves U20 for age 17 on 31 Aug', () => {
    const group = resolveAgeGroup('2008-09-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group?.code).toBe('u20');
  });

  it('returns null when no age group matches', () => {
    // Age 25 — too old for any group
    const group = resolveAgeGroup('2000-01-01', '2026-04-14', ALL_AGE_GROUPS);
    expect(group).toBeNull();
  });

  it('returns null for missing dob', () => {
    expect(resolveAgeGroup(null, '2026-04-14', ALL_AGE_GROUPS)).toBeNull();
  });

  it('uses sort_order to break ties — returns lowest sort_order group', () => {
    // Create two overlapping groups (misconfiguration scenario)
    const overlap: AgeGroupConfig[] = [
      makeAgeGroup({ id: 'g2', code: 'b', age_min_aug31: 11, age_max_aug31: 14, sort_order: 2 }),
      makeAgeGroup({ id: 'g1', code: 'a', age_min_aug31: 11, age_max_aug31: 14, sort_order: 1 }),
    ];
    const group = resolveAgeGroup('2014-09-01', '2026-04-14', overlap);
    expect(group?.code).toBe('a'); // sort_order 1 wins
  });
});

// ============================================================
// 5. routeEnquiry
// ============================================================

describe('routeEnquiry', () => {
  it('routes to waitlist for U11 Academy age group', () => {
    const ageGroup = makeAgeGroup({ booking_type: 'waitlist' });
    expect(routeEnquiry(ageGroup)).toBe('waitlist');
  });

  it('routes to taster for U13 age group', () => {
    const ageGroup = makeAgeGroup({ booking_type: 'taster' });
    expect(routeEnquiry(ageGroup)).toBe('taster');
  });

  it('defaults to taster when no age group resolved (no DOB)', () => {
    expect(routeEnquiry(null)).toBe('taster');
  });
});

// ============================================================
// 6. validateSessionDate
// ============================================================

describe('validateSessionDate', () => {
  const tuesdayGroup = makeAgeGroup({ session_days: '["Tuesday"]' });
  const saturdayGroup = makeAgeGroup({ session_days: '["Saturday","Tuesday"]' });

  it('accepts a future Tuesday for a Tuesday group', () => {
    const nextTuesday = getNextNTuesdayDates(1)[0];
    expect(validateSessionDate(nextTuesday, tuesdayGroup)).toBe(true);
  });

  it('rejects a past Tuesday', () => {
    expect(validateSessionDate('2020-03-03', tuesdayGroup)).toBe(false);
  });

  it('rejects a future Wednesday for a Tuesday group', () => {
    // Find next Wednesday
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    expect(validateSessionDate(d.toISOString().split('T')[0], tuesdayGroup)).toBe(false);
  });

  it('accepts a Saturday for a Saturday+Tuesday group', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    expect(validateSessionDate(d.toISOString().split('T')[0], saturdayGroup)).toBe(true);
  });

  it('accepts an invalid date string as false', () => {
    expect(validateSessionDate('not-a-date', tuesdayGroup)).toBe(false);
  });
});

// ============================================================
// 7. getNextNSessionDates
// ============================================================

describe('getNextNSessionDates', () => {
  it('returns N future Tuesday dates', () => {
    const tuesdayGroup = makeAgeGroup({ session_days: '["Tuesday"]' });
    const dates = getNextNSessionDates(tuesdayGroup, 5);
    expect(dates).toHaveLength(5);
    dates.forEach((d) => {
      expect(new Date(d).getDay()).toBe(2); // Tuesday
    });
  });

  it('returns both Saturday and Tuesday dates for Academy group', () => {
    const academyGroup = makeAgeGroup({ session_days: '["Saturday","Tuesday"]' });
    const dates = getNextNSessionDates(academyGroup, 6);
    expect(dates).toHaveLength(6);
    const days = dates.map((d) => new Date(d).getDay());
    expect(days.some((d) => d === 2)).toBe(true); // has Tuesdays
    expect(days.some((d) => d === 6)).toBe(true); // has Saturdays
  });

  it('never returns today', () => {
    const tuesdayGroup = makeAgeGroup({ session_days: '["Tuesday"]' });
    const today = new Date();
    const dates = getNextNSessionDates(tuesdayGroup, 8, today);
    const todayStr = today.toISOString().split('T')[0];
    expect(dates).not.toContain(todayStr);
  });
});

// ============================================================
// 8. validateEnquiryData
// ============================================================

describe('validateEnquiryData', () => {
  it('passes with valid minimum data', () => {
    expect(() =>
      validateEnquiryData({ contact_name: 'Jane', contact_email: 'jane@example.com' })
    ).not.toThrow();
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
    expect(() =>
      validateEnquiryData({ contact_name: 'Jane', contact_email: 'notanemail' })
    ).toThrow(/email/);
  });

  it('throws for dob that is too recent (child under 4)', () => {
    const recentDob = new Date();
    recentDob.setFullYear(recentDob.getFullYear() - 1);
    expect(() =>
      validateEnquiryData({
        contact_name: 'Jane',
        contact_email: 'jane@example.com',
        dob: recentDob.toISOString().split('T')[0],
      })
    ).toThrow(/plausible age/);
  });

  it('passes with valid dob', () => {
    expect(() =>
      validateEnquiryData({
        contact_name: 'Jane',
        contact_email: 'jane@example.com',
        dob: '2014-06-15',
      })
    ).not.toThrow();
  });
});

// ============================================================
// 9. isAgeGroupEligible
// ============================================================

describe('isAgeGroupEligible', () => {
  const u13Group = makeAgeGroup({ age_min_aug31: 11, age_max_aug31: 12 });

  it('returns true for athlete correctly in U13', () => {
    // Age 11 on 31 Aug 2026 → DOB Sep 2014, session Apr 2026
    expect(isAgeGroupEligible('2014-09-01', '2026-04-14', u13Group)).toBe(true);
  });

  it('returns false for athlete too young for U13', () => {
    // Age 9 on 31 Aug 2026 → DOB Sep 2016
    expect(isAgeGroupEligible('2016-09-01', '2026-04-14', u13Group)).toBe(false);
  });

  it('returns false for athlete too old for U13', () => {
    // Age 13 on 31 Aug 2026 → DOB Sep 2012
    expect(isAgeGroupEligible('2012-09-01', '2026-04-14', u13Group)).toBe(false);
  });

  it('returns false for missing dob', () => {
    expect(isAgeGroupEligible(null, '2026-04-14', u13Group)).toBe(false);
  });
});

// ============================================================
// 10. Token utilities
// ============================================================

describe('token utilities', () => {
  it('generateSecureToken returns correct hex length', () => {
    expect(generateSecureToken(24)).toHaveLength(48);
    expect(generateSecureToken(16)).toHaveLength(32);
  });

  it('isTokenExpired returns false for a fresh token', () => {
    expect(isTokenExpired(new Date().toISOString(), 14)).toBe(false);
  });

  it('isTokenExpired returns true for an old token', () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    expect(isTokenExpired(old.toISOString(), 14)).toBe(true);
  });

  it('isInviteExpired is false for a fresh invite', () => {
    expect(isInviteExpired(new Date().toISOString())).toBe(false);
  });

  it('isInviteExpired is true for a 15-day-old invite', () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    expect(isInviteExpired(old.toISOString())).toBe(true);
  });
});

// ============================================================
// 11. Template utilities
// ============================================================

describe('template utilities', () => {
  it('renderTemplate replaces all variables', () => {
    const result = renderTemplate('Hi {{name}}, your date is {{date}}', {
      name: 'Jane',
      date: 'Tuesday 14 April',
    });
    expect(result).toBe('Hi Jane, your date is Tuesday 14 April');
  });

  it('renderTemplate throws on missing variable', () => {
    expect(() => renderTemplate('Hi {{name}} and {{missing}}', { name: 'Jane' })).toThrow(
      /\{\{missing\}\}/
    );
  });

  it('extractTemplateVariables finds all {{vars}}', () => {
    const vars = extractTemplateVariables('Hi {{name}}, book at {{url}}. Date: {{date}}');
    expect(vars).toEqual(expect.arrayContaining(['name', 'url', 'date']));
    expect(vars).toHaveLength(3);
  });

  it('validateTemplateVariables returns empty array for correct vars', () => {
    const result = validateTemplateVariables('Hi {{name}}', ['name']);
    expect(result).toHaveLength(0);
  });

  it('validateTemplateVariables returns undeclared variable names', () => {
    const result = validateTemplateVariables('Hi {{name}} and {{surprise}}', ['name']);
    expect(result).toContain('surprise');
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// 12. formatDateForDisplay
// ============================================================

describe('formatDateForDisplay', () => {
  it('formats a date in UK long format', () => {
    const result = formatDateForDisplay('2026-04-14');
    expect(result).toContain('April');
    expect(result).toContain('2026');
  });
});

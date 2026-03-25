// ============================================================
// EGAC Platform — API Handler Tests
// tests/unit/api.test.ts
//
// Tests every public API handler with mocked repositories
// and email functions. No real D1 or Resend calls.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all repository and email modules before importing handlers
vi.mock('../../src/lib/repositories/enquiries.js', () => ({
  insertEnquiry: vi.fn(),
  getEnquiryByEmail: vi.fn(),
  getEnquiryById: vi.fn(),
  appendEnquiryEvent: vi.fn(),
  updateEnquiry: vi.fn(),
}));

vi.mock('../../src/lib/repositories/invites.js', () => ({
  createInviteForEnquiry: vi.fn(),
  getInviteByToken: vi.fn(),
  markInviteSent: vi.fn(),
  markInviteAccepted: vi.fn(),
}));

vi.mock('../../src/lib/repositories/bookings.js', () => ({
  createBooking: vi.fn(),
  countBookingsForDateAndGroup: vi.fn(),
  getBookingByInviteAndDate: vi.fn(),
}));

vi.mock('../../src/lib/repositories/academy.js', () => ({
  addToWaitlist: vi.fn(),
  markWaitlistInviteSent: vi.fn(),
  getWaitlistEntryByToken: vi.fn(),
  recordWaitlistResponse: vi.fn(),
}));

vi.mock('../../src/lib/repositories/age-groups.js', () => ({
  listAgeGroups: vi.fn(),
  getAgeGroupById: vi.fn(),
  getTasterAgeGroups: vi.fn(),
}));

vi.mock('../../src/lib/business/age.js', () => ({
  resolveAgeGroup: vi.fn(),
  getNextNTuesdayDates: vi.fn().mockReturnValue(['2026-06-10', '2026-06-17']),
  getNextNSessionDates: vi.fn().mockReturnValue(['2026-06-10', '2026-06-17']),
  validateSessionDate: vi.fn().mockReturnValue(true),
  isAgeGroupEligible: vi.fn().mockReturnValue(true),
  formatDateForDisplay: vi.fn().mockReturnValue('Tuesday 10 June 2026'),
  ageForAthletics: vi.fn().mockReturnValue(12),
  ukSchoolYear: vi.fn().mockReturnValue(13), // default: Year 13 → standard taster routing
}));

vi.mock('../../src/lib/email/templates.js', () => ({
  sendBookingInvite: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendAcademyWaitlist: vi.fn(),
  sendAcademyRejection: vi.fn(),
}));

vi.mock('../../src/lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/config.js')>();
  return {
    ...actual,
    getConfig: vi.fn(),
  };
});

import { handleEnquiry } from '../../src/api/enquiry.js';
import { handleBooking } from '../../src/api/booking.js';
import { handleAcademyRespond } from '../../src/api/academy.js';
import { handleHealth } from '../../src/api/health.js';

import * as enquiryRepo from '../../src/lib/repositories/enquiries.js';
import * as inviteRepo from '../../src/lib/repositories/invites.js';
import * as bookingRepo from '../../src/lib/repositories/bookings.js';
import * as academyRepo from '../../src/lib/repositories/academy.js';
import * as emailTemplates from '../../src/lib/email/templates.js';
import { getConfig } from '../../src/lib/config.js';
import * as ageGroupsRepo from '../../src/lib/repositories/age-groups.js';
import * as ageBusiness from '../../src/lib/business/age.js';
// ukSchoolYear is included in the ageBusiness mock above

import type { Env } from '../../src/lib/db/schema.js';

// ============================================================
// Shared helpers
// ============================================================

function makeEnv(): Env {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ 1: 1 }) }),
    } as unknown as D1Database,
    KV: {
      get: vi.fn().mockResolvedValue('1'),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    } as unknown as KVNamespace,
    RESEND_API_KEY: 'test',
    ADMIN_TOKEN: 'secret_token',
    ADMIN_EMAIL: 'admin@egac.co.uk',
    EMAIL_FROM: 'noreply@egac.co.uk',
    CRON_SECRET: 'test',
    APP_ENV: 'development',
  };
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`https://egac.pages.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string): Request {
  return new Request(`https://egac.pages.dev${path}`, { method: 'GET' });
}

async function parseResponse<T = unknown>(
  response: Response
): Promise<{ status: number; body: T }> {
  return { status: response.status, body: (await response.json()) as T };
}

// Standard mock objects
const mockEnquiry = {
  id: 'enq_001',
  email: 'jane@example.com',
  name: 'Jane Smith',
  dob: '2014-06-15',
  processed: 0,
  invite_id: null,
  events: '[]',
  environment: 'development' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  phone: null,
  age_group_id: null,
  source: 'website',
  note: null,
  raw_payload: null,
};

const mockInvite = {
  id: 'inv_001',
  token: 'abc123token',
  enquiry_id: 'enq_001',
  status: 'sent' as const,
  send_attempts: 1,
  created_at: new Date().toISOString(),
  sent_at: new Date().toISOString(),
  accepted_at: null,
  last_send_error: null,
  environment: 'development' as const,
};

const mockBooking = {
  id: 'bkg_001',
  enquiry_id: 'enq_001',
  invite_id: 'inv_001',
  age_group_id: 'ag_u13',
  session_date: '2026-06-09',
  session_time: '18:30',
  status: 'confirmed' as const,
  attendance_note: null,
  created_at: new Date().toISOString(),
  updated_at: null,
  environment: 'development' as const,
};

const mockAgeGroup = {
  id: 'ag_u13',
  code: 'u14',
  label: 'U14',
  booking_type: 'taster' as const,
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
  created_at: new Date().toISOString(),
  updated_at: null,
};

const mockConfig = {
  academy_max_age: '10',
  weeks_ahead_booking: '8',
  capacity_per_slot: '2',
  site_name: 'EGAC',
  site_url: 'https://egac.pages.dev',
  email_from: 'noreply@egac.co.uk',
  venue_name: 'East Grinstead Leisure Centre',
  venue_address: '1 Station Road',
  admin_email: 'admin@egac.co.uk',
};

// ============================================================
// 1. POST /api/enquiry
// ============================================================

describe('POST /api/enquiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(ageGroupsRepo.listAgeGroups).mockResolvedValue([mockAgeGroup]);
    vi.mocked(ageBusiness.resolveAgeGroup).mockReturnValue(mockAgeGroup);
    vi.mocked(enquiryRepo.getEnquiryByEmail).mockResolvedValue(null);
    vi.mocked(enquiryRepo.insertEnquiry).mockResolvedValue(mockEnquiry);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
    vi.mocked(enquiryRepo.updateEnquiry).mockResolvedValue({ ...mockEnquiry, processed: 1 });
    vi.mocked(inviteRepo.createInviteForEnquiry).mockResolvedValue(mockInvite);
    vi.mocked(inviteRepo.markInviteSent).mockResolvedValue(undefined);
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({
      success: true,
      id: 'email_001',
    });
  });

  it('returns 201 on valid non-academy enquiry', async () => {
    const req = postRequest('/api/enquiry', {
      name: 'Jane Smith',
      email: 'jane@example.com',
      dob: '2014-06-15',
    });

    const { status, body } = await parseResponse<{ ok: boolean }>(
      await handleEnquiry(req, makeEnv())
    );

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
  });

  it('accepts application/x-www-form-urlencoded body', async () => {
    const form = new URLSearchParams({
      name: 'Form Parent',
      email: 'form-parent@example.com',
      dob: '2015-05-05',
      phone: '07700900000',
    });

    const req = new Request('https://egac.pages.dev/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const { status, body } = await parseResponse<{ ok: boolean }>(
      await handleEnquiry(req, makeEnv())
    );

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
  });

  it('returns 422 when email is missing', async () => {
    const req = postRequest('/api/enquiry', { name: 'No Email' });
    const { status, body } = await parseResponse<{ ok: boolean; error: string }>(
      await handleEnquiry(req, makeEnv())
    );

    expect(status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request('https://egac.pages.dev/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));
    expect(status).toBe(400);
  });

  it('returns 405 on GET request', async () => {
    const { status } = await parseResponse(
      await handleEnquiry(getRequest('/api/enquiry'), makeEnv())
    );
    expect(status).toBe(405);
  });

  it('accepts repeat submissions for the same email', async () => {
    vi.mocked(enquiryRepo.getEnquiryByEmail).mockResolvedValue({
      ...mockEnquiry,
      processed: 1,
    });

    const req = postRequest('/api/enquiry', {
      name: 'Jane Smith',
      email: 'jane@example.com',
      dob: '2014-06-15',
    });

    const { status, body } = await parseResponse<{ ok: boolean }>(
      await handleEnquiry(req, makeEnv())
    );

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(enquiryRepo.insertEnquiry).toHaveBeenCalled();
  });

  it('accepts on-behalf enquiry payload and maps athlete details', async () => {
    const req = postRequest('/api/enquiry', {
      enquiry_for: 'other',
      enquirer_name: 'Parent Contact',
      enquirer_email: 'parent@example.com',
      enquirer_phone: '07700900000',
      athlete_name: 'Athlete Person',
      athlete_dob: '2015-03-20',
    });

    const { status, body } = await parseResponse<{ ok: boolean }>(
      await handleEnquiry(req, makeEnv())
    );

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(enquiryRepo.insertEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Parent Contact',
        email: 'parent@example.com',
        dob: '2015-03-20',
        note: 'Enquiring about: Athlete Person',
      }),
      expect.anything()
    );
  });

  it('adds to academy waitlist for under-10 enquiry', async () => {
    const academyEnquiry = { ...mockEnquiry, dob: '2018-01-01' };
    const mockWaitlistAgeGroup = {
      ...mockAgeGroup,
      id: 'ag_u11',
      code: 'u12',
      label: 'U12 Academy',
      booking_type: 'waitlist' as const,
      age_min_aug31: 9,
      age_max_aug31: 10,
    };
    vi.mocked(ageBusiness.resolveAgeGroup).mockReturnValueOnce(mockWaitlistAgeGroup);
    vi.mocked(enquiryRepo.insertEnquiry).mockResolvedValue(academyEnquiry);
    vi.mocked(academyRepo.addToWaitlist).mockResolvedValue({
      id: 'awl_001',
      enquiry_id: 'enq_001',
      season_id: null,
      token: 'waitlist_token_xyz',
      position: null,
      status: 'waiting' as const,
      is_returning: 0,
      rolled_over_from_season_id: null,
      invited_at: null,
      responded_at: null,
      response: null,
      send_attempts: 0,
      last_send_error: null,
      created_at: new Date().toISOString(),
      environment: 'development' as const,
    });
    vi.mocked(academyRepo.markWaitlistInviteSent).mockResolvedValue(undefined);
    vi.mocked(emailTemplates.sendAcademyWaitlist).mockResolvedValue({
      success: true,
      id: 'email_002',
    });

    const req = postRequest('/api/enquiry', {
      name: 'Parent Name',
      email: 'parent@example.com',
      dob: '2018-01-01',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));

    expect(status).toBe(201);
    expect(academyRepo.addToWaitlist).toHaveBeenCalledWith('enq_001', expect.anything());
    expect(inviteRepo.createInviteForEnquiry).not.toHaveBeenCalled();
  });

  it('still returns 201 if email send fails — enquiry is never lost', async () => {
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({
      success: false,
      error: 'Resend timeout',
    });

    const req = postRequest('/api/enquiry', {
      name: 'Jane Smith',
      email: 'jane@example.com',
      dob: '2014-06-15',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));
    expect(status).toBe(201);
  });

  it('returns 204 on OPTIONS preflight', async () => {
    const req = new Request('https://egac.pages.dev/api/enquiry', { method: 'OPTIONS' });
    const res = await handleEnquiry(req, makeEnv());
    expect(res.status).toBe(204);
  });

  // ── School-year routing (a) Year 5/6 → waitlist, no taster email ──

  it('(a) year 5 applicant is added to academy waitlist', async () => {
    vi.mocked(ageBusiness.ukSchoolYear).mockReturnValueOnce(5);
    vi.mocked(academyRepo.addToWaitlist).mockResolvedValue({
      id: 'awl_001',
      enquiry_id: 'enq_001',
      season_id: null,
      token: 'waitlist_token_xyz',
      position: null,
      status: 'waiting' as const,
      is_returning: 0,
      rolled_over_from_season_id: null,
      invited_at: null,
      responded_at: null,
      response: null,
      send_attempts: 0,
      last_send_error: null,
      created_at: new Date().toISOString(),
      environment: 'development' as const,
    });
    vi.mocked(emailTemplates.sendAcademyWaitlist).mockResolvedValue({ success: true, id: 'e1' });

    const req = postRequest('/api/enquiry', {
      name: 'Parent',
      email: 'parent@example.com',
      dob: '2016-05-01',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));

    expect(status).toBe(201);
    expect(academyRepo.addToWaitlist).toHaveBeenCalled();
    expect(emailTemplates.sendBookingInvite).not.toHaveBeenCalled();
  });

  it('(a) year 6 applicant is added to academy waitlist', async () => {
    vi.mocked(ageBusiness.ukSchoolYear).mockReturnValueOnce(6);
    vi.mocked(academyRepo.addToWaitlist).mockResolvedValue({
      id: 'awl_002',
      enquiry_id: 'enq_001',
      season_id: null,
      token: 'waitlist_token_abc',
      position: null,
      status: 'waiting' as const,
      is_returning: 0,
      rolled_over_from_season_id: null,
      invited_at: null,
      responded_at: null,
      response: null,
      send_attempts: 0,
      last_send_error: null,
      created_at: new Date().toISOString(),
      environment: 'development' as const,
    });
    vi.mocked(emailTemplates.sendAcademyWaitlist).mockResolvedValue({ success: true, id: 'e2' });

    const req = postRequest('/api/enquiry', {
      name: 'Parent2',
      email: 'parent2@example.com',
      dob: '2014-11-15',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));

    expect(status).toBe(201);
    expect(academyRepo.addToWaitlist).toHaveBeenCalled();
    expect(emailTemplates.sendBookingInvite).not.toHaveBeenCalled();
  });

  // ── School-year routing (b) Below Year 5 → rejection email ──

  it('(b) below year 5 applicant receives rejection email', async () => {
    vi.mocked(ageBusiness.ukSchoolYear).mockReturnValueOnce(3);
    vi.mocked(emailTemplates.sendAcademyRejection).mockResolvedValue({ success: true, id: 'e3' });

    const req = postRequest('/api/enquiry', {
      name: 'Parent3',
      email: 'parent3@example.com',
      dob: '2018-06-01',
    });

    const { status } = await parseResponse(await handleEnquiry(req, makeEnv()));

    expect(status).toBe(201);
    expect(emailTemplates.sendAcademyRejection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'enq_001' }),
      expect.anything()
    );
    expect(academyRepo.addToWaitlist).not.toHaveBeenCalled();
    expect(inviteRepo.createInviteForEnquiry).not.toHaveBeenCalled();
  });

  it('(b) year 4 applicant receives rejection email, not taster invite', async () => {
    vi.mocked(ageBusiness.ukSchoolYear).mockReturnValueOnce(4);
    vi.mocked(emailTemplates.sendAcademyRejection).mockResolvedValue({ success: true, id: 'e4' });

    const req = postRequest('/api/enquiry', {
      name: 'Parent4',
      email: 'parent4@example.com',
      dob: '2017-03-10',
    });

    await handleEnquiry(req, makeEnv());

    expect(emailTemplates.sendAcademyRejection).toHaveBeenCalled();
    expect(emailTemplates.sendBookingInvite).not.toHaveBeenCalled();
  });

  // ── School-year routing (c) taster email NOT sent to year 5/6 ──

  it('(c) taster invite email is not sent to a year 5 applicant', async () => {
    vi.mocked(ageBusiness.ukSchoolYear).mockReturnValueOnce(5);
    vi.mocked(academyRepo.addToWaitlist).mockResolvedValue({
      id: 'awl_003',
      enquiry_id: 'enq_001',
      season_id: null,
      token: 'waitlist_token_def',
      position: null,
      status: 'waiting' as const,
      is_returning: 0,
      rolled_over_from_season_id: null,
      invited_at: null,
      responded_at: null,
      response: null,
      send_attempts: 0,
      last_send_error: null,
      created_at: new Date().toISOString(),
      environment: 'development' as const,
    });
    vi.mocked(emailTemplates.sendAcademyWaitlist).mockResolvedValue({ success: true });

    const req = postRequest('/api/enquiry', {
      name: 'Parent5',
      email: 'parent5@example.com',
      dob: '2015-07-20',
    });

    await handleEnquiry(req, makeEnv());

    expect(emailTemplates.sendBookingInvite).not.toHaveBeenCalled();
  });
});

// ============================================================
// 2. POST /api/booking
// ============================================================

describe('POST /api/booking', () => {
  const futureDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 84);
    while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(ageGroupsRepo.listAgeGroups).mockResolvedValue([mockAgeGroup]);
    vi.mocked(ageGroupsRepo.getAgeGroupById).mockResolvedValue(mockAgeGroup);
    vi.mocked(ageBusiness.resolveAgeGroup).mockReturnValue(mockAgeGroup);
    vi.mocked(inviteRepo.getInviteByToken).mockResolvedValue(mockInvite);
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(mockEnquiry);
    vi.mocked(bookingRepo.getBookingByInviteAndDate).mockResolvedValue(null);
    vi.mocked(bookingRepo.countBookingsForDateAndGroup).mockResolvedValue(0);
    vi.mocked(bookingRepo.createBooking).mockResolvedValue(mockBooking);
    vi.mocked(inviteRepo.markInviteAccepted).mockResolvedValue(undefined);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
    vi.mocked(emailTemplates.sendBookingConfirmation).mockResolvedValue({ success: true });
  });

  it('returns 200 on valid booking', async () => {
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });

    const { status, body } = await parseResponse<{ ok: boolean; data: { booking_id: string } }>(
      await handleBooking(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.booking_id).toBe('bkg_001');
  });

  it('returns 404 if token not found', async () => {
    vi.mocked(inviteRepo.getInviteByToken).mockResolvedValue(null);
    const req = postRequest('/api/booking', { token: 'bad_token', date: futureDate });
    const { status } = await parseResponse(await handleBooking(req, makeEnv()));
    expect(status).toBe(404);
  });

  it('returns 409 if invite already accepted', async () => {
    vi.mocked(inviteRepo.getInviteByToken).mockResolvedValue({ ...mockInvite, status: 'accepted' });
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status, body } = await parseResponse<{ ok: boolean; code: string }>(
      await handleBooking(req, makeEnv())
    );
    expect(status).toBe(409);
    expect(body.code).toBe('INVITE_USED');
  });

  it('returns 409 if slot is at capacity', async () => {
    vi.mocked(bookingRepo.countBookingsForDateAndGroup).mockResolvedValue(2);
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status, body } = await parseResponse<{ ok: boolean; code: string }>(
      await handleBooking(req, makeEnv())
    );
    expect(status).toBe(409);
    expect(body.code).toBe('SLOT_FULL');
  });

  it('returns 409 if duplicate booking for same invite and date', async () => {
    vi.mocked(bookingRepo.getBookingByInviteAndDate).mockResolvedValue(mockBooking);
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status, body } = await parseResponse<{ ok: boolean; code: string }>(
      await handleBooking(req, makeEnv())
    );
    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE_BOOKING');
  });

  it('returns 422 if date is missing', async () => {
    const req = postRequest('/api/booking', { token: 'abc123token' });
    const { status } = await parseResponse(await handleBooking(req, makeEnv()));
    expect(status).toBe(422);
  });

  it('returns 422 when no age group matches', async () => {
    vi.mocked(ageBusiness.resolveAgeGroup).mockReturnValueOnce(null);
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status } = await parseResponse(await handleBooking(req, makeEnv()));
    expect(status).toBe(422);
  });

  it('returns 410 if invite is expired', async () => {
    vi.mocked(inviteRepo.getInviteByToken).mockResolvedValue({ ...mockInvite, status: 'expired' });
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status, body } = await parseResponse<{ ok: boolean; code: string }>(
      await handleBooking(req, makeEnv())
    );
    expect(status).toBe(410);
    expect(body.code).toBe('INVITE_EXPIRED');
  });

  it('marks invite accepted after successful booking', async () => {
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    await handleBooking(req, makeEnv());
    expect(inviteRepo.markInviteAccepted).toHaveBeenCalledWith('inv_001', expect.anything());
  });

  it('sends booking confirmation email after successful booking', async () => {
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    await handleBooking(req, makeEnv());

    expect(emailTemplates.sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'enq_001' }),
      expect.objectContaining({ id: 'bkg_001' }),
      expect.any(String),
      expect.any(String),
      expect.anything()
    );
  });

  it('still returns 200 if confirmation email send fails', async () => {
    vi.mocked(emailTemplates.sendBookingConfirmation).mockResolvedValue({
      success: false,
      error: 'Resend rejected sender',
    });

    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    const { status, body } = await parseResponse<{ ok: boolean }>(
      await handleBooking(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('uses Tuesday location for a Tuesday session', async () => {
    // futureDate is always a Tuesday (enforced by the date loop above)
    vi.mocked(getConfig).mockResolvedValue({
      ...mockConfig,
      location_tuesday: 'Meridian Sports Ground',
    });
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    await handleBooking(req, makeEnv());

    expect(emailTemplates.sendBookingConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Meridian Sports Ground',
      expect.any(String),
      expect.anything()
    );
  });

  it('falls back to venue_name when no day-specific location is configured', async () => {
    // mockConfig has no location_tuesday — must fall back to venue_name
    const req = postRequest('/api/booking', { token: 'abc123token', date: futureDate });
    await handleBooking(req, makeEnv());

    expect(emailTemplates.sendBookingConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'East Grinstead Leisure Centre',
      expect.any(String),
      expect.anything()
    );
  });
});

// ============================================================
// 3. POST /api/academy/respond
// ============================================================

describe('POST /api/academy/respond', () => {
  const mockWaitlistEntry = {
    id: 'awl_001',
    enquiry_id: 'enq_001',
    season_id: null,
    token: 'academy_token_xyz',
    position: null,
    status: 'invited' as const,
    is_returning: 0,
    rolled_over_from_season_id: null,
    invited_at: new Date().toISOString(),
    responded_at: null,
    response: null as 'yes' | 'no' | null,
    send_attempts: 1,
    last_send_error: null,
    created_at: new Date().toISOString(),
    environment: 'development' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(academyRepo.getWaitlistEntryByToken).mockResolvedValue(mockWaitlistEntry);
    vi.mocked(academyRepo.recordWaitlistResponse).mockResolvedValue({
      ...mockWaitlistEntry,
      response: 'yes',
      status: 'accepted' as const,
      responded_at: new Date().toISOString(),
    });
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
  });

  it('returns 200 on valid yes response', async () => {
    const req = postRequest('/api/academy/respond', {
      token: 'academy_token_xyz',
      response: 'yes',
    });

    const { status, body } = await parseResponse<{ ok: boolean; data: { response: string } }>(
      await handleAcademyRespond(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.response).toBe('yes');
  });

  it('returns 200 on valid no response', async () => {
    const req = postRequest('/api/academy/respond', {
      token: 'academy_token_xyz',
      response: 'no',
    });

    const { status, body } = await parseResponse<{ ok: boolean; data: { response: string } }>(
      await handleAcademyRespond(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.data.response).toBe('no');
  });

  it('returns 404 if token not found', async () => {
    vi.mocked(academyRepo.getWaitlistEntryByToken).mockResolvedValue(null);

    const req = postRequest('/api/academy/respond', {
      token: 'bad_token',
      response: 'yes',
    });

    const { status } = await parseResponse(await handleAcademyRespond(req, makeEnv()));
    expect(status).toBe(404);
  });

  it('returns 422 on invalid response value', async () => {
    const req = postRequest('/api/academy/respond', {
      token: 'academy_token_xyz',
      response: 'maybe',
    });

    const { status } = await parseResponse(await handleAcademyRespond(req, makeEnv()));
    expect(status).toBe(422);
  });

  it('is idempotent — already-responded returns 200 gracefully', async () => {
    vi.mocked(academyRepo.getWaitlistEntryByToken).mockResolvedValue({
      ...mockWaitlistEntry,
      status: 'accepted' as const,
      response: 'yes',
      responded_at: new Date().toISOString(),
    });

    const req = postRequest('/api/academy/respond', {
      token: 'academy_token_xyz',
      response: 'yes',
    });

    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { already_responded: boolean };
    }>(await handleAcademyRespond(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.already_responded).toBe(true);
    expect(academyRepo.recordWaitlistResponse).not.toHaveBeenCalled();
  });

  it('appends event to enquiry trail', async () => {
    const req = postRequest('/api/academy/respond', {
      token: 'academy_token_xyz',
      response: 'yes',
    });

    await handleAcademyRespond(req, makeEnv());

    expect(enquiryRepo.appendEnquiryEvent).toHaveBeenCalledWith(
      'enq_001',
      expect.objectContaining({ type: 'academy_response_received', response: 'yes' }),
      expect.anything()
    );
  });
});

// ============================================================
// 4. GET /api/health
// ============================================================

describe('GET /api/health', () => {
  it('returns 200 with status ok when DB is reachable', async () => {
    const { status, body } = await parseResponse<{ ok: boolean; data: { status: string } }>(
      await handleHealth(getRequest('/api/health'), makeEnv())
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('returns 503 when DB query fails', async () => {
    const brokenEnv: Env = {
      ...makeEnv(),
      DB: {
        prepare: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('D1 connection refused')),
        }),
      } as unknown as D1Database,
    };

    const { status } = await parseResponse(
      await handleHealth(getRequest('/api/health'), brokenEnv)
    );

    expect(status).toBe(503);
  });

  it('returns 405 on POST request', async () => {
    const req = new Request('https://egac.pages.dev/api/health', { method: 'POST' });
    const { status } = await parseResponse(await handleHealth(req, makeEnv()));
    expect(status).toBe(405);
  });
});

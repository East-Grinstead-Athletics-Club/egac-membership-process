// ============================================================
// EGAC Platform — Cron Handler Tests
// tests/unit/cron.test.ts
//
// Tests all four cron job handlers with mocked repositories
// and email functions. Covers:
//   - CRON_SECRET authentication (401 on missing / wrong secret)
//   - expire-invites: only expires invites > 14 days old
//   - retry-invites: retries pending invites; marks failed at 3 attempts
//   - send-reminders: idempotency via enquiry event log
//   - academy-rollover: no-op when no expired seasons; rolls over correctly
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all repository and email modules before importing handlers

vi.mock('../../src/lib/repositories/invites.js', () => ({
  listSentInvitesOlderThan: vi.fn(),
  markInviteExpired: vi.fn(),
  markInviteFailed: vi.fn(),
  listPendingInvites: vi.fn(),
  markInviteSent: vi.fn(),
  incrementSendAttempts: vi.fn(),
}));

vi.mock('../../src/lib/repositories/enquiries.js', () => ({
  getEnquiryById: vi.fn(),
  appendEnquiryEvent: vi.fn(),
}));

vi.mock('../../src/lib/repositories/bookings.js', () => ({
  listBookingsForDate: vi.fn(),
}));

vi.mock('../../src/lib/repositories/academy.js', () => ({
  listAcademySeasons: vi.fn(),
  listWaitlistBySeason: vi.fn(),
  rolloverWaitlistEntry: vi.fn(),
  hasAcceptedEntryForEnquiry: vi.fn(),
  updateSeasonStatus: vi.fn(),
  getUpcomingAcademySeason: vi.fn(),
}));

vi.mock('../../src/lib/email/templates.js', () => ({
  sendBookingInvite: vi.fn(),
  sendBookingReminder: vi.fn(),
}));

vi.mock('../../src/lib/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/config.js')>();
  return {
    ...actual,
    getConfig: vi.fn(),
  };
});

vi.mock('../../src/lib/business/age.js', () => ({
  getNextNTuesdayDates: vi.fn().mockReturnValue(['2026-06-10', '2026-06-17', '2026-06-24']),
}));

import { handleExpireInvites } from '../../src/api/cron/expire-invites.js';
import { handleRetryInvites } from '../../src/api/cron/retry-invites.js';
import { handleSendReminders } from '../../src/api/cron/send-reminders.js';
import { handleAcademyRollover } from '../../src/api/cron/academy-rollover.js';

import * as inviteRepo from '../../src/lib/repositories/invites.js';
import * as enquiryRepo from '../../src/lib/repositories/enquiries.js';
import * as bookingRepo from '../../src/lib/repositories/bookings.js';
import * as academyRepo from '../../src/lib/repositories/academy.js';
import * as emailTemplates from '../../src/lib/email/templates.js';
import { getConfig } from '../../src/lib/config.js';

import type { Env } from '../../src/lib/db/schema.js';

// ============================================================
// Shared helpers
// ============================================================

function makeEnv(): Env {
  return {
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    RESEND_API_KEY: 'test',
    ADMIN_TOKEN: 'admin_secret',
    ADMIN_EMAIL: 'admin@egac.co.uk',
    EMAIL_FROM: 'noreply@egac.co.uk',
    CRON_SECRET: 'cron_secret_abc',
    APP_ENV: 'development',
  };
}

function cronRequest(path: string, secret?: string): Request {
  return new Request(`https://egac.pages.dev${path}`, {
    method: 'POST',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
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
  processed: 1,
  invite_id: 'inv_001',
  events: '[]',
  environment: 'development' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  phone: null,
  age_group_id: null,
  source: 'website',
  note: null,
  raw_payload: null,
};

const staleInvite = {
  id: 'inv_stale',
  token: 'stale_token',
  enquiry_id: 'enq_001',
  status: 'sent' as const,
  send_attempts: 1,
  // created more than 14 days ago
  created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  sent_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  accepted_at: null,
  last_send_error: null,
  environment: 'development' as const,
};

const pendingInvite = {
  id: 'inv_pending',
  token: 'pending_token',
  enquiry_id: 'enq_001',
  status: 'pending' as const,
  send_attempts: 0,
  created_at: new Date().toISOString(),
  sent_at: null,
  accepted_at: null,
  last_send_error: null,
  environment: 'development' as const,
};

const mockBooking = {
  id: 'bkg_001',
  enquiry_id: 'enq_001',
  invite_id: 'inv_001',
  age_group_id: 'ag_u13',
  session_date: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  })(),
  session_time: '18:30',
  status: 'confirmed' as const,
  attendance_note: null,
  created_at: new Date().toISOString(),
  updated_at: null,
  environment: 'development' as const,
};

const mockConfig = {
  weeks_ahead_booking: '8',
  site_name: 'EGAC',
  site_url: 'https://egac.pages.dev',
  email_from: 'noreply@egac.co.uk',
  venue_name: 'East Grinstead Leisure Centre',
  venue_address: '1 Station Road',
  admin_email: 'admin@egac.co.uk',
  academy_max_age: '10',
  capacity_per_slot: '2',
  location_tuesday: '',
  location_thursday: '',
  location_saturday: '',
};

// ============================================================
// 1. POST /api/cron/expire-invites
// ============================================================

describe('POST /api/cron/expire-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inviteRepo.listSentInvitesOlderThan).mockResolvedValue([]);
    vi.mocked(inviteRepo.markInviteExpired).mockResolvedValue(undefined);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
  });

  it('returns 401 without Authorization header', async () => {
    const req = cronRequest('/api/cron/expire-invites');
    const { status, body } = await parseResponse<{ ok: boolean; code: string }>(
      await handleExpireInvites(req, makeEnv())
    );
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with wrong CRON_SECRET', async () => {
    const req = cronRequest('/api/cron/expire-invites', 'wrong_secret');
    const { status } = await parseResponse(await handleExpireInvites(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('returns 405 on GET request', async () => {
    const req = new Request('https://egac.pages.dev/api/cron/expire-invites', {
      method: 'GET',
      headers: { Authorization: 'Bearer cron_secret_abc' },
    });
    const { status } = await parseResponse(await handleExpireInvites(req, makeEnv()));
    expect(status).toBe(405);
  });

  it('expires stale invites and returns count', async () => {
    vi.mocked(inviteRepo.listSentInvitesOlderThan).mockResolvedValue([staleInvite]);

    const req = cronRequest('/api/cron/expire-invites', 'cron_secret_abc');
    const { status, body } = await parseResponse<{ ok: boolean; data: { expired: number } }>(
      await handleExpireInvites(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.expired).toBe(1);
    expect(inviteRepo.markInviteExpired).toHaveBeenCalledWith('inv_stale', expect.anything());
    expect(enquiryRepo.appendEnquiryEvent).toHaveBeenCalledWith(
      'enq_001',
      { type: 'invite_expired' },
      expect.anything()
    );
  });

  it('returns expired: 0 when no stale invites exist (idempotent)', async () => {
    vi.mocked(inviteRepo.listSentInvitesOlderThan).mockResolvedValue([]);

    const req = cronRequest('/api/cron/expire-invites', 'cron_secret_abc');
    const { status, body } = await parseResponse<{ ok: boolean; data: { expired: number } }>(
      await handleExpireInvites(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.data.expired).toBe(0);
    expect(inviteRepo.markInviteExpired).not.toHaveBeenCalled();
  });

  it('queries with 14-day threshold', async () => {
    const req = cronRequest('/api/cron/expire-invites', 'cron_secret_abc');
    await handleExpireInvites(req, makeEnv());
    expect(inviteRepo.listSentInvitesOlderThan).toHaveBeenCalledWith(14, expect.anything());
  });
});

// ============================================================
// 2. POST /api/cron/retry-invites
// ============================================================

describe('POST /api/cron/retry-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(inviteRepo.listPendingInvites).mockResolvedValue([]);
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(mockEnquiry);
    vi.mocked(inviteRepo.markInviteSent).mockResolvedValue(undefined);
    vi.mocked(inviteRepo.markInviteFailed).mockResolvedValue(undefined);
    vi.mocked(inviteRepo.incrementSendAttempts).mockResolvedValue(undefined);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({ success: true, id: 'em_001' });
  });

  it('returns 401 without CRON_SECRET', async () => {
    const req = cronRequest('/api/cron/retry-invites');
    const { status } = await parseResponse(await handleRetryInvites(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('sends invite and marks as sent on success', async () => {
    vi.mocked(inviteRepo.listPendingInvites).mockResolvedValue([pendingInvite]);

    const req = cronRequest('/api/cron/retry-invites', 'cron_secret_abc');
    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { retried: number; failed: number };
    }>(await handleRetryInvites(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.retried).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(inviteRepo.markInviteSent).toHaveBeenCalledWith('inv_pending', expect.anything());
    expect(enquiryRepo.appendEnquiryEvent).toHaveBeenCalledWith(
      'enq_001',
      { type: 'invite_resent' },
      expect.anything()
    );
  });

  it('marks invite as failed after reaching MAX_ATTEMPTS (3)', async () => {
    // send_attempts = 2 → this is the 3rd attempt → should fail and mark as failed
    const almostFailedInvite = { ...pendingInvite, send_attempts: 2 };
    vi.mocked(inviteRepo.listPendingInvites).mockResolvedValue([almostFailedInvite]);
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({
      success: false,
      error: 'Resend timeout',
    });

    const req = cronRequest('/api/cron/retry-invites', 'cron_secret_abc');
    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { retried: number; failed: number };
    }>(await handleRetryInvites(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.retried).toBe(0);
    expect(body.data.failed).toBe(1);
    expect(inviteRepo.incrementSendAttempts).toHaveBeenCalledWith(
      'inv_pending',
      'Resend timeout',
      expect.anything()
    );
    expect(inviteRepo.markInviteFailed).toHaveBeenCalledWith('inv_pending', expect.anything());
  });

  it('does not mark as failed when under MAX_ATTEMPTS', async () => {
    // send_attempts = 1 → this is the 2nd attempt → increment only, no fail
    const partiallyFailedInvite = { ...pendingInvite, send_attempts: 1 };
    vi.mocked(inviteRepo.listPendingInvites).mockResolvedValue([partiallyFailedInvite]);
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({
      success: false,
      error: 'Resend down',
    });

    const req = cronRequest('/api/cron/retry-invites', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { failed: number } }>(
      await handleRetryInvites(req, makeEnv())
    );

    expect(body.data.failed).toBe(0);
    expect(inviteRepo.incrementSendAttempts).toHaveBeenCalled();
    expect(inviteRepo.markInviteFailed).not.toHaveBeenCalled();
  });

  it('skips invites whose enquiry cannot be found', async () => {
    vi.mocked(inviteRepo.listPendingInvites).mockResolvedValue([pendingInvite]);
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(null);

    const req = cronRequest('/api/cron/retry-invites', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { retried: number } }>(
      await handleRetryInvites(req, makeEnv())
    );

    expect(body.data.retried).toBe(0);
    expect(emailTemplates.sendBookingInvite).not.toHaveBeenCalled();
  });
});

// ============================================================
// 3. POST /api/cron/send-reminders
// ============================================================

describe('POST /api/cron/send-reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([]);
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(mockEnquiry);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
    vi.mocked(emailTemplates.sendBookingReminder).mockResolvedValue({
      success: true,
      id: 'em_rem_001',
    });
  });

  it('returns 401 without CRON_SECRET', async () => {
    const req = cronRequest('/api/cron/send-reminders');
    const { status } = await parseResponse(await handleSendReminders(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('sends reminder for a confirmed booking 7 days ahead', async () => {
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([mockBooking]);

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { sent: number; skipped: number };
    }>(await handleSendReminders(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.sent).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(emailTemplates.sendBookingReminder).toHaveBeenCalledWith(
      mockEnquiry,
      mockBooking,
      'East Grinstead Leisure Centre',
      expect.anything()
    );
    expect(enquiryRepo.appendEnquiryEvent).toHaveBeenCalledWith(
      'enq_001',
      { type: 'reminder_sent', booking_id: 'bkg_001' },
      expect.anything()
    );
  });

  it('skips booking when reminder_sent event already exists (idempotency)', async () => {
    const enquiryWithReminder = {
      ...mockEnquiry,
      events: JSON.stringify([
        { type: 'reminder_sent', booking_id: 'bkg_001', timestamp: '2026-03-06T09:00:00.000Z' },
      ]),
    };
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([mockBooking]);
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiryWithReminder);

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { sent: number; skipped: number } }>(
      await handleSendReminders(req, makeEnv())
    );

    expect(body.data.sent).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(emailTemplates.sendBookingReminder).not.toHaveBeenCalled();
  });

  it('skips non-confirmed bookings', async () => {
    const cancelledBooking = { ...mockBooking, status: 'cancelled' as const };
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([cancelledBooking]);

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { sent: number; skipped: number } }>(
      await handleSendReminders(req, makeEnv())
    );

    expect(body.data.sent).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(emailTemplates.sendBookingReminder).not.toHaveBeenCalled();
  });

  it('returns sent: 0 when no bookings on target date', async () => {
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([]);

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { sent: number } }>(
      await handleSendReminders(req, makeEnv())
    );

    expect(body.data.sent).toBe(0);
  });

  it('uses Tuesday location when session is on a Tuesday', async () => {
    // 2026-04-07 is a Tuesday
    const tuesdayBooking = { ...mockBooking, session_date: '2026-04-07' };
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([tuesdayBooking]);
    vi.mocked(getConfig).mockResolvedValue({
      ...mockConfig,
      location_tuesday: 'Meridian Sports Ground',
    });

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    await handleSendReminders(req, makeEnv());

    expect(emailTemplates.sendBookingReminder).toHaveBeenCalledWith(
      mockEnquiry,
      tuesdayBooking,
      'Meridian Sports Ground',
      expect.anything()
    );
  });

  it('uses Thursday location when session is on a Thursday', async () => {
    // 2026-04-09 is a Thursday
    const thursdayBooking = { ...mockBooking, session_date: '2026-04-09' };
    vi.mocked(bookingRepo.listBookingsForDate).mockResolvedValue([thursdayBooking]);
    vi.mocked(getConfig).mockResolvedValue({
      ...mockConfig,
      location_thursday: 'East Grinstead Sports Ground',
    });

    const req = cronRequest('/api/cron/send-reminders', 'cron_secret_abc');
    await handleSendReminders(req, makeEnv());

    expect(emailTemplates.sendBookingReminder).toHaveBeenCalledWith(
      mockEnquiry,
      thursdayBooking,
      'East Grinstead Sports Ground',
      expect.anything()
    );
  });
});

// ============================================================
// 4. POST /api/cron/academy-rollover
// ============================================================

const pastDate = '2025-08-31'; // a date in the past
const futureDate = '2027-08-31'; // a date in the future

const expiredOpenSeason = {
  id: 'acs_2025',
  code: 'academy-2025',
  label: 'Academy 2025',
  start_date: '2025-04-01',
  end_date: pastDate,
  capacity: 40,
  status: 'open' as const,
  age_group_id: 'ag_u11',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: null,
};

const upcomingSeason = {
  id: 'acs_2026',
  code: 'academy-2026',
  label: 'Academy 2026',
  start_date: '2026-04-01',
  end_date: futureDate,
  capacity: 40,
  status: 'upcoming' as const,
  age_group_id: 'ag_u11',
  created_at: '2025-09-01T00:00:00.000Z',
  updated_at: null,
};

const waitingEntry = {
  id: 'awl_001',
  enquiry_id: 'enq_001',
  season_id: 'acs_2025',
  token: 'waitlist_token',
  position: null,
  status: 'waiting' as const,
  is_returning: 0,
  rolled_over_from_season_id: null,
  invited_at: null,
  responded_at: null,
  response: null,
  send_attempts: 0,
  last_send_error: null,
  created_at: '2025-02-01T00:00:00.000Z',
  environment: 'development' as const,
};

describe('POST /api/cron/academy-rollover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(academyRepo.listAcademySeasons).mockResolvedValue([]);
    vi.mocked(academyRepo.listWaitlistBySeason).mockResolvedValue([]);
    vi.mocked(academyRepo.rolloverWaitlistEntry).mockResolvedValue(undefined);
    vi.mocked(academyRepo.hasAcceptedEntryForEnquiry).mockResolvedValue(false);
    vi.mocked(academyRepo.updateSeasonStatus).mockResolvedValue(undefined);
    vi.mocked(academyRepo.getUpcomingAcademySeason).mockResolvedValue(null);
  });

  it('returns 401 without CRON_SECRET', async () => {
    const req = cronRequest('/api/cron/academy-rollover');
    const { status } = await parseResponse(await handleAcademyRollover(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('returns zeroes when no open seasons have expired (idempotent no-op)', async () => {
    // No 'open' seasons at all
    vi.mocked(academyRepo.listAcademySeasons).mockResolvedValue([upcomingSeason]);

    const req = cronRequest('/api/cron/academy-rollover', 'cron_secret_abc');
    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { rolledOver: number; seasonsClosed: number };
    }>(await handleAcademyRollover(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.rolledOver).toBe(0);
    expect(body.data.seasonsClosed).toBe(0);
    expect(academyRepo.updateSeasonStatus).not.toHaveBeenCalled();
  });

  it('rolls over waiting entries and closes expired open season', async () => {
    vi.mocked(academyRepo.listAcademySeasons).mockResolvedValue([
      expiredOpenSeason,
      upcomingSeason,
    ]);
    vi.mocked(academyRepo.getUpcomingAcademySeason).mockResolvedValue(upcomingSeason);
    vi.mocked(academyRepo.listWaitlistBySeason).mockResolvedValue([waitingEntry]);
    vi.mocked(academyRepo.hasAcceptedEntryForEnquiry).mockResolvedValue(false);

    const req = cronRequest('/api/cron/academy-rollover', 'cron_secret_abc');
    const { status, body } = await parseResponse<{
      ok: boolean;
      data: { rolledOver: number; seasonsClosed: number };
    }>(await handleAcademyRollover(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.rolledOver).toBe(1);
    expect(body.data.seasonsClosed).toBe(1);

    expect(academyRepo.rolloverWaitlistEntry).toHaveBeenCalledWith(
      'awl_001',
      'acs_2026',
      'acs_2025',
      false, // not returning
      expect.anything()
    );
    expect(academyRepo.updateSeasonStatus).toHaveBeenCalledWith(
      'acs_2025',
      'closed',
      expect.anything()
    );
  });

  it('sets is_returning = true for athletes accepted in a previous season', async () => {
    vi.mocked(academyRepo.listAcademySeasons).mockResolvedValue([expiredOpenSeason]);
    vi.mocked(academyRepo.getUpcomingAcademySeason).mockResolvedValue(null);
    vi.mocked(academyRepo.listWaitlistBySeason).mockResolvedValue([waitingEntry]);
    vi.mocked(academyRepo.hasAcceptedEntryForEnquiry).mockResolvedValue(true); // returning!

    const req = cronRequest('/api/cron/academy-rollover', 'cron_secret_abc');
    await handleAcademyRollover(req, makeEnv());

    expect(academyRepo.rolloverWaitlistEntry).toHaveBeenCalledWith(
      'awl_001',
      null, // no upcoming season — goes to unassigned pool
      'acs_2025',
      true, // is_returning
      expect.anything()
    );
  });

  it('does not roll over accepted or declined entries', async () => {
    const acceptedEntry = { ...waitingEntry, id: 'awl_accepted', status: 'accepted' as const };
    const declinedEntry = { ...waitingEntry, id: 'awl_declined', status: 'declined' as const };

    vi.mocked(academyRepo.listAcademySeasons).mockResolvedValue([expiredOpenSeason]);
    vi.mocked(academyRepo.getUpcomingAcademySeason).mockResolvedValue(upcomingSeason);
    vi.mocked(academyRepo.listWaitlistBySeason).mockResolvedValue([acceptedEntry, declinedEntry]);

    const req = cronRequest('/api/cron/academy-rollover', 'cron_secret_abc');
    const { body } = await parseResponse<{ ok: boolean; data: { rolledOver: number } }>(
      await handleAcademyRollover(req, makeEnv())
    );

    expect(body.data.rolledOver).toBe(0);
    expect(academyRepo.rolloverWaitlistEntry).not.toHaveBeenCalled();
    // Season still gets closed
    expect(academyRepo.updateSeasonStatus).toHaveBeenCalledWith(
      'acs_2025',
      'closed',
      expect.anything()
    );
  });
});

// ============================================================
// EGAC Platform — Admin Handler Tests
// tests/unit/admin.test.ts
//
// Tests all admin API handlers with mocked repositories.
// Covers:
//   - Auth enforcement (401 on missing/wrong/production-dev token)
//   - GET  /api/admin/enquiries — list with pagination
//   - POST /api/admin/enquiries — manual enquiry creation
//   - GET  /api/admin/enquiries/:id — detail with events/invite/bookings
//   - GET  /api/admin/enquiries/:id — 404 for unknown id
//   - PATCH /api/admin/enquiries/:id — note update
//   - POST /api/admin/invites/resend — reuses pending invite
//   - POST /api/admin/invites/resend — creates new invite when none exists
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all repository and email modules before importing handlers

vi.mock('../../src/lib/repositories/enquiries.js', () => ({
  listEnquiries: vi.fn(),
  insertEnquiry: vi.fn(),
  getEnquiryByEmail: vi.fn(),
  getEnquiryById: vi.fn(),
  updateEnquiry: vi.fn(),
  appendEnquiryEvent: vi.fn(),
}));

vi.mock('../../src/lib/repositories/invites.js', () => ({
  getInviteById: vi.fn(),
  getInviteByEnquiryId: vi.fn(),
  createInviteForEnquiry: vi.fn(),
  markInviteSent: vi.fn(),
}));

vi.mock('../../src/lib/repositories/bookings.js', () => ({
  listBookingsByEnquiry: vi.fn(),
}));

vi.mock('../../src/lib/email/templates.js', () => ({
  sendBookingInvite: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  getSystemConfig: vi.fn(),
}));

vi.mock('../../src/lib/business/age.js', () => ({
  getNextNTuesdayDates: vi.fn().mockReturnValue(['2026-06-10', '2026-06-17']),
}));

import { handleAdminEnquiries } from '../../src/api/admin/enquiries.js';
import { handleAdminEnquiryDetail } from '../../src/api/admin/enquiry-detail.js';
import { handleAdminInviteResend } from '../../src/api/admin/invites.js';

import * as enquiryRepo from '../../src/lib/repositories/enquiries.js';
import * as inviteRepo from '../../src/lib/repositories/invites.js';
import * as bookingRepo from '../../src/lib/repositories/bookings.js';
import * as emailTemplates from '../../src/lib/email/templates.js';
import { getSystemConfig } from '../../src/lib/config.js';

import type { Env, Enquiry, Invite, Booking } from '../../src/lib/db/schema.js';

// ============================================================
// Global reset — clear mock call history before each test
// ============================================================

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Shared helpers
// ============================================================

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    RESEND_API_KEY: 'test',
    ADMIN_TOKEN: 'secret_token',
    ADMIN_EMAIL: 'admin@egac.co.uk',
    EMAIL_FROM: 'noreply@egac.co.uk',
    CRON_SECRET: 'cron_secret',
    APP_ENV: 'development',
    ...overrides,
  };
}

function adminRequest(
  path: string,
  method: string = 'GET',
  options: {
    token?: string | null;
    body?: unknown;
    headerStyle?: 'bearer' | 'x-admin-token';
  } = {}
): Request {
  const { token, body, headerStyle = 'bearer' } = options;
  const headers: Record<string, string> = {};

  if (token !== null) {
    const t = token ?? 'secret_token';
    if (headerStyle === 'x-admin-token') {
      headers['x-admin-token'] = t;
    } else {
      headers['Authorization'] = `Bearer ${t}`;
    }
  }

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return new Request(`https://egac.pages.dev${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function makeEnquiry(overrides: Partial<Enquiry> = {}): Enquiry {
  return {
    id: 'enq_test01',
    created_at: '2025-01-15T10:00:00.000Z',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: null,
    dob: '2015-06-01',
    source: 'website',
    processed: 0,
    age_group_id: null,
    note: null,
    raw_payload: null,
    events: '[]',
    invite_id: null,
    environment: 'development',
    ...overrides,
  };
}

function makeInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'inv_test01',
    token: 'tok_abc123',
    enquiry_id: 'enq_test01',
    created_at: '2025-01-15T10:00:00.000Z',
    sent_at: null,
    accepted_at: null,
    status: 'pending',
    send_attempts: 0,
    last_send_error: null,
    environment: 'development',
    ...overrides,
  };
}

async function parse<T = unknown>(response: Response): Promise<{ status: number; body: T }> {
  return { status: response.status, body: (await response.json()) as T };
}

// ============================================================
// Auth enforcement
// ============================================================

describe('Admin auth', () => {
  beforeEach(() => {
    vi.mocked(enquiryRepo.listEnquiries).mockResolvedValue([]);
  });

  it('returns 401 when no auth header is provided', async () => {
    const req = new Request('https://egac.pages.dev/api/admin/enquiries', { method: 'GET' });
    const { status } = await parse(await handleAdminEnquiries(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('returns 401 on wrong token', async () => {
    const req = adminRequest('/api/admin/enquiries', 'GET', { token: 'wrong_token' });
    const { status } = await parse(await handleAdminEnquiries(req, makeEnv()));
    expect(status).toBe(401);
  });

  it('returns 401 for "dev" token in production environment', async () => {
    const req = adminRequest('/api/admin/enquiries', 'GET', { token: 'dev' });
    const { status } = await parse(
      await handleAdminEnquiries(req, makeEnv({ APP_ENV: 'production' }))
    );
    expect(status).toBe(401);
  });

  it('accepts "dev" token in development environment', async () => {
    const req = adminRequest('/api/admin/enquiries', 'GET', { token: 'dev' });
    const { status } = await parse(
      await handleAdminEnquiries(req, makeEnv({ APP_ENV: 'development' }))
    );
    expect(status).toBe(200);
  });

  it('accepts the correct ADMIN_TOKEN in any environment', async () => {
    const env = makeEnv({ APP_ENV: 'production', ADMIN_TOKEN: 'real_prod_token' });
    const req = adminRequest('/api/admin/enquiries', 'GET', { token: 'real_prod_token' });
    const { status } = await parse(await handleAdminEnquiries(req, env));
    expect(status).toBe(200);
  });

  it('accepts token via x-admin-token header', async () => {
    const req = adminRequest('/api/admin/enquiries', 'GET', {
      token: 'secret_token',
      headerStyle: 'x-admin-token',
    });
    const { status } = await parse(await handleAdminEnquiries(req, makeEnv()));
    expect(status).toBe(200);
  });
});

// ============================================================
// GET /api/admin/enquiries
// ============================================================

describe('GET /api/admin/enquiries', () => {
  beforeEach(() => {
    vi.mocked(enquiryRepo.listEnquiries).mockResolvedValue([]);
  });

  it('returns paginated enquiry list', async () => {
    const enquiries = [makeEnquiry(), makeEnquiry({ id: 'enq_test02', email: 'bob@example.com' })];
    vi.mocked(enquiryRepo.listEnquiries).mockResolvedValue(enquiries);

    const req = adminRequest('/api/admin/enquiries');
    const { status, body } = await parse<{
      ok: boolean;
      data: { enquiries: Enquiry[]; page: number; hasNextPage: boolean };
    }>(await handleAdminEnquiries(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.enquiries).toHaveLength(2);
    expect(body.data.page).toBe(1);
    expect(body.data.hasNextPage).toBe(false);
  });

  it('detects next page when more than PAGE_SIZE rows are returned', async () => {
    // Return 21 rows (PAGE_SIZE=20) to trigger hasNextPage
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeEnquiry({ id: `enq_${i}`, email: `user${i}@example.com` })
    );
    vi.mocked(enquiryRepo.listEnquiries).mockResolvedValue(rows);

    const req = adminRequest('/api/admin/enquiries');
    const { status, body } = await parse<{
      ok: boolean;
      data: { enquiries: Enquiry[]; hasNextPage: boolean };
    }>(await handleAdminEnquiries(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.enquiries).toHaveLength(20);
    expect(body.data.hasNextPage).toBe(true);
  });

  it('passes status filter to repository', async () => {
    const req = adminRequest('/api/admin/enquiries?status=pending');
    await handleAdminEnquiries(req, makeEnv());
    expect(enquiryRepo.listEnquiries).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
      expect.anything()
    );
  });
});

// ============================================================
// POST /api/admin/enquiries
// ============================================================

describe('POST /api/admin/enquiries', () => {
  beforeEach(() => {
    vi.mocked(enquiryRepo.getEnquiryByEmail).mockResolvedValue(null);
    vi.mocked(enquiryRepo.insertEnquiry).mockImplementation(async (data) => ({
      ...makeEnquiry(),
      id: data.id,
      email: data.email,
    }));
  });

  it('creates a new enquiry and returns 201', async () => {
    const req = adminRequest('/api/admin/enquiries', 'POST', {
      body: { name: 'Bob Jones', email: 'bob@example.com' },
    });
    const { status, body } = await parse<{
      ok: boolean;
      data: { enquiry_id: string; already_existed: boolean };
    }>(await handleAdminEnquiries(req, makeEnv()));

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.already_existed).toBe(false);
    expect(body.data.enquiry_id).toBeTruthy();
    expect(enquiryRepo.insertEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com', source: 'admin' }),
      expect.anything()
    );
  });

  it('returns existing enquiry when email already registered', async () => {
    vi.mocked(enquiryRepo.getEnquiryByEmail).mockResolvedValue(makeEnquiry({ id: 'enq_existing' }));

    const req = adminRequest('/api/admin/enquiries', 'POST', {
      body: { email: 'alice@example.com' },
    });
    const { status, body } = await parse<{
      ok: boolean;
      data: { enquiry_id: string; already_existed: boolean };
    }>(await handleAdminEnquiries(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.already_existed).toBe(true);
    expect(body.data.enquiry_id).toBe('enq_existing');
    expect(enquiryRepo.insertEnquiry).not.toHaveBeenCalled();
  });

  it('returns 422 when email is missing', async () => {
    const req = adminRequest('/api/admin/enquiries', 'POST', {
      body: { name: 'No Email' },
    });
    const { status } = await parse(await handleAdminEnquiries(req, makeEnv()));
    expect(status).toBe(422);
  });

  it('returns 422 when email is invalid', async () => {
    const req = adminRequest('/api/admin/enquiries', 'POST', {
      body: { email: 'not-an-email' },
    });
    const { status } = await parse(await handleAdminEnquiries(req, makeEnv()));
    expect(status).toBe(422);
  });
});

// ============================================================
// GET /api/admin/enquiries/:id
// ============================================================

describe('GET /api/admin/enquiries/:id', () => {
  beforeEach(() => {
    vi.mocked(inviteRepo.getInviteById).mockResolvedValue(null);
    vi.mocked(bookingRepo.listBookingsByEnquiry).mockResolvedValue([]);
  });

  it('returns enquiry detail with events, invite and bookings', async () => {
    const enquiry = makeEnquiry({
      invite_id: 'inv_test01',
      events: JSON.stringify([
        { type: 'booking_invite_sent', timestamp: '2025-01-16T09:00:00.000Z' },
      ]),
    });
    const invite = makeInvite({ status: 'sent' });
    const bookings: Booking[] = [
      {
        id: 'bkg_01',
        enquiry_id: 'enq_test01',
        invite_id: 'inv_test01',
        age_group_id: 'ag_01',
        session_date: '2025-02-04',
        session_time: null,
        status: 'confirmed',
        attendance_note: null,
        created_at: '2025-01-16T09:05:00.000Z',
        updated_at: null,
        environment: 'development',
      },
    ];

    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(inviteRepo.getInviteById).mockResolvedValue(invite);
    vi.mocked(bookingRepo.listBookingsByEnquiry).mockResolvedValue(bookings);

    const req = adminRequest('/api/admin/enquiries/enq_test01');
    const { status, body } = await parse<{
      ok: boolean;
      data: { enquiry: Enquiry; events: unknown[]; invite: Invite | null; bookings: Booking[] };
    }>(await handleAdminEnquiryDetail(req, makeEnv(), 'enq_test01'));

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.enquiry.id).toBe('enq_test01');
    expect(body.data.events).toHaveLength(1);
    expect(body.data.invite?.status).toBe('sent');
    expect(body.data.bookings).toHaveLength(1);
  });

  it('returns 404 when enquiry is not found', async () => {
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(null);

    const req = adminRequest('/api/admin/enquiries/enq_unknown');
    const { status, body } = await parse<{ ok: boolean; code: string }>(
      await handleAdminEnquiryDetail(req, makeEnv(), 'enq_unknown')
    );

    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns events sorted newest-first', async () => {
    const enquiry = makeEnquiry({
      events: JSON.stringify([
        { type: 'booking_invite_sent', timestamp: '2025-01-15T08:00:00.000Z' },
        { type: 'reminder_sent', timestamp: '2025-01-20T08:00:00.000Z' },
      ]),
    });
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);

    const req = adminRequest('/api/admin/enquiries/enq_test01');
    const { body } = await parse<{
      data: { events: Array<{ type: string; timestamp: string }> };
    }>(await handleAdminEnquiryDetail(req, makeEnv(), 'enq_test01'));

    expect(body.data.events[0].type).toBe('reminder_sent');
    expect(body.data.events[1].type).toBe('booking_invite_sent');
  });
});

// ============================================================
// PATCH /api/admin/enquiries/:id
// ============================================================

describe('PATCH /api/admin/enquiries/:id', () => {
  it('updates the note field', async () => {
    const enquiry = makeEnquiry();
    const updated = makeEnquiry({ note: 'New admin note' });
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(enquiryRepo.updateEnquiry).mockResolvedValue(updated);

    const req = adminRequest('/api/admin/enquiries/enq_test01', 'PATCH', {
      body: { note: 'New admin note' },
    });
    const { status, body } = await parse<{ ok: boolean; data: { enquiry: Enquiry } }>(
      await handleAdminEnquiryDetail(req, makeEnv(), 'enq_test01')
    );

    expect(status).toBe(200);
    expect(body.data.enquiry.note).toBe('New admin note');
    expect(enquiryRepo.updateEnquiry).toHaveBeenCalledWith(
      'enq_test01',
      { note: 'New admin note' },
      expect.anything()
    );
  });

  it('returns 404 when enquiry not found on PATCH', async () => {
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(null);

    const req = adminRequest('/api/admin/enquiries/enq_missing', 'PATCH', {
      body: { note: 'test' },
    });
    const { status } = await parse(await handleAdminEnquiryDetail(req, makeEnv(), 'enq_missing'));
    expect(status).toBe(404);
  });
});

// ============================================================
// POST /api/admin/invites/resend
// ============================================================

describe('POST /api/admin/invites/resend', () => {
  const mockConfig = {
    site_url: 'https://egac.pages.dev',
    site_name: 'EGAC',
    weeks_ahead_booking: '8',
    capacity_per_slot: '2',
    email_from: 'noreply@egac.co.uk',
    venue_name: 'East Grinstead Leisure Centre',
    venue_address: 'King Street',
    admin_email: 'admin@egac.co.uk',
    academy_max_age: '10',
  };

  beforeEach(() => {
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(emailTemplates.sendBookingInvite).mockResolvedValue({ success: true });
    vi.mocked(inviteRepo.markInviteSent).mockResolvedValue(undefined);
    vi.mocked(enquiryRepo.appendEnquiryEvent).mockResolvedValue(undefined);
  });

  it('reuses an existing pending invite (reused: true)', async () => {
    const enquiry = makeEnquiry();
    const existingInvite = makeInvite({ status: 'pending' });

    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(inviteRepo.getInviteByEnquiryId).mockResolvedValue(existingInvite);

    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: { enquiry_id: 'enq_test01' },
    });
    const { status, body } = await parse<{
      ok: boolean;
      data: { invite_id: string; reused: boolean };
    }>(await handleAdminInviteResend(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.reused).toBe(true);
    expect(body.data.invite_id).toBe('inv_test01');
    expect(inviteRepo.createInviteForEnquiry).not.toHaveBeenCalled();
  });

  it('reuses an existing sent invite (reused: true)', async () => {
    const enquiry = makeEnquiry();
    const existingInvite = makeInvite({ status: 'sent' });

    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(inviteRepo.getInviteByEnquiryId).mockResolvedValue(existingInvite);

    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: { enquiry_id: 'enq_test01' },
    });
    const { status, body } = await parse<{ ok: boolean; data: { reused: boolean } }>(
      await handleAdminInviteResend(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.data.reused).toBe(true);
  });

  it('creates a new invite when no invite exists (reused: false)', async () => {
    const enquiry = makeEnquiry();
    const newInvite = makeInvite({ id: 'inv_new01' });

    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(inviteRepo.getInviteByEnquiryId).mockResolvedValue(null);
    vi.mocked(inviteRepo.createInviteForEnquiry).mockResolvedValue(newInvite);

    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: { enquiry_id: 'enq_test01' },
    });
    const { status, body } = await parse<{
      ok: boolean;
      data: { invite_id: string; reused: boolean };
    }>(await handleAdminInviteResend(req, makeEnv()));

    expect(status).toBe(200);
    expect(body.data.reused).toBe(false);
    expect(body.data.invite_id).toBe('inv_new01');
    expect(inviteRepo.createInviteForEnquiry).toHaveBeenCalled();
  });

  it('creates a new invite when existing invite is expired (reused: false)', async () => {
    const enquiry = makeEnquiry();
    const expiredInvite = makeInvite({ status: 'expired' });
    const newInvite = makeInvite({ id: 'inv_new02' });

    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(enquiry);
    vi.mocked(inviteRepo.getInviteByEnquiryId).mockResolvedValue(expiredInvite);
    vi.mocked(inviteRepo.createInviteForEnquiry).mockResolvedValue(newInvite);

    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: { enquiry_id: 'enq_test01' },
    });
    const { status, body } = await parse<{ ok: boolean; data: { reused: boolean } }>(
      await handleAdminInviteResend(req, makeEnv())
    );

    expect(status).toBe(200);
    expect(body.data.reused).toBe(false);
    expect(inviteRepo.createInviteForEnquiry).toHaveBeenCalled();
  });

  it('returns 404 when enquiry is not found', async () => {
    vi.mocked(enquiryRepo.getEnquiryById).mockResolvedValue(null);

    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: { enquiry_id: 'enq_missing' },
    });
    const { status } = await parse(await handleAdminInviteResend(req, makeEnv()));
    expect(status).toBe(404);
  });

  it('returns 422 when enquiry_id is missing', async () => {
    const req = adminRequest('/api/admin/invites/resend', 'POST', {
      body: {},
    });
    const { status } = await parse(await handleAdminInviteResend(req, makeEnv()));
    expect(status).toBe(422);
  });
});

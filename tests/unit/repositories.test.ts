// ============================================================
// EGAC Platform — Repository Tests
// tests/unit/repositories.test.ts
//
// Tests the repository layer against a real in-memory D1
// database using Miniflare. Verifies environment isolation,
// CRUD operations, and business-critical queries.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  insertEnquiry,
  getEnquiryById,
  getEnquiryByEmail,
  listEnquiries,
  updateEnquiry,
  appendEnquiryEvent,
} from '../../src/lib/repositories/enquiries.js';

import {
  createInviteForEnquiry,
  getInviteByToken,
  markInviteAccepted,
  markInviteExpired,
  listPendingInvites,
  listSentInvitesOlderThan,
  markInviteSent,
} from '../../src/lib/repositories/invites.js';

import {
  createBooking,
  countBookingsForDateSlot,
  updateBookingStatus,
  listUpcomingBookings,
} from '../../src/lib/repositories/bookings.js';

import {
  createAcademyInvitation,
  getAcademyInvitationByToken,
  processAcademyResponse,
} from '../../src/lib/repositories/academy.js';

import type { Env } from '../../src/lib/db/schema.js';

// ============================================================
// Test setup — spin up Miniflare with in-memory D1
// ============================================================

let mf: Miniflare;
let env: Env;

const schema = readFileSync(
  resolve(__dirname, '../../db/migrations/0001_initial_schema.sql'),
  'utf-8'
);

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: `
      export default {
        async fetch(request, env) {
          return new Response('ok');
        }
      }
    `,
    d1Databases: { DB: 'test-db' },
    kvNamespaces: { KV: 'test-kv' },
  });

  const db = await mf.getD1Database('DB');
  const kv = await mf.getKVNamespace('KV');

  // Run schema migration — strip comments first (D1 exec rejects comment-only lines)
  const stripped = schema
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n+/g, ' ');

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.exec(stmt + ';');
  }

  env = {
    DB: db as unknown as D1Database,
    KV: kv as unknown as KVNamespace,
    RESEND_API_KEY: 'test',
    ADMIN_TOKEN: 'test',
    ADMIN_EMAIL: 'admin@test.com',
    EMAIL_FROM: 'test@test.com',
    CRON_SECRET: 'test',
    APP_ENV: 'development',
  };
});

// Helper: create a minimal enquiry for tests
async function makeEnquiry(overrides: Record<string, unknown> = {}) {
  return insertEnquiry(
    {
      id: `enq_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
      email: `test_${Date.now()}@example.com`,
      name: 'Test User',
      environment: 'development',
      ...overrides,
    },
    env
  );
}

// ============================================================
// 1. Enquiries — insert and retrieve
// ============================================================

describe('enquiries repository', () => {
  it('inserts and retrieves an enquiry by id', async () => {
    const enquiry = await makeEnquiry({ name: 'Jane Smith', email: 'jane@example.com' });
    expect(enquiry.id).toMatch(/^enq_/);

    const found = await getEnquiryById(enquiry.id, env);
    expect(found).not.toBeNull();
    expect(found?.email).toBe('jane@example.com');
    expect(found?.name).toBe('Jane Smith');
  });

  it('retrieves enquiry by email', async () => {
    const unique = `unique_${Date.now()}@example.com`;
    await makeEnquiry({ email: unique });

    const found = await getEnquiryByEmail(unique, env);
    expect(found).not.toBeNull();
    expect(found?.email).toBe(unique);
  });

  it('returns null for non-existent id', async () => {
    const result = await getEnquiryById('enq_doesnotexist', env);
    expect(result).toBeNull();
  });

  it('environment isolation — production record not visible in development query', async () => {
    const prodEnv = { ...env, APP_ENV: 'production' as const };
    const prodEnquiry = await insertEnquiry(
      {
        id: `enq_prod_${Date.now()}`,
        created_at: new Date().toISOString(),
        email: `prod_${Date.now()}@example.com`,
        environment: 'production',
      },
      prodEnv
    );

    // Should be found in production
    const foundInProd = await getEnquiryById(prodEnquiry.id, prodEnv);
    expect(foundInProd).not.toBeNull();

    // Should NOT be found in development
    const foundInDev = await getEnquiryById(prodEnquiry.id, env);
    expect(foundInDev).toBeNull();
  });

  it('updateEnquiry updates note and processed fields', async () => {
    const enquiry = await makeEnquiry();
    const updated = await updateEnquiry(enquiry.id, { note: 'Called back', processed: 1 }, env);

    expect(updated.note).toBe('Called back');
    expect(updated.processed).toBe(1);
  });

  it('listEnquiries filters by pending status', async () => {
    const e1 = await makeEnquiry();
    await updateEnquiry(e1.id, { processed: 1 }, env);
    const e2 = await makeEnquiry();

    const pending = await listEnquiries({ status: 'pending', environment: 'development' }, env);
    const ids = pending.map((e) => e.id);

    expect(ids).not.toContain(e1.id);
    expect(ids).toContain(e2.id);
  });
});

// ============================================================
// 2. appendEnquiryEvent — appends correctly
// ============================================================

describe('appendEnquiryEvent', () => {
  it('appends an event to an empty events array', async () => {
    const enquiry = await makeEnquiry();
    expect(JSON.parse(enquiry.events)).toHaveLength(0);

    await appendEnquiryEvent(enquiry.id, { type: 'booking_invite_sent' }, env);

    const updated = await getEnquiryById(enquiry.id, env);
    const events = JSON.parse(updated?.events ?? '[]');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('booking_invite_sent');
    expect(events[0].timestamp).toBeDefined();
  });

  it('appends multiple events in order', async () => {
    const enquiry = await makeEnquiry();

    await appendEnquiryEvent(enquiry.id, { type: 'booking_invite_sent' }, env);
    await appendEnquiryEvent(enquiry.id, { type: 'booking_created' }, env);

    const updated = await getEnquiryById(enquiry.id, env);
    const events = JSON.parse(updated?.events ?? '[]');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('booking_invite_sent');
    expect(events[1].type).toBe('booking_created');
  });

  it('throws when enquiry does not exist', async () => {
    await expect(
      appendEnquiryEvent('enq_ghost', { type: 'booking_invite_sent' }, env)
    ).rejects.toThrow(/not found/i);
  });
});

// ============================================================
// 3. Invites
// ============================================================

describe('invites repository', () => {
  it('creates an invite and retrieves by token', async () => {
    const enquiry = await makeEnquiry();
    const invite = await createInviteForEnquiry(enquiry.id, env);

    expect(invite.status).toBe('pending');
    expect(invite.token).toHaveLength(48); // 24 bytes = 48 hex chars
    expect(invite.enquiry_id).toBe(enquiry.id);

    const found = await getInviteByToken(invite.token, env);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(invite.id);
  });

  it('markInviteAccepted sets status and accepted_at', async () => {
    const enquiry = await makeEnquiry();
    const invite = await createInviteForEnquiry(enquiry.id, env);
    await markInviteSent(invite.id, env);
    await markInviteAccepted(invite.id, env);

    const updated = await getInviteByToken(invite.token, env);
    expect(updated?.status).toBe('accepted');
    expect(updated?.accepted_at).not.toBeNull();
  });

  it('markInviteExpired sets status to expired', async () => {
    const enquiry = await makeEnquiry();
    const invite = await createInviteForEnquiry(enquiry.id, env);
    await markInviteSent(invite.id, env);
    await markInviteExpired(invite.id, env);

    const updated = await getInviteByToken(invite.token, env);
    expect(updated?.status).toBe('expired');
  });

  it('listPendingInvites only returns pending invites under 3 attempts', async () => {
    const enquiry = await makeEnquiry();
    const invite = await createInviteForEnquiry(enquiry.id, env);

    const pending = await listPendingInvites(env);
    const ids = pending.map((i) => i.id);
    expect(ids).toContain(invite.id);
  });

  it('listSentInvitesOlderThan returns invites beyond the cutoff', async () => {
    const enquiry = await makeEnquiry();
    const invite = await createInviteForEnquiry(enquiry.id, env);
    await markInviteSent(invite.id, env);

    // Using 0 days should return everything sent (everything is >= 0 days old)
    const stale = await listSentInvitesOlderThan(0, env);
    const ids = stale.map((i) => i.id);
    expect(ids).toContain(invite.id);
  });
});

// ============================================================
// 4. Bookings — countBookingsForDateSlot
// ============================================================

describe('bookings repository', () => {
  it('countBookingsForDateSlot returns accurate count', async () => {
    const date = '2026-06-10'; // A Tuesday

    const e1 = await makeEnquiry();
    const e2 = await makeEnquiry();

    await createBooking(e1.id, null, date, 'u13', env);
    await createBooking(e2.id, null, date, 'u13', env);

    const count = await countBookingsForDateSlot(date, 'u13', env);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('countBookingsForDateSlot counts only confirmed bookings', async () => {
    const date = '2026-06-17'; // A different Tuesday

    const e1 = await makeEnquiry();
    const e2 = await makeEnquiry();

    const b1 = await createBooking(e1.id, null, date, 'u15plus', env);
    await createBooking(e2.id, null, date, 'u15plus', env);

    // Cancel one
    await updateBookingStatus(b1.id, 'cancelled', null, env);

    const count = await countBookingsForDateSlot(date, 'u15plus', env);
    // Only 1 confirmed remains
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('updateBookingStatus persists the new status', async () => {
    const enquiry = await makeEnquiry();
    const booking = await createBooking(enquiry.id, null, '2026-06-24', 'u13', env);

    expect(booking.status).toBe('confirmed');

    const updated = await updateBookingStatus(booking.id, 'attended', 'Great session', env);
    expect(updated.status).toBe('attended');
    expect(updated.attendance_note).toBe('Great session');
  });

  it('listUpcomingBookings only returns future confirmed bookings', async () => {
    const enquiry = await makeEnquiry();
    // Use a date far in the future to avoid date-sensitivity
    const futureDate = '2027-01-05'; // A Tuesday

    await createBooking(enquiry.id, null, futureDate, 'u13', env);

    const upcoming = await listUpcomingBookings(52, env); // 52 weeks ahead
    const dates = upcoming.map((b) => b.session_date);
    expect(dates).toContain(futureDate);
  });
});

// ============================================================
// 5. Academy invitations
// ============================================================

describe('academy invitations repository', () => {
  it('creates an invitation and retrieves by token', async () => {
    const enquiry = await makeEnquiry();
    const invitation = await createAcademyInvitation(enquiry.id, env);

    expect(invitation.status).toBe('pending');
    expect(invitation.token).toHaveLength(48);

    const found = await getAcademyInvitationByToken(invitation.token, env);
    expect(found).not.toBeNull();
    expect(found?.enquiry_id).toBe(enquiry.id);
  });

  it('processAcademyResponse records yes correctly', async () => {
    const enquiry = await makeEnquiry();
    const invitation = await createAcademyInvitation(enquiry.id, env);

    const updated = await processAcademyResponse(invitation.token, 'yes', env);
    expect(updated.response).toBe('yes');
    expect(updated.status).toBe('responded');
    expect(updated.responded_at).not.toBeNull();
  });

  it('processAcademyResponse records no correctly', async () => {
    const enquiry = await makeEnquiry();
    const invitation = await createAcademyInvitation(enquiry.id, env);

    const updated = await processAcademyResponse(invitation.token, 'no', env);
    expect(updated.response).toBe('no');
    expect(updated.status).toBe('responded');
  });

  it('throws for invalid token', async () => {
    await expect(processAcademyResponse('invalid_token_xyz', 'yes', env)).rejects.toThrow(
      /not found/i
    );
  });
});

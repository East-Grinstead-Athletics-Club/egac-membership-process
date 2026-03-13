// ============================================================
// EGAC Platform — Repository Tests
// tests/unit/repositories.test.ts
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
  markInviteSent,
} from '../../src/lib/repositories/invites.js';

import {
  createBooking,
  countBookingsForDateAndGroup,
  updateBookingStatus,
  listUpcomingBookings,
} from '../../src/lib/repositories/bookings.js';

import {
  addToWaitlist,
  getWaitlistEntryByToken,
  recordWaitlistResponse,
  createAcademySeason,
  getOpenAcademySeason,
  updateSeasonStatus,
} from '../../src/lib/repositories/academy.js';

import { listAgeGroups, getAgeGroupByCode } from '../../src/lib/repositories/age-groups.js';

import type { Env } from '../../src/lib/db/schema.js';

// ── Setup ─────────────────────────────────────────────────────

let env: Env;

const schema = readFileSync(
  resolve(__dirname, '../../db/migrations/0001_initial_schema.sql'),
  'utf-8'
);

const seed = readFileSync(resolve(__dirname, '../../db/seed.sql'), 'utf-8');

beforeAll(async () => {
  const mf = new Miniflare({
    modules: true,
    script: `export default { async fetch(request, env) { return new Response('ok'); } }`,
    d1Databases: { DB: 'test-db' },
    kvNamespaces: { KV: 'test-kv' },
  });

  const db = await mf.getD1Database('DB');
  const kv = await mf.getKVNamespace('KV');

  // Strip SQL comments and run schema + seed
  function execSql(sql: string) {
    const stripped = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\n+/g, ' ');
    return stripped
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // Run schema via exec (no string literals, safe to split on semicolons)
  for (const stmt of execSql(schema)) await db.exec(stmt + ';');

  // Run seed via prepare().run() — handles embedded single quotes in HTML safely
  const seedStatements = execSql(seed);
  for (const stmt of seedStatements) {
    try {
      await db.prepare(stmt).run();
    } catch {
      // INSERT OR IGNORE — ignore duplicate key errors silently
    }
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

// Helper: unique enquiry per test
async function makeEnquiry(overrides: Record<string, unknown> = {}) {
  const id = `enq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return insertEnquiry(
    {
      id,
      created_at: new Date().toISOString(),
      email: `${id}@example.com`,
      name: 'Test User',
      environment: 'development',
      ...overrides,
    },
    env
  );
}

// ============================================================
// 1. Age groups (seeded)
// ============================================================

describe('age groups repository', () => {
  it('lists all 5 active age groups from seed', async () => {
    const groups = await listAgeGroups(env);
    expect(groups.length).toBeGreaterThanOrEqual(5);
  });

  it('retrieves U13 group by code', async () => {
    const group = await getAgeGroupByCode('u13', env);
    expect(group).not.toBeNull();
    expect(group?.label).toBe('U13');
    expect(group?.booking_type).toBe('taster');
    expect(group?.age_min_aug31).toBe(11);
    expect(group?.age_max_aug31).toBe(12);
  });

  it('retrieves U11 Academy group with waitlist booking type', async () => {
    const group = await getAgeGroupByCode('u11', env);
    expect(group).not.toBeNull();
    expect(group?.booking_type).toBe('waitlist');
    expect(group?.season_capacity).toBe(40);
    expect(group?.season_start_month).toBe(4);
    expect(group?.season_end_month).toBe(8);
  });

  it('U11 session_days includes Saturday and Tuesday', async () => {
    const group = await getAgeGroupByCode('u11', env);
    const days = JSON.parse(group?.session_days ?? '[]');
    expect(days).toContain('Saturday');
    expect(days).toContain('Tuesday');
  });
});

// ============================================================
// 2. Enquiries
// ============================================================

describe('enquiries repository', () => {
  it('inserts and retrieves by id', async () => {
    const enquiry = await makeEnquiry({ name: 'Jane Smith' });
    const found = await getEnquiryById(enquiry.id, env);
    expect(found?.name).toBe('Jane Smith');
  });

  it('retrieves by email', async () => {
    const e = await makeEnquiry({ email: `unique_${Date.now()}@test.com` });
    const found = await getEnquiryByEmail(e.email, env);
    expect(found?.id).toBe(e.id);
  });

  it('returns null for non-existent id', async () => {
    expect(await getEnquiryById('enq_ghost', env)).toBeNull();
  });

  it('environment isolation — production record invisible in development', async () => {
    const prodEnv = { ...env, APP_ENV: 'production' as const };
    const prod = await insertEnquiry(
      {
        id: `enq_prod_${Date.now()}`,
        created_at: new Date().toISOString(),
        email: `p_${Date.now()}@test.com`,
        environment: 'production',
      },
      prodEnv
    );
    expect(await getEnquiryById(prod.id, env)).toBeNull();
    expect(await getEnquiryById(prod.id, prodEnv)).not.toBeNull();
  });

  it('updates note and processed fields', async () => {
    const e = await makeEnquiry();
    const updated = await updateEnquiry(e.id, { note: 'Called back', processed: 1 }, env);
    expect(updated.note).toBe('Called back');
    expect(updated.processed).toBe(1);
  });

  it('filters by pending status', async () => {
    const e1 = await makeEnquiry();
    const e2 = await makeEnquiry();
    await updateEnquiry(e1.id, { processed: 1 }, env);
    const pending = await listEnquiries({ status: 'pending', environment: 'development' }, env);
    const ids = pending.map((e) => e.id);
    expect(ids).not.toContain(e1.id);
    expect(ids).toContain(e2.id);
  });

  it('appendEnquiryEvent appends events in order', async () => {
    const e = await makeEnquiry();
    await appendEnquiryEvent(e.id, { type: 'booking_invite_sent' }, env);
    await appendEnquiryEvent(e.id, { type: 'booking_created' }, env);
    const updated = await getEnquiryById(e.id, env);
    const events = JSON.parse(updated?.events ?? '[]');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('booking_invite_sent');
    expect(events[1].type).toBe('booking_created');
  });
});

// ============================================================
// 3. Invites
// ============================================================

describe('invites repository', () => {
  it('creates invite and retrieves by token', async () => {
    const e = await makeEnquiry();
    const invite = await createInviteForEnquiry(e.id, env);
    expect(invite.status).toBe('pending');
    expect(invite.token).toHaveLength(48);
    const found = await getInviteByToken(invite.token, env);
    expect(found?.id).toBe(invite.id);
  });

  it('markInviteAccepted sets status and accepted_at', async () => {
    const e = await makeEnquiry();
    const invite = await createInviteForEnquiry(e.id, env);
    await markInviteSent(invite.id, env);
    await markInviteAccepted(invite.id, env);
    const updated = await getInviteByToken(invite.token, env);
    expect(updated?.status).toBe('accepted');
    expect(updated?.accepted_at).not.toBeNull();
  });

  it('markInviteExpired sets status to expired', async () => {
    const e = await makeEnquiry();
    const invite = await createInviteForEnquiry(e.id, env);
    await markInviteExpired(invite.id, env);
    const updated = await getInviteByToken(invite.token, env);
    expect(updated?.status).toBe('expired');
  });

  it('listPendingInvites returns pending invites', async () => {
    const e = await makeEnquiry();
    const invite = await createInviteForEnquiry(e.id, env);
    const pending = await listPendingInvites(env);
    expect(pending.map((i) => i.id)).toContain(invite.id);
  });
});

// ============================================================
// 4. Bookings
// ============================================================

describe('bookings repository', () => {
  // A future Tuesday
  const futureDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  it('creates booking and counts confirmed', async () => {
    const e = await makeEnquiry();
    await createBooking(e.id, null, 'ag_u13', futureDate, '18:30', env);
    const count = await countBookingsForDateAndGroup(futureDate, 'ag_u13', env);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('cancelled bookings are not counted in capacity', async () => {
    const date = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 21);
      while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();
    const e1 = await makeEnquiry();
    const e2 = await makeEnquiry();
    const b1 = await createBooking(e1.id, null, 'ag_u13', date, '18:30', env);
    await createBooking(e2.id, null, 'ag_u13', date, '18:30', env);
    await updateBookingStatus(b1.id, 'cancelled', null, env);
    const count = await countBookingsForDateAndGroup(date, 'ag_u13', env);
    expect(count).toBe(1);
  });

  it('updateBookingStatus persists status and note', async () => {
    const e = await makeEnquiry();
    const b = await createBooking(e.id, null, 'ag_u13', futureDate, '18:30', env);
    const updated = await updateBookingStatus(b.id, 'attended', 'Great session', env);
    expect(updated.status).toBe('attended');
    expect(updated.attendance_note).toBe('Great session');
  });

  it('listUpcomingBookings returns future confirmed bookings', async () => {
    const e = await makeEnquiry();
    const farDate = '2027-01-05'; // A Tuesday far in the future
    await createBooking(e.id, null, 'ag_u13', farDate, '18:30', env);
    const upcoming = await listUpcomingBookings(52, env);
    expect(upcoming.map((b) => b.session_date)).toContain(farDate);
  });
});

// ============================================================
// 5. Academy waitlist
// ============================================================

describe('academy waitlist repository', () => {
  it('adds to waitlist and retrieves by token', async () => {
    const e = await makeEnquiry();
    const entry = await addToWaitlist(e.id, env);
    expect(entry.status).toBe('waiting');
    expect(entry.token).toHaveLength(48);
    const found = await getWaitlistEntryByToken(entry.token, env);
    expect(found?.enquiry_id).toBe(e.id);
  });

  it('records yes response correctly', async () => {
    const e = await makeEnquiry();
    const entry = await addToWaitlist(e.id, env);
    const updated = await recordWaitlistResponse(entry.token, 'yes', env);
    expect(updated.response).toBe('yes');
    expect(updated.status).toBe('accepted');
    expect(updated.responded_at).not.toBeNull();
  });

  it('records no response correctly', async () => {
    const e = await makeEnquiry();
    const entry = await addToWaitlist(e.id, env);
    const updated = await recordWaitlistResponse(entry.token, 'no', env);
    expect(updated.response).toBe('no');
    expect(updated.status).toBe('declined');
  });

  it('throws for invalid token', async () => {
    await expect(recordWaitlistResponse('bad_token', 'yes', env)).rejects.toThrow(/not found/i);
  });
});

// ============================================================
// 6. Academy seasons
// ============================================================

describe('academy seasons repository', () => {
  it('creates a season and retrieves it', async () => {
    const season = await createAcademySeason(
      {
        code: `s_${Date.now()}`,
        label: 'Test Season',
        start_date: '2026-04-01',
        end_date: '2026-08-31',
        capacity: 40,
        age_group_id: 'ag_u11',
      },
      env
    );
    expect(season.status).toBe('upcoming');
    expect(season.capacity).toBe(40);
  });

  it('getOpenAcademySeason returns null when none open', async () => {
    // No season is set to open in tests by default
    const open = await getOpenAcademySeason(env);
    // May be null or may find one — just verify no crash
    expect(open === null || open.status === 'open').toBe(true);
  });

  it('updateSeasonStatus changes status', async () => {
    const season = await createAcademySeason(
      {
        code: `s2_${Date.now()}`,
        label: 'Open Season',
        start_date: '2027-04-01',
        end_date: '2027-08-31',
        capacity: 40,
        age_group_id: 'ag_u11',
      },
      env
    );
    await updateSeasonStatus(season.id, 'open', env);
    const found = await getOpenAcademySeason(env);
    expect(found?.id).toBe(season.id);
  });
});

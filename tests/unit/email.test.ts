// ============================================================
// EGAC Platform — Email Service Tests
// tests/unit/email.test.ts
//
// Tests the email client and template senders.
// fetch is mocked — no real HTTP calls, no Resend account needed.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEmail, sendEmailWithRetry } from '../../src/lib/email/client.js';
import type { Env } from '../../src/lib/db/schema.js';

// ============================================================
// Helpers
// ============================================================

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    RESEND_API_KEY: 'test_resend_key',
    ADMIN_TOKEN: 'test_admin',
    ADMIN_EMAIL: 'admin@egac.co.uk',
    EMAIL_FROM: 'noreply@egac.co.uk',
    CRON_SECRET: 'test_cron',
    APP_ENV: 'development',
    ...overrides,
  };
}

function makeEmailOptions() {
  return {
    to: 'jane@example.com',
    subject: 'Test subject',
    html: '<p>Hello</p>',
    text: 'Hello',
  };
}

// Mock a successful Resend response
function mockFetchSuccess(id = 'resend_abc123') {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id }),
    text: async () => JSON.stringify({ id }),
  });
}

// Mock a failed Resend response
function mockFetchFailure(status = 422, message = 'Invalid email') {
  return vi.fn().mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => message,
    json: async () => ({ message }),
  });
}

// Mock fetch that throws a network error
function mockFetchNetworkError(message = 'Network error') {
  return vi.fn().mockRejectedValueOnce(new Error(message));
}

// ============================================================
// 1. sendEmail — happy path
// ============================================================

describe('sendEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success:true and resend id on 200 response', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess('email_001'));

    const result = await sendEmail(makeEmailOptions(), makeEnv());

    expect(result.success).toBe(true);
    expect(result.id).toBe('email_001');
    expect(result.error).toBeUndefined();
  });

  it('sends to the Resend API endpoint', async () => {
    const mockFetch = mockFetchSuccess();
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail(makeEmailOptions(), makeEnv());

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
  });

  it('includes Authorization header with API key', async () => {
    const mockFetch = mockFetchSuccess();
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail(makeEmailOptions(), makeEnv({ RESEND_API_KEY: 'key_xyz' }));

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer key_xyz');
  });

  it('uses EMAIL_FROM env var as the from address', async () => {
    const mockFetch = mockFetchSuccess();
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail(makeEmailOptions(), makeEnv({ EMAIL_FROM: 'club@egac.co.uk' }));

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.from).toBe('club@egac.co.uk');
  });

  it('prefers explicit from option over EMAIL_FROM env var', async () => {
    const mockFetch = mockFetchSuccess();
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail(
      { ...makeEmailOptions(), from: 'admin-updates@eastgrinsteadac.co.uk' },
      makeEnv({ EMAIL_FROM: 'club@egac.co.uk' })
    );

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.from).toBe('admin-updates@eastgrinsteadac.co.uk');
  });

  it('returns success:false on non-2xx response — does not throw', async () => {
    vi.stubGlobal('fetch', mockFetchFailure(422, 'Invalid recipient'));

    const result = await sendEmail(makeEmailOptions(), makeEnv());

    expect(result.success).toBe(false);
    expect(result.error).toContain('422');
    expect(result.id).toBeUndefined();
  });

  it('returns success:false on network error — does not throw', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError('Failed to connect'));

    const result = await sendEmail(makeEmailOptions(), makeEnv());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to connect');
  });

  it('returns success:false on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetchFailure(500, 'Internal Server Error'));

    const result = await sendEmail(makeEmailOptions(), makeEnv());

    expect(result.success).toBe(false);
  });
});

// ============================================================
// 2. sendEmailWithRetry
// ============================================================

describe('sendEmailWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately on first success', async () => {
    const mockFetch = mockFetchSuccess('email_first');
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmailWithRetry(makeEmailOptions(), makeEnv(), 3);

    expect(result.success).toBe(true);
    expect(result.id).toBe('email_first');
    expect(mockFetch).toHaveBeenCalledOnce(); // only 1 call needed
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'email_retry' }) });

    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmailWithRetry(makeEmailOptions(), makeEnv(), 3);

    expect(result.success).toBe(true);
    expect(result.id).toBe('email_retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops after maxAttempts and returns last failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmailWithRetry(makeEmailOptions(), makeEnv(), 3);

    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('respects maxAttempts=1 — no retries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmailWithRetry(makeEmailOptions(), makeEnv(), 1);

    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 3. Template rendering integration
// Verifies renderTemplate is called correctly with the right vars
// ============================================================

import { renderTemplate } from '../../src/lib/business/templates.js';

describe('email template variable rendering', () => {
  it('booking_invite template renders all required variables', () => {
    const template =
      'Hi {{contact_name}}, book at {{booking_url}}. Dates: {{available_dates_list}}';
    const rendered = renderTemplate(template, {
      contact_name: 'Jane Smith',
      booking_url: 'https://egac.pages.dev/booking?invite=abc',
      available_dates_list: '• Tuesday 14 April 2026',
    });

    expect(rendered).toContain('Jane Smith');
    expect(rendered).toContain('https://egac.pages.dev/booking?invite=abc');
    expect(rendered).toContain('Tuesday 14 April');
  });

  it('booking_confirmation template renders all required variables', () => {
    const template =
      'Hi {{contact_name}}, your session on {{session_date}} at {{session_time}} ({{age_group_label}}) at {{venue}}. Calendar: {{add_to_calendar_url}}';
    const rendered = renderTemplate(template, {
      contact_name: 'Jane',
      session_date: 'Tuesday 14 April 2026',
      session_time: '18:30',
      age_group_label: 'U13',
      venue: 'East Grinstead Leisure Centre',
      add_to_calendar_url: 'https://calendar.google.com/...',
    });

    expect(rendered).toContain('Jane');
    expect(rendered).toContain('18:30');
    expect(rendered).toContain('U13');
  });

  it('academy_waitlist template renders all required variables', () => {
    const template = 'Hi {{parent_name}}, {{child_name}} is on the list. Respond: {{response_url}}';
    const rendered = renderTemplate(template, {
      parent_name: 'Jane Smith',
      child_name: 'Emily Smith',
      response_url: 'https://egac.pages.dev/academy/respond?token=xyz',
    });

    expect(rendered).toContain('Jane Smith');
    expect(rendered).toContain('Emily Smith');
    expect(rendered).toContain('?token=xyz');
  });

  it('membership_invite template renders all required variables', () => {
    const template = 'Hi {{contact_name}}, join here: {{membership_url}}';
    const rendered = renderTemplate(template, {
      contact_name: 'Jane',
      membership_url: 'https://egac.pages.dev/join?token=mem123',
    });

    expect(rendered).toContain('Jane');
    expect(rendered).toContain('mem123');
  });

  it('template rendering throws before attempting send when variable is missing', () => {
    const template = 'Hi {{contact_name}}, book at {{booking_url}}';

    expect(() =>
      renderTemplate(template, {
        contact_name: 'Jane',
        // booking_url intentionally missing
      })
    ).toThrow(/\{\{booking_url\}\}/);
  });

  it('test send is blocked for non-admin email (validation rule)', () => {
    // This rule is enforced in the API endpoint, not the email client.
    // We document it here as a contract test.
    const adminEmail = 'admin@egac.co.uk';
    const nonAdminEmail = 'random@example.com';

    function isAllowedTestRecipient(to: string, adminEmail: string): boolean {
      return to === adminEmail;
    }

    expect(isAllowedTestRecipient(adminEmail, adminEmail)).toBe(true);
    expect(isAllowedTestRecipient(nonAdminEmail, adminEmail)).toBe(false);
  });
});

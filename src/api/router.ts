// ============================================================
// EGAC Platform — Worker Router
// src/api/router.ts
//
// Routes incoming requests to the correct handler.
// Single entry point — exported as the default fetch handler
// and imported by the Astro SSR integration.
//
// Public routes (no auth):
//   POST /api/enquiry
//   POST /api/booking
//   POST /api/academy/respond
//   GET  /api/health
//
// Cron routes (require Authorization: Bearer <CRON_SECRET>):
//   POST /api/cron/expire-invites
//   POST /api/cron/retry-invites
//   POST /api/cron/send-reminders
//   POST /api/cron/academy-rollover
//
// Admin routes (require Authorization: Bearer <ADMIN_TOKEN>):
//   GET  /api/admin/enquiries
//   POST /api/admin/enquiries
//   GET  /api/admin/enquiries/:id
//   PATCH /api/admin/enquiries/:id
//   POST /api/admin/invites/resend
// ============================================================

import { handleEnquiry } from './enquiry.js';
import { handleBooking } from './booking.js';
import { handleAcademyRespond } from './academy.js';
import { handleHealth } from './health.js';
import { handleExpireInvites, runExpireInvites } from './cron/expire-invites.js';
import { handleRetryInvites, runRetryInvites } from './cron/retry-invites.js';
import { handleSendReminders, runSendReminders } from './cron/send-reminders.js';
import { handleAcademyRollover, runAcademyRollover } from './cron/academy-rollover.js';
import { handleAdminEnquiries } from './admin/enquiries.js';
import { handleAdminEnquiryDetail } from './admin/enquiry-detail.js';
import { handleAdminInviteResend } from './admin/invites.js';
import { err } from './helpers.js';
import type { Env } from '../lib/db/schema.js';

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // ── Public API routes ──────────────────────────────────────
  if (path === '/api/enquiry') return handleEnquiry(request, env);
  if (path === '/api/booking') return handleBooking(request, env);
  if (path === '/api/academy/respond') return handleAcademyRespond(request, env);
  if (path === '/api/health') return handleHealth(request, env);

  // ── Cron routes ────────────────────────────────────────────
  if (path === '/api/cron/expire-invites') return handleExpireInvites(request, env);
  if (path === '/api/cron/retry-invites') return handleRetryInvites(request, env);
  if (path === '/api/cron/send-reminders') return handleSendReminders(request, env);
  if (path === '/api/cron/academy-rollover') return handleAcademyRollover(request, env);

  // ── Admin routes ───────────────────────────────────────────
  if (path === '/api/admin/enquiries') return handleAdminEnquiries(request, env);
  if (path === '/api/admin/invites/resend') return handleAdminInviteResend(request, env);
  const enquiryDetailMatch = path.match(/^\/api\/admin\/enquiries\/([^/]+)$/);
  if (enquiryDetailMatch) return handleAdminEnquiryDetail(request, env, enquiryDetailMatch[1]);

  // ── 404 for unknown /api/* routes ─────────────────────────
  if (path.startsWith('/api/')) {
    return err(`Route not found: ${path}`, 404, 'NOT_FOUND');
  }

  // ── Non-API paths fall through to Astro SSR ───────────────
  // In production this is handled by Cloudflare Pages.
  // In local dev wrangler dev handles both the Worker and static assets.
  return new Response('Not found', { status: 404 });
}

// ------------------------------------------------------------
// Cloudflare Worker default export
// ------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  // Dispatches scheduled cron events to the correct handler.
  // Cron expressions are defined in wrangler.toml [triggers].
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = _event.cron;

    if (cron === '*/30 * * * *') {
      ctx.waitUntil(runRetryInvites(env));
    } else if (cron === '0 9 * * *') {
      ctx.waitUntil(runExpireInvites(env));
    } else if (cron === '0 18 * * 2') {
      ctx.waitUntil(runSendReminders(env));
    } else if (cron === '0 9 1 * *') {
      ctx.waitUntil(runAcademyRollover(env));
    } else {
      console.warn(JSON.stringify({ level: 'warn', event: 'unknown_cron', cron }));
    }
  },
};

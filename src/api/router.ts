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
// Admin routes (require Authorization: Bearer <ADMIN_TOKEN>):
//   Added in Phase 3 (Prompt 9+)
// ============================================================

import { handleEnquiry } from './enquiry.js';
import { handleBooking } from './booking.js';
import { handleAcademyRespond } from './academy.js';
import { handleHealth } from './health.js';
import { handleExpireInvites } from './cron/expire-invites.js';
import { handleRetryInvites } from './cron/retry-invites.js';
import { handleSendReminders } from './cron/send-reminders.js';
import { handleAcademyRollover } from './cron/academy-rollover.js';
import { handleAdminEnquiries } from './admin/enquiries.js';
import { handleAdminEnquiryDetail } from './admin/enquiry-detail.js';
import { handleAdminInviteResend } from './admin/invites.js';
import { handleAdminBookings } from './admin/bookings.js';
import { handleAdminAttendance } from './admin/attendance.js';
import { handleAdminReports } from './admin/reports.js';
import { handleAdminMemberships } from './admin/memberships.js';
import { handleAdminTemplates } from './admin/templates.js';
import {
  handleAdminTemplateDetail,
  handleAdminTemplatePreview,
  handleAdminTemplateTestSend,
} from './admin/template-detail.js';
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

  // ── Cron routes (CRON_SECRET auth) ────────────────────────
  if (path === '/api/cron/expire-invites') return handleExpireInvites(request, env);
  if (path === '/api/cron/retry-invites') return handleRetryInvites(request, env);
  if (path === '/api/cron/send-reminders') return handleSendReminders(request, env);
  if (path === '/api/cron/academy-rollover') return handleAcademyRollover(request, env);

  // ── Admin routes (ADMIN_TOKEN auth) ───────────────────────
  if (path === '/api/admin/enquiries') return handleAdminEnquiries(request, env);
  if (path === '/api/admin/invites/resend') return handleAdminInviteResend(request, env);
  if (path === '/api/admin/bookings') return handleAdminBookings(request, env);
  if (path === '/api/admin/reports') return handleAdminReports(request, env);
  if (path === '/api/admin/memberships') return handleAdminMemberships(request, env);
  if (path === '/api/admin/templates') return handleAdminTemplates(request, env);

  // Dynamic admin routes — extract ID segments
  const enquiryDetailMatch = path.match(/^\/api\/admin\/enquiries\/([^/]+)$/);
  if (enquiryDetailMatch) {
    return handleAdminEnquiryDetail(request, env, enquiryDetailMatch[1]);
  }

  const attendanceMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/attendance$/);
  if (attendanceMatch) {
    return handleAdminAttendance(request, env, attendanceMatch[1]);
  }

  // Template dynamic routes — order matters: most specific first
  const templateTestSendMatch = path.match(/^\/api\/admin\/templates\/([^/]+)\/test-send$/);
  if (templateTestSendMatch) {
    return handleAdminTemplateTestSend(request, env, templateTestSendMatch[1]);
  }

  const templatePreviewMatch = path.match(/^\/api\/admin\/templates\/([^/]+)\/preview$/);
  if (templatePreviewMatch) {
    return handleAdminTemplatePreview(request, env, templatePreviewMatch[1]);
  }

  const templateDetailMatch = path.match(/^\/api\/admin\/templates\/([^/]+)$/);
  if (templateDetailMatch) {
    return handleAdminTemplateDetail(request, env, templateDetailMatch[1]);
  }

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

  // Cloudflare cron trigger — maps cron schedules to handlers
  // by constructing a synthetic POST request so handlers can
  // be tested via HTTP too.
  async scheduled(
    event: { cron: string },
    env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void }
  ): Promise<void> {
    const baseUrl = 'https://worker.internal';
    const cronSecret = (env as Env & { CRON_SECRET?: string }).CRON_SECRET ?? '';
    const headers = { Authorization: `Bearer ${cronSecret}`, 'Content-Type': 'application/json' };

    let url: string;
    if (event.cron === '0 0 * * *') {
      url = `${baseUrl}/api/cron/expire-invites`;
    } else if (event.cron === '0 18 * * 2') {
      url = `${baseUrl}/api/cron/send-reminders`;
    } else if (event.cron === '*/30 * * * *') {
      url = `${baseUrl}/api/cron/retry-invites`;
    } else {
      console.warn(JSON.stringify({ level: 'warn', event: 'unknown_cron', cron: event.cron }));
      return;
    }

    ctx.waitUntil(
      handleRequest(new Request(url, { method: 'POST', headers }), env).then((res) => {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'cron_dispatched',
            cron: event.cron,
            status: res.status,
          })
        );
      })
    );
  },
};

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
};

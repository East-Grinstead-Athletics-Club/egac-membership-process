// ============================================================
// EGAC Platform — GET/PATCH /api/admin/enquiries/:id
// src/api/admin/enquiry-detail.ts
//
// GET   /api/admin/enquiries/:id  — full detail + events + bookings
// PATCH /api/admin/enquiries/:id  — update note
//
// Auth: Authorization: Bearer <ADMIN_TOKEN> (or x-admin-token)
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { getEnquiryById, updateEnquiry } from '../../lib/repositories/enquiries.js';
import { getInviteById } from '../../lib/repositories/invites.js';
import { listBookingsByEnquiry } from '../../lib/repositories/bookings.js';
import type { Env, EnquiryEvent } from '../../lib/db/schema.js';

// ------------------------------------------------------------
// handleAdminEnquiryDetail
// ------------------------------------------------------------
export async function handleAdminEnquiryDetail(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  if (request.method === 'GET') return handleGet(env, id);
  if (request.method === 'PATCH') return handlePatch(request, env, id);
  return err('Method not allowed', 405);
}

// ── GET ──────────────────────────────────────────────────────

async function handleGet(env: Env, id: string): Promise<Response> {
  const enquiry = await getEnquiryById(id, env);
  if (!enquiry) return err('Enquiry not found', 404, 'NOT_FOUND');

  // Parse event log
  let events: EnquiryEvent[] = [];
  try {
    events = (JSON.parse(enquiry.events || '[]') as EnquiryEvent[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch {
    /* non-fatal — return empty events */
  }

  // Load invite if present
  const invite = enquiry.invite_id ? await getInviteById(enquiry.invite_id, env) : null;

  // Load bookings
  const bookings = await listBookingsByEnquiry(id, env);

  return ok({ enquiry, events, invite, bookings });
}

// ── PATCH ────────────────────────────────────────────────────

async function handlePatch(request: Request, env: Env, id: string): Promise<Response> {
  const body = await parseBody<{ note?: string }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const enquiry = await getEnquiryById(id, env);
  if (!enquiry) return err('Enquiry not found', 404, 'NOT_FOUND');

  const note = body.note !== undefined ? (body.note ? String(body.note).trim() : null) : undefined;

  // Only update if note was explicitly provided in the body
  const updated = note !== undefined ? await updateEnquiry(id, { note }, env) : enquiry;

  return ok({ enquiry: updated });
}

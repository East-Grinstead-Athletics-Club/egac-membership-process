// ============================================================
// EGAC Platform — GET/POST /api/admin/enquiries
// src/api/admin/enquiries.ts
//
// GET  /api/admin/enquiries  — paginated + filtered list
// POST /api/admin/enquiries  — manual enquiry creation (admin)
//
// Auth: Authorization: Bearer <ADMIN_TOKEN> (or x-admin-token)
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import {
  listEnquiries,
  insertEnquiry,
  getEnquiryByEmail,
} from '../../lib/repositories/enquiries.js';
import { generateId } from '../../lib/db/client.js';
import type { Env, EnquiryFilters } from '../../lib/db/schema.js';

const PAGE_SIZE = 20;

// ------------------------------------------------------------
// handleAdminEnquiries
// ------------------------------------------------------------
export async function handleAdminEnquiries(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  if (request.method === 'GET') return handleList(request, env);
  if (request.method === 'POST') return handleCreate(request, env);
  return err('Method not allowed', 405);
}

// ── GET ──────────────────────────────────────────────────────

async function handleList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status') ?? '';
  const search = url.searchParams.get('search')?.trim() ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const filters: EnquiryFilters = {
    limit: PAGE_SIZE + 1, // fetch one extra to detect next page
    offset,
    ...(rawStatus === 'pending' || rawStatus === 'processed' || rawStatus === 'academy'
      ? { status: rawStatus }
      : {}),
    ...(search ? { search } : {}),
  };

  const rows = await listEnquiries(filters, env);
  const hasNextPage = rows.length > PAGE_SIZE;
  const enquiries = rows.slice(0, PAGE_SIZE);

  return ok({ enquiries, page, hasNextPage, pageSize: PAGE_SIZE });
}

// ── POST ─────────────────────────────────────────────────────

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{
    name?: string;
    email?: string;
    phone?: string;
    dob?: string;
    note?: string;
  }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const email = String(body.email ?? '')
    .toLowerCase()
    .trim();
  if (!email) return err('Email is required', 422, 'MISSING_EMAIL');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('Email is not valid', 422, 'INVALID_EMAIL');
  }

  // Duplicate check — silently return if already exists
  const existing = await getEnquiryByEmail(email, env);
  if (existing) {
    return ok({ enquiry_id: existing.id, already_existed: true });
  }

  const enquiry = await insertEnquiry(
    {
      id: generateId('enq'),
      created_at: new Date().toISOString(),
      email,
      name: body.name ? String(body.name).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      dob: body.dob ? String(body.dob) : null,
      note: body.note ? String(body.note).trim() : null,
      source: 'admin',
      processed: 0,
      events: '[]',
      environment: env.APP_ENV,
    },
    env
  );

  console.log(
    JSON.stringify({ level: 'info', event: 'admin_enquiry_created', enquiry_id: enquiry.id })
  );

  return ok({ enquiry_id: enquiry.id, already_existed: false }, 201);
}

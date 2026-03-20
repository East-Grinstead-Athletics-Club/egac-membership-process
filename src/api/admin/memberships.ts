// ============================================================
// EGAC Platform — GET /api/admin/memberships
// src/api/admin/memberships.ts
//
// Returns membership form submissions as JSON by default.
// Use ?format=csv to download CSV export.
// ============================================================

import { err, ok } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { listMembershipForms } from '../../lib/repositories/membership-forms.js';
import type { Env } from '../../lib/db/schema.js';

type MembershipPayload = {
  first_name?: string;
  last_name?: string;
  dob?: string;
  email?: string;
  mobile_phone?: string;
  whatsapp_opt_in?: 'yes' | 'no';
  consent_data_processing?: 'yes' | 'no';
  consent_policies?: 'yes' | 'no';
  emergency_contact_name?: string;
  emergency_contact_mobile?: string;
  existing_family_member?: 'yes' | 'no';
  existing_family_member_details?: string;
};

function safeParsePayload(raw: string): MembershipPayload {
  try {
    const parsed = JSON.parse(raw) as MembershipPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function csvEscape(value: string | null | undefined): string {
  const v = value ?? '';
  return `"${String(v).replace(/"/g, '""')}"`;
}

function asCsv(rows: Awaited<ReturnType<typeof listMembershipForms>>): string {
  const headers = [
    'submission_id',
    'submitted_at',
    'enquiry_id',
    'enquiry_name',
    'enquiry_email',
    'athlete_first_name',
    'athlete_last_name',
    'dob',
    'member_email',
    'mobile_phone',
    'whatsapp_opt_in',
    'consent_data_processing',
    'consent_policies',
    'emergency_contact_name',
    'emergency_contact_mobile',
    'existing_family_member',
    'existing_family_member_details',
  ];

  const lines = [headers.map((h) => csvEscape(h)).join(',')];

  for (const row of rows) {
    const payload = safeParsePayload(row.payload_json);
    lines.push(
      [
        row.id,
        row.submitted_at,
        row.enquiry_id,
        row.enquiry_name,
        row.enquiry_email,
        payload.first_name,
        payload.last_name,
        payload.dob,
        payload.email,
        payload.mobile_phone,
        payload.whatsapp_opt_in,
        payload.consent_data_processing,
        payload.consent_policies,
        payload.emergency_contact_name,
        payload.emergency_contact_mobile,
        payload.existing_family_member,
        payload.existing_family_member_details,
      ]
        .map((v) => csvEscape(v ?? ''))
        .join(',')
    );
  }

  return lines.join('\n');
}

export async function handleAdminMemberships(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? '200')));
  const format = url.searchParams.get('format');

  const rows = await listMembershipForms(env, limit);

  if (format === 'csv') {
    const csv = asCsv(rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=egac-membership-forms-${dateStamp}.csv`,
      },
    });
  }

  return ok({ submissions: rows, count: rows.length, limit });
}

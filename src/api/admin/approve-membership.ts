// ============================================================
// EGAC Platform — POST /api/admin/memberships/:id/approve
// src/api/admin/approve-membership.ts
//
// Converts a submitted membership form into an active athlete record.
// Idempotent: re-approving an already-approved form returns the
// existing athlete without creating a duplicate.
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { generateId, getEnv, now } from '../../lib/db/client.js';
import { createAthlete, getAthleteByMembershipFormId } from '../../lib/repositories/athletes.js';
import { getMembershipFormById } from '../../lib/repositories/membership-forms.js';
import { appendEnquiryEvent } from '../../lib/repositories/enquiries.js';
import type { Env, AthleteInsert } from '../../lib/db/schema.js';

type MembershipPayload = {
  first_name?: string;
  last_name?: string;
  title?: string;
  dob?: string;
  email?: string;
  mobile_phone?: string;
  medication?: string;
  illnesses_injuries?: string;
  allergies?: string;
  emergency_contact_name?: string;
  emergency_contact_mobile?: string;
  emergency_contact_name_2?: string;
  emergency_contact_mobile_2?: string;
};

function parsePayload(raw: string): MembershipPayload {
  try {
    const parsed = JSON.parse(raw) as MembershipPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildMedicalInfo(payload: MembershipPayload): string | null {
  const parts: string[] = [];
  if (payload.medication?.trim()) parts.push(`Medication: ${payload.medication.trim()}`);
  if (payload.illnesses_injuries?.trim())
    parts.push(`Illnesses/injuries: ${payload.illnesses_injuries.trim()}`);
  if (payload.allergies?.trim()) parts.push(`Allergies: ${payload.allergies.trim()}`);
  return parts.length > 0 ? parts.join('\n') : null;
}

export async function handleApproveMembership(
  request: Request,
  env: Env,
  membershipFormId: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const form = await getMembershipFormById(membershipFormId, env);
  if (!form) return err('Membership form not found', 404, 'NOT_FOUND');

  // Idempotency check — return existing athlete if already approved
  const existing = await getAthleteByMembershipFormId(membershipFormId, env);
  if (existing) {
    return ok({ athlete_id: existing.id, created: false });
  }

  const payload = parsePayload(form.payload_json);

  const firstName = payload.first_name?.trim() ?? '';
  const lastName = payload.last_name?.trim() ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ');

  if (!name) return err('Membership form has no athlete name', 422, 'INVALID_PAYLOAD');

  const emergencyContactName = payload.emergency_contact_name?.trim() ?? '';
  const emergencyContactPhone = payload.emergency_contact_mobile?.trim() ?? '';

  if (!emergencyContactName || !emergencyContactPhone) {
    return err('Membership form is missing emergency contact details', 422, 'INVALID_PAYLOAD');
  }

  const athleteId = generateId('ath');
  const environment = getEnv(env);

  const athleteData: AthleteInsert = {
    id: athleteId,
    enquiry_id: form.enquiry_id,
    membership_form_id: form.id,
    name,
    dob: payload.dob?.trim() || null,
    email: payload.email?.trim() || null,
    phone: payload.mobile_phone?.trim() || null,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    emergency_contact_name_2: payload.emergency_contact_name_2?.trim() || null,
    emergency_contact_phone_2: payload.emergency_contact_mobile_2?.trim() || null,
    medical_info: buildMedicalInfo(payload),
    environment,
    created_at: now(),
  };

  await createAthlete(athleteData, env);

  if (form.enquiry_id) {
    await appendEnquiryEvent(
      form.enquiry_id,
      { type: 'membership_form_submitted', athlete_id: athleteId },
      env
    );
  }

  return ok({ athlete_id: athleteId, created: true });
}

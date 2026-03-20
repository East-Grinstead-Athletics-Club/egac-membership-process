// ============================================================
// EGAC Platform — Membership Forms Repository
// src/lib/repositories/membership-forms.ts
// ============================================================

import { many } from '../db/client.js';
import { getDB, getEnv } from '../db/client.js';
import type { Env, MembershipFormSubmission } from '../db/schema.js';

export interface MembershipFormSubmissionRow extends MembershipFormSubmission {
  enquiry_name: string | null;
  enquiry_email: string;
}

export async function listMembershipForms(
  env: Env,
  limit = 200
): Promise<MembershipFormSubmissionRow[]> {
  const db = getDB(env);
  const environment = getEnv(env);

  return many<MembershipFormSubmissionRow>(
    db
      .prepare(
        `SELECT mf.*, e.name as enquiry_name, e.email as enquiry_email
         FROM membership_forms mf
         LEFT JOIN enquiries e ON e.id = mf.enquiry_id AND e.environment = mf.environment
         WHERE mf.environment = ?
         ORDER BY mf.submitted_at DESC
         LIMIT ?`
      )
      .bind(environment, limit)
  );
}

// ============================================================
// EGAC Platform — Membership Forms Repository
// src/lib/repositories/membership-forms.ts
// ============================================================

import { many, one } from '../db/client.js';
import { getDB, getEnv } from '../db/client.js';
import type { Env, MembershipFormSubmission } from '../db/schema.js';

export interface MembershipFormSubmissionRow extends MembershipFormSubmission {
  enquiry_name: string | null;
  enquiry_email: string;
  athlete_id: string | null;
  athlete_name: string | null;
}

export async function getMembershipFormById(
  id: string,
  env: Env
): Promise<MembershipFormSubmission | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<MembershipFormSubmission>(
    db
      .prepare(`SELECT * FROM membership_forms WHERE id = ? AND environment = ? LIMIT 1`)
      .bind(id, environment)
  );
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
        `SELECT mf.*,
                e.name  AS enquiry_name,
                e.email AS enquiry_email,
                a.id    AS athlete_id,
                a.name  AS athlete_name
         FROM membership_forms mf
         LEFT JOIN enquiries e ON e.id = mf.enquiry_id AND e.environment = mf.environment
         LEFT JOIN athletes  a ON a.membership_form_id = mf.id AND a.environment = mf.environment
         WHERE mf.environment = ?
         ORDER BY mf.submitted_at DESC
         LIMIT ?`
      )
      .bind(environment, limit)
  );
}

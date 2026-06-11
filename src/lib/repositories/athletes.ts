// ============================================================
// EGAC Platform — Athletes Repository
// src/lib/repositories/athletes.ts
// ============================================================

import { getDB, getEnv, run } from '../db/client.js';
import type { Athlete, AthleteInsert, Env } from '../db/schema.js';

export async function createAthlete(data: AthleteInsert, env: Env): Promise<void> {
  const db = getDB(env);

  await run(
    db
      .prepare(
        `INSERT INTO athletes (
          id, enquiry_id, membership_form_id, name, dob, email, phone,
          emergency_contact_name, emergency_contact_phone,
          emergency_contact_name_2, emergency_contact_phone_2,
          medical_info, status, environment, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .bind(
        data.id,
        data.enquiry_id ?? null,
        data.membership_form_id ?? null,
        data.name,
        data.dob ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.emergency_contact_name,
        data.emergency_contact_phone,
        data.emergency_contact_name_2 ?? null,
        data.emergency_contact_phone_2 ?? null,
        data.medical_info ?? null,
        data.environment,
        data.created_at
      )
  );
}

export async function getAthleteByMembershipFormId(
  membershipFormId: string,
  env: Env
): Promise<Athlete | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return db
    .prepare(
      `SELECT * FROM athletes
       WHERE membership_form_id = ? AND environment = ?
       LIMIT 1`
    )
    .bind(membershipFormId, environment)
    .first<Athlete>();
}

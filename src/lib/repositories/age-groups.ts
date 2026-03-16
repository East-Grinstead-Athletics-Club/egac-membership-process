// ============================================================
// EGAC Platform — Age Groups Repository
// src/lib/repositories/age-groups.ts
// ============================================================

import { one, many, getDB } from '../db/client.js';
import type { AgeGroup, Env } from '../db/schema.js';

export async function listAgeGroups(env: Env, activeOnly = true): Promise<AgeGroup[]> {
  const db = getDB(env);
  const sql = activeOnly
    ? 'SELECT * FROM age_groups WHERE active = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM age_groups ORDER BY sort_order ASC';
  return many<AgeGroup>(db.prepare(sql));
}

export async function getAgeGroupById(id: string, env: Env): Promise<AgeGroup | null> {
  const db = getDB(env);
  return one<AgeGroup>(db.prepare('SELECT * FROM age_groups WHERE id = ?').bind(id));
}

export async function getAgeGroupByCode(code: string, env: Env): Promise<AgeGroup | null> {
  const db = getDB(env);
  return one<AgeGroup>(
    db.prepare('SELECT * FROM age_groups WHERE code = ? AND active = 1').bind(code)
  );
}

export async function getTasterAgeGroups(env: Env): Promise<AgeGroup[]> {
  const db = getDB(env);
  return many<AgeGroup>(
    db.prepare(
      "SELECT * FROM age_groups WHERE booking_type = 'taster' AND active = 1 ORDER BY sort_order ASC"
    )
  );
}

export async function getWaitlistAgeGroups(env: Env): Promise<AgeGroup[]> {
  const db = getDB(env);
  return many<AgeGroup>(
    db.prepare(
      "SELECT * FROM age_groups WHERE booking_type = 'waitlist' AND active = 1 ORDER BY sort_order ASC"
    )
  );
}

export async function updateAgeGroup(
  id: string,
  updates: Partial<
    Pick<
      AgeGroup,
      | 'label'
      | 'booking_type'
      | 'age_min_aug31'
      | 'age_max_aug31'
      | 'session_days'
      | 'session_time'
      | 'capacity_per_session'
      | 'active'
      | 'sort_order'
    >
  >,
  env: Env
): Promise<AgeGroup | null> {
  const db = getDB(env);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.booking_type !== undefined) {
    fields.push('booking_type = ?');
    values.push(updates.booking_type);
  }
  if (updates.age_min_aug31 !== undefined) {
    fields.push('age_min_aug31 = ?');
    values.push(updates.age_min_aug31);
  }
  if (updates.age_max_aug31 !== undefined) {
    fields.push('age_max_aug31 = ?');
    values.push(updates.age_max_aug31);
  }
  if (updates.session_days !== undefined) {
    fields.push('session_days = ?');
    values.push(updates.session_days);
  }
  if (updates.session_time !== undefined) {
    fields.push('session_time = ?');
    values.push(updates.session_time);
  }
  if (updates.capacity_per_session !== undefined) {
    fields.push('capacity_per_session = ?');
    values.push(updates.capacity_per_session);
  }
  if (updates.active !== undefined) {
    fields.push('active = ?');
    values.push(updates.active);
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(updates.sort_order);
  }

  if (fields.length === 0) return getAgeGroupById(id, env);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());

  await db
    .prepare(`UPDATE age_groups SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();

  return getAgeGroupById(id, env);
}

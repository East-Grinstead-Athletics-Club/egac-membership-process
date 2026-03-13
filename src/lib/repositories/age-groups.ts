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

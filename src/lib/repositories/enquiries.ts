// ============================================================
// EGAC Platform — Enquiries Repository
// src/lib/repositories/enquiries.ts
//
// All database access for the enquiries table.
// Every query filters by environment automatically.
// No business logic here — just data access.
// ============================================================

import { generateId, now, one, many, run, getDB, getEnv } from '../db/client.js';
import type { Enquiry, EnquiryInsert, EnquiryFilters, EnquiryEvent, Env } from '../db/schema.js';

// ------------------------------------------------------------
// insertEnquiry
// ------------------------------------------------------------
export async function insertEnquiry(data: EnquiryInsert, env: Env): Promise<Enquiry> {
  const db = getDB(env);
  const id = data.id || generateId('enq');
  const createdAt = data.created_at || now();

  await run(
    db
      .prepare(
        `INSERT INTO enquiries
         (id, created_at, name, email, phone, dob, source, processed,
          age_group_id, note, raw_payload, events, invite_id, environment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        createdAt,
        data.name ?? null,
        data.email,
        data.phone ?? null,
        data.dob ?? null,
        data.source ?? 'website',
        data.processed ?? 0,
        data.age_group_id ?? null,
        data.note ?? null,
        data.raw_payload ?? null,
        data.events ?? '[]',
        data.invite_id ?? null,
        data.environment
      )
  );

  const inserted = await getEnquiryById(id, env);
  if (!inserted) throw new Error(`Failed to retrieve enquiry after insert: ${id}`);
  return inserted;
}

// ------------------------------------------------------------
// getEnquiryById
// ------------------------------------------------------------
export async function getEnquiryById(id: string, env: Env): Promise<Enquiry | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<Enquiry>(
    db.prepare('SELECT * FROM enquiries WHERE id = ? AND environment = ?').bind(id, environment)
  );
}

// ------------------------------------------------------------
// getEnquiryByEmail
// Returns the most recent enquiry for a given email address.
// Used to detect duplicates before inserting.
// ------------------------------------------------------------
export async function getEnquiryByEmail(email: string, env: Env): Promise<Enquiry | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<Enquiry>(
    db
      .prepare(
        `SELECT * FROM enquiries
         WHERE email = ? AND environment = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(email.toLowerCase().trim(), environment)
  );
}

// ------------------------------------------------------------
// listEnquiries
// Supports filtering by status and free-text search.
// ------------------------------------------------------------
export async function listEnquiries(filters: EnquiryFilters, env: Env): Promise<Enquiry[]> {
  const db = getDB(env);
  const environment = filters.environment ?? getEnv(env);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const conditions: string[] = ['e.environment = ?'];
  const params: unknown[] = [environment];

  // Status filter
  if (filters.status === 'processed') {
    conditions.push('e.processed = 1');
  } else if (filters.status === 'pending') {
    conditions.push('e.processed = 0');
  } else if (filters.status === 'academy') {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM academy_invitations ai
        WHERE ai.enquiry_id = e.id AND ai.environment = ?
      )`
    );
    params.push(environment);
  }

  // Search filter — matches email or name
  if (filters.search) {
    conditions.push('(e.email LIKE ? OR e.name LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const where = conditions.join(' AND ');
  params.push(limit, offset);

  return many<Enquiry>(
    db
      .prepare(
        `SELECT e.* FROM enquiries e
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params)
  );
}

// ------------------------------------------------------------
// updateEnquiry
// Partial update — only touches the fields provided.
// ------------------------------------------------------------
export async function updateEnquiry(
  id: string,
  data: Partial<Pick<Enquiry, 'note' | 'processed' | 'invite_id' | 'age_group_id'>>,
  env: Env
): Promise<Enquiry> {
  const db = getDB(env);
  const environment = getEnv(env);

  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.note !== undefined) {
    sets.push('note = ?');
    params.push(data.note);
  }
  if (data.processed !== undefined) {
    sets.push('processed = ?');
    params.push(data.processed);
  }
  if (data.invite_id !== undefined) {
    sets.push('invite_id = ?');
    params.push(data.invite_id);
  }

  if (sets.length === 0) {
    const existing = await getEnquiryById(id, env);
    if (!existing) throw new Error(`Enquiry not found: ${id}`);
    return existing;
  }

  params.push(id, environment);

  await run(
    db
      .prepare(`UPDATE enquiries SET ${sets.join(', ')} WHERE id = ? AND environment = ?`)
      .bind(...params)
  );

  const updated = await getEnquiryById(id, env);
  if (!updated) throw new Error(`Enquiry not found after update: ${id}`);
  return updated;
}

// ------------------------------------------------------------
// appendEnquiryEvent
// Reads the current events JSON array, appends the new event,
// and writes it back. Includes a timestamp automatically.
// ------------------------------------------------------------
export async function appendEnquiryEvent(
  id: string,
  event: Omit<EnquiryEvent, 'timestamp'>,
  env: Env
): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  const enquiry = await getEnquiryById(id, env);
  if (!enquiry) throw new Error(`Enquiry not found: ${id}`);

  let events: EnquiryEvent[] = [];
  try {
    events = JSON.parse(enquiry.events || '[]');
  } catch {
    events = [];
  }

  events.push({ ...event, timestamp: now() } as EnquiryEvent);

  await run(
    db
      .prepare('UPDATE enquiries SET events = ? WHERE id = ? AND environment = ?')
      .bind(JSON.stringify(events), id, environment)
  );
}

// ------------------------------------------------------------
// countEnquiries
// Used for the reports dashboard.
// ------------------------------------------------------------
export async function countEnquiries(
  filters: Pick<EnquiryFilters, 'status' | 'environment'>,
  env: Env
): Promise<number> {
  const db = getDB(env);
  const environment = filters.environment ?? getEnv(env);

  const conditions: string[] = ['environment = ?'];
  const params: unknown[] = [environment];

  if (filters.status === 'processed') {
    conditions.push('processed = 1');
  } else if (filters.status === 'pending') {
    conditions.push('processed = 0');
  }

  const result = await one<{ count: number }>(
    db
      .prepare(`SELECT COUNT(*) as count FROM enquiries WHERE ${conditions.join(' AND ')}`)
      .bind(...params)
  );

  return result?.count ?? 0;
}

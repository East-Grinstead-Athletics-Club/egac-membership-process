// ============================================================
// EGAC Platform — Academy Invitations Repository
// src/lib/repositories/academy.ts
// ============================================================

import { generateId, generateToken, now, one, many, run, getDB, getEnv } from '../db/client.js';
import type { AcademyInvitation, Env } from '../db/schema.js';

// ------------------------------------------------------------
// createAcademyInvitation
// ------------------------------------------------------------
export async function createAcademyInvitation(
  enquiryId: string,
  env: Env
): Promise<AcademyInvitation> {
  const db = getDB(env);
  const environment = getEnv(env);
  const id = generateId('aci');
  const token = generateToken(24);
  const createdAt = now();

  await run(
    db
      .prepare(
        `INSERT INTO academy_invitations
         (id, enquiry_id, token, created_at, status, environment)
         VALUES (?, ?, ?, ?, 'pending', ?)`
      )
      .bind(id, enquiryId, token, createdAt, environment)
  );

  const invitation = await getAcademyInvitationById(id, env);
  if (!invitation) throw new Error(`Failed to retrieve academy invitation after insert: ${id}`);
  return invitation;
}

// ------------------------------------------------------------
// getAcademyInvitationById
// ------------------------------------------------------------
export async function getAcademyInvitationById(
  id: string,
  env: Env
): Promise<AcademyInvitation | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<AcademyInvitation>(
    db
      .prepare('SELECT * FROM academy_invitations WHERE id = ? AND environment = ?')
      .bind(id, environment)
  );
}

// ------------------------------------------------------------
// getAcademyInvitationByToken
// Primary lookup when a parent clicks their response link.
// ------------------------------------------------------------
export async function getAcademyInvitationByToken(
  token: string,
  env: Env
): Promise<AcademyInvitation | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<AcademyInvitation>(
    db
      .prepare('SELECT * FROM academy_invitations WHERE token = ? AND environment = ?')
      .bind(token, environment)
  );
}

// ------------------------------------------------------------
// getAcademyInvitationByEnquiry
// ------------------------------------------------------------
export async function getAcademyInvitationByEnquiry(
  enquiryId: string,
  env: Env
): Promise<AcademyInvitation | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<AcademyInvitation>(
    db
      .prepare(
        `SELECT * FROM academy_invitations
         WHERE enquiry_id = ? AND environment = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(enquiryId, environment)
  );
}

// ------------------------------------------------------------
// markAcademyInvitationSent
// ------------------------------------------------------------
export async function markAcademyInvitationSent(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(
        `UPDATE academy_invitations
         SET status = 'sent', sent_at = ?
         WHERE id = ? AND environment = ?`
      )
      .bind(now(), id, environment)
  );
}

// ------------------------------------------------------------
// processAcademyResponse
// Records the parent's yes/no response.
// ------------------------------------------------------------
export async function processAcademyResponse(
  token: string,
  response: 'yes' | 'no',
  env: Env
): Promise<AcademyInvitation> {
  const db = getDB(env);
  const environment = getEnv(env);

  const invitation = await getAcademyInvitationByToken(token, env);
  if (!invitation) throw new Error(`Academy invitation not found for token: ${token}`);

  await run(
    db
      .prepare(
        `UPDATE academy_invitations
         SET response = ?, responded_at = ?, status = 'responded'
         WHERE token = ? AND environment = ?`
      )
      .bind(response, now(), token, environment)
  );

  const updated = await getAcademyInvitationById(invitation.id, env);
  if (!updated) throw new Error(`Academy invitation not found after update: ${invitation.id}`);
  return updated;
}

// ------------------------------------------------------------
// listAcademyInvitations
// Returns all academy invitations, most recent first.
// Used by the admin academy waiting list page.
// ------------------------------------------------------------
export async function listAcademyInvitations(env: Env): Promise<AcademyInvitation[]> {
  const db = getDB(env);
  const environment = getEnv(env);

  return many<AcademyInvitation>(
    db
      .prepare(
        `SELECT * FROM academy_invitations
         WHERE environment = ?
         ORDER BY created_at DESC`
      )
      .bind(environment)
  );
}

// ------------------------------------------------------------
// countAcademyInvitationsByStatus
// Used for the reports dashboard academy pipeline summary.
// ------------------------------------------------------------
export async function countAcademyInvitationsByStatus(
  env: Env
): Promise<{ pending: number; sent: number; responded_yes: number; responded_no: number }> {
  const db = getDB(env);
  const environment = getEnv(env);

  const results = await many<{ status: string; response: string | null; count: number }>(
    db
      .prepare(
        `SELECT status, response, COUNT(*) as count
         FROM academy_invitations
         WHERE environment = ?
         GROUP BY status, response`
      )
      .bind(environment)
  );

  const counts = { pending: 0, sent: 0, responded_yes: 0, responded_no: 0 };

  for (const row of results) {
    if (row.status === 'pending') counts.pending += row.count;
    else if (row.status === 'sent') counts.sent += row.count;
    else if (row.status === 'responded' && row.response === 'yes')
      counts.responded_yes += row.count;
    else if (row.status === 'responded' && row.response === 'no') counts.responded_no += row.count;
  }

  return counts;
}

// ============================================================
// EGAC Platform — Invites Repository
// src/lib/repositories/invites.ts
// ============================================================

import { generateId, generateToken, now, one, many, run, getDB, getEnv } from '../db/client.js';
import type { Invite, Env } from '../db/schema.js';

// ------------------------------------------------------------
// createInviteForEnquiry
// Creates a new pending invite with a secure token.
// ------------------------------------------------------------
export async function createInviteForEnquiry(enquiryId: string, env: Env): Promise<Invite> {
  const db = getDB(env);
  const environment = getEnv(env);
  const id = generateId('inv');
  const token = generateToken(24);
  const createdAt = now();

  await run(
    db
      .prepare(
        `INSERT INTO invites
         (id, token, enquiry_id, created_at, status, send_attempts, environment)
         VALUES (?, ?, ?, ?, 'pending', 0, ?)`
      )
      .bind(id, token, enquiryId, createdAt, environment)
  );

  const invite = await getInviteById(id, env);
  if (!invite) throw new Error(`Failed to retrieve invite after insert: ${id}`);
  return invite;
}

// ------------------------------------------------------------
// getInviteById
// ------------------------------------------------------------
export async function getInviteById(id: string, env: Env): Promise<Invite | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<Invite>(
    db.prepare('SELECT * FROM invites WHERE id = ? AND environment = ?').bind(id, environment)
  );
}

// ------------------------------------------------------------
// getInviteByToken
// The primary lookup used when a user clicks their invite link.
// ------------------------------------------------------------
export async function getInviteByToken(token: string, env: Env): Promise<Invite | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<Invite>(
    db.prepare('SELECT * FROM invites WHERE token = ? AND environment = ?').bind(token, environment)
  );
}

// ------------------------------------------------------------
// getInviteByEnquiryId
// Returns the most recent invite for an enquiry.
// ------------------------------------------------------------
export async function getInviteByEnquiryId(enquiryId: string, env: Env): Promise<Invite | null> {
  const db = getDB(env);
  const environment = getEnv(env);

  return one<Invite>(
    db
      .prepare(
        `SELECT * FROM invites
         WHERE enquiry_id = ? AND environment = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(enquiryId, environment)
  );
}

// ------------------------------------------------------------
// markInviteSent
// Called after the booking invite email is successfully sent.
// ------------------------------------------------------------
export async function markInviteSent(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(
        `UPDATE invites
         SET status = 'sent', sent_at = ?, send_attempts = send_attempts + 1
         WHERE id = ? AND environment = ?`
      )
      .bind(now(), id, environment)
  );
}

// ------------------------------------------------------------
// markInviteAccepted
// Called when a booking is successfully created.
// ------------------------------------------------------------
export async function markInviteAccepted(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(
        `UPDATE invites
         SET status = 'accepted', accepted_at = ?
         WHERE id = ? AND environment = ?`
      )
      .bind(now(), id, environment)
  );
}

// ------------------------------------------------------------
// markInviteExpired
// Called by the cron job for invites older than 14 days.
// ------------------------------------------------------------
export async function markInviteExpired(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(`UPDATE invites SET status = 'expired' WHERE id = ? AND environment = ?`)
      .bind(id, environment)
  );
}

// ------------------------------------------------------------
// markInviteFailed
// Called by the retry cron when send_attempts reaches MAX_ATTEMPTS.
// ------------------------------------------------------------
export async function markInviteFailed(id: string, env: Env): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(`UPDATE invites SET status = 'failed' WHERE id = ? AND environment = ?`)
      .bind(id, environment)
  );
}

// ------------------------------------------------------------
// incrementSendAttempts
// Called by the retry cron job on each send attempt (success or fail).
// ------------------------------------------------------------
export async function incrementSendAttempts(
  id: string,
  error: string | null,
  env: Env
): Promise<void> {
  const db = getDB(env);
  const environment = getEnv(env);

  await run(
    db
      .prepare(
        `UPDATE invites
         SET send_attempts = send_attempts + 1, last_send_error = ?
         WHERE id = ? AND environment = ?`
      )
      .bind(error, id, environment)
  );
}

// ------------------------------------------------------------
// listPendingInvites
// Returns invites that haven't been sent yet.
// Used by the retry cron job.
// ------------------------------------------------------------
export async function listPendingInvites(env: Env): Promise<Invite[]> {
  const db = getDB(env);
  const environment = getEnv(env);

  return many<Invite>(
    db
      .prepare(
        `SELECT * FROM invites
         WHERE status = 'pending'
           AND send_attempts < 3
           AND environment = ?
         ORDER BY created_at ASC`
      )
      .bind(environment)
  );
}

// ------------------------------------------------------------
// listSentInvitesOlderThan
// Returns sent invites older than a given number of days.
// Used by the expire cron job.
// ------------------------------------------------------------
export async function listSentInvitesOlderThan(days: number, env: Env): Promise<Invite[]> {
  const db = getDB(env);
  const environment = getEnv(env);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return many<Invite>(
    db
      .prepare(
        `SELECT * FROM invites
         WHERE status = 'sent'
           AND created_at < ?
           AND environment = ?`
      )
      .bind(cutoff.toISOString(), environment)
  );
}

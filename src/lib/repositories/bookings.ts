// ============================================================
// EGAC Platform — Bookings Repository
// src/lib/repositories/bookings.ts
// ============================================================

import { generateId, now, one, many, run, getDB, getEnv } from '../db/client.js';
import type { Booking, BookingStatus, Env } from '../db/schema.js';

export async function createBooking(
  enquiryId: string,
  inviteId: string | null,
  ageGroupId: string,
  sessionDate: string,
  sessionTime: string | null,
  env: Env
): Promise<Booking> {
  const db = getDB(env);
  const environment = getEnv(env);
  const id = generateId('bkg');
  const createdAt = now();

  await run(
    db
      .prepare(
        `INSERT INTO bookings
       (id, enquiry_id, invite_id, age_group_id, session_date, session_time,
        status, created_at, environment)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`
      )
      .bind(id, enquiryId, inviteId, ageGroupId, sessionDate, sessionTime, createdAt, environment)
  );

  const booking = await getBookingById(id, env);
  if (!booking) throw new Error(`Failed to retrieve booking after insert: ${id}`);
  return booking;
}

export async function getBookingById(id: string, env: Env): Promise<Booking | null> {
  const db = getDB(env);
  const environment = getEnv(env);
  return one<Booking>(
    db.prepare('SELECT * FROM bookings WHERE id = ? AND environment = ?').bind(id, environment)
  );
}

export async function getBookingByInviteAndDate(
  inviteId: string,
  sessionDate: string,
  env: Env
): Promise<Booking | null> {
  const db = getDB(env);
  const environment = getEnv(env);
  return one<Booking>(
    db
      .prepare(
        'SELECT * FROM bookings WHERE invite_id = ? AND session_date = ? AND environment = ?'
      )
      .bind(inviteId, sessionDate, environment)
  );
}

export async function countBookingsForDateAndGroup(
  sessionDate: string,
  ageGroupId: string,
  env: Env
): Promise<number> {
  const db = getDB(env);
  const environment = getEnv(env);
  const result = await one<{ count: number }>(
    db
      .prepare(
        `SELECT COUNT(*) as count FROM bookings
       WHERE session_date = ? AND age_group_id = ? AND status = 'confirmed' AND environment = ?`
      )
      .bind(sessionDate, ageGroupId, environment)
  );
  return result?.count ?? 0;
}

export async function listBookingsForDate(date: string, env: Env): Promise<Booking[]> {
  const db = getDB(env);
  const environment = getEnv(env);
  return many<Booking>(
    db
      .prepare(
        'SELECT * FROM bookings WHERE session_date = ? AND environment = ? ORDER BY created_at ASC'
      )
      .bind(date, environment)
  );
}

export async function listBookingsByEnquiry(enquiryId: string, env: Env): Promise<Booking[]> {
  const db = getDB(env);
  const environment = getEnv(env);
  return many<Booking>(
    db
      .prepare(
        'SELECT * FROM bookings WHERE enquiry_id = ? AND environment = ? ORDER BY session_date DESC'
      )
      .bind(enquiryId, environment)
  );
}

export async function listUpcomingBookings(weeksAhead: number, env: Env): Promise<Booking[]> {
  const db = getDB(env);
  const environment = getEnv(env);
  const today = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setDate(future.getDate() + weeksAhead * 7);
  const futureDate = future.toISOString().split('T')[0];

  return many<Booking>(
    db
      .prepare(
        `SELECT * FROM bookings
       WHERE session_date >= ? AND session_date <= ?
         AND status IN ('confirmed','attended','no_show')
         AND environment = ?
       ORDER BY session_date ASC`
      )
      .bind(today, futureDate, environment)
  );
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  note: string | null,
  env: Env
): Promise<Booking> {
  const db = getDB(env);
  const environment = getEnv(env);
  await run(
    db
      .prepare(
        'UPDATE bookings SET status = ?, attendance_note = ?, updated_at = ? WHERE id = ? AND environment = ?'
      )
      .bind(status, note, now(), id, environment)
  );
  const updated = await getBookingById(id, env);
  if (!updated) throw new Error(`Booking not found after update: ${id}`);
  return updated;
}

export async function countBookingsByStatus(
  status: BookingStatus,
  env: Env,
  sinceDate?: string
): Promise<number> {
  const db = getDB(env);
  const environment = getEnv(env);
  const conditions = ['status = ?', 'environment = ?'];
  const params: unknown[] = [status, environment];
  if (sinceDate) {
    conditions.push('session_date >= ?');
    params.push(sinceDate);
  }
  const result = await one<{ count: number }>(
    db
      .prepare(`SELECT COUNT(*) as count FROM bookings WHERE ${conditions.join(' AND ')}`)
      .bind(...params)
  );
  return result?.count ?? 0;
}

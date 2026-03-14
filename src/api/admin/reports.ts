// ============================================================
// EGAC Platform — GET /api/admin/reports
// src/api/admin/reports.ts
//
// Returns aggregate stats for the reports dashboard.
// All figures are scoped to the current environment.
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { countBookingsByStatus, listUpcomingBookings } from '../../lib/repositories/bookings.js';
import { listAgeGroups } from '../../lib/repositories/age-groups.js';
import { listUnassignedWaitlist } from '../../lib/repositories/academy.js';
import { getNextNTuesdayDates } from '../../lib/business/age.js';
import { getDB, getEnv } from '../../lib/db/client.js';
import type { Env } from '../../lib/db/schema.js';

export async function handleAdminReports(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const db = getDB(env);
  const environment = getEnv(env);
  const now = new Date();

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .split('T')[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  async function countEnquiries(since?: string, until?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) as n FROM enquiries WHERE environment = ?';
    const params: unknown[] = [environment];
    if (since) {
      sql += ' AND created_at >= ?';
      params.push(since);
    }
    if (until) {
      sql += ' AND created_at <= ?';
      params.push(until + 'T23:59:59Z');
    }
    const row = await db
      .prepare(sql)
      .bind(...params)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  const [enquiriesTotal, enquiriesThisMonth, enquiriesLastMonth] = await Promise.all([
    countEnquiries(),
    countEnquiries(thisMonthStart),
    countEnquiries(lastMonthStart, lastMonthEnd),
  ]);

  const [bookingsTotal, bookingsThisMonth, attendedThisMonth, noShowThisMonth, attendedTotal] =
    await Promise.all([
      countBookingsByStatus('confirmed', env),
      countBookingsByStatus('confirmed', env, thisMonthStart),
      countBookingsByStatus('attended', env, thisMonthStart),
      countBookingsByStatus('no_show', env, thisMonthStart),
      countBookingsByStatus('attended', env),
    ]);

  const totalDecided = attendedThisMonth + noShowThisMonth;
  const conversionRate =
    totalDecided > 0 ? Math.round((attendedThisMonth / totalDecided) * 100) : null;

  const [academyTotal, academyYes, academyNo, waitlistPending] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) as n FROM academy_waitlist WHERE environment = ?')
      .bind(environment)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM academy_waitlist WHERE response = 'yes' AND environment = ?`
      )
      .bind(environment)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM academy_waitlist WHERE response = 'no' AND environment = ?`
      )
      .bind(environment)
      .first<{ n: number }>(),
    listUnassignedWaitlist(env),
  ]);

  const ageGroups = await listAgeGroups(env);
  const upcomingBookings = await listUpcomingBookings(4, env);
  const nextTuesdays = getNextNTuesdayDates(4);

  const upcomingSessions = nextTuesdays.map((date) => {
    const dayBookings = upcomingBookings.filter((b) => b.session_date === date);
    const slots = ageGroups
      .filter((ag) => ag.booking_type === 'taster' && ag.active)
      .map((ag) => ({
        age_group_id: ag.id,
        label: ag.label,
        code: ag.code,
        booked: dayBookings.filter((b) => b.age_group_id === ag.id).length,
        capacity: ag.capacity_per_session ?? 2,
      }));
    return { date, slots };
  });

  const monthlyTrend: { month: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    const count = await countEnquiries(start, end);
    monthlyTrend.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      count,
    });
  }

  const invitesSent = await db
    .prepare(
      `SELECT COUNT(*) as n FROM invites WHERE status IN ('sent','accepted') AND environment = ?`
    )
    .bind(environment)
    .first<{ n: number }>();

  return ok({
    enquiries: {
      total: enquiriesTotal,
      this_month: enquiriesThisMonth,
      last_month: enquiriesLastMonth,
    },
    bookings: {
      total: bookingsTotal,
      this_month: bookingsThisMonth,
      attended_this_month: attendedThisMonth,
      no_show_this_month: noShowThisMonth,
      attended_total: attendedTotal,
      conversion_rate: conversionRate,
    },
    academy: {
      total: academyTotal?.n ?? 0,
      responded_yes: academyYes?.n ?? 0,
      responded_no: academyNo?.n ?? 0,
      pending: waitlistPending.length,
    },
    upcoming_sessions: upcomingSessions,
    monthly_trend: monthlyTrend,
    funnel: {
      enquiries: enquiriesTotal,
      invites_sent: invitesSent?.n ?? 0,
      booked: bookingsTotal,
      attended: attendedTotal,
    },
  });
}

// ============================================================
// EGAC Platform — GET /api/admin/bookings
// src/api/admin/bookings.ts
//
// Returns upcoming confirmed bookings grouped by session date,
// with enquiry name/email enrichment per booking.
//
// Query params:
//   date   — filter to a specific YYYY-MM-DD date
//   status — filter by booking status (default: confirmed)
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { listUpcomingBookings, listBookingsForDate } from '../../lib/repositories/bookings.js';
import { getEnquiryById } from '../../lib/repositories/enquiries.js';
import { listAgeGroups } from '../../lib/repositories/age-groups.js';
import { getSystemConfig, getWeeksAhead } from '../../lib/config.js';
import type { Env, Booking } from '../../lib/db/schema.js';

// ------------------------------------------------------------
// handleAdminBookings
// ------------------------------------------------------------
export async function handleAdminBookings(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const url = new URL(request.url);
  const dateFilter = url.searchParams.get('date')?.trim() ?? '';

  const config = await getSystemConfig(env);
  const weeksAhead = getWeeksAhead(config);

  const bookings: Booking[] = dateFilter
    ? await listBookingsForDate(dateFilter, env)
    : await listUpcomingBookings(weeksAhead, env);

  const ageGroups = await listAgeGroups(env);
  const ageGroupMap = new Map(ageGroups.map((ag) => [ag.id, ag]));

  // Enrich each booking with enquiry details
  const enriched = await Promise.all(
    bookings.map(async (booking) => {
      const enquiry = await getEnquiryById(booking.enquiry_id, env);
      const ageGroup = ageGroupMap.get(booking.age_group_id) ?? null;
      return {
        ...booking,
        enquiry_name: enquiry?.name ?? null,
        enquiry_email: enquiry?.email ?? null,
        age_group_label: ageGroup?.label ?? null,
        age_group_code: ageGroup?.code ?? null,
      };
    })
  );

  // Group by session date
  const grouped: Record<string, typeof enriched> = {};
  for (const booking of enriched) {
    if (!grouped[booking.session_date]) grouped[booking.session_date] = [];
    grouped[booking.session_date].push(booking);
  }

  const dates = Object.keys(grouped).sort();
  const byDate = dates.map((date) => ({ date, bookings: grouped[date] }));

  return ok({ byDate, total: enriched.length });
}

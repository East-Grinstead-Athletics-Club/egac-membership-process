// ============================================================
// EGAC Coach App — src/workers/coach-app.js
//
// Standalone Cloudflare Worker serving a mobile-optimised
// session register for coaches.
//
// Authentication: Cloudflare Access (Zero Trust)
//   - The route must be protected by a Cloudflare Access policy
//   - Coaches must be listed in the Access policy by email
//   - The Worker checks for cf-access-authenticated-user-email
//     and returns 403 if absent (defence in depth)
//
// Session register shows:
//   - TASTERS: athletes with a confirmed booking on today's date
//     (or the selected date). Pulled from bookings + enquiries.
//   - MEMBERS: active athletes from the athletes table.
//     (Populated once membership form flow is complete — Step B)
//
// Check-in:
//   - Tasters: sets bookings.checked_in_at timestamp
//   - Members: updates athletes.last_attended_at
//   - Both: writes to attendance_log (immutable safeguarding record)
//
// Age groups: UK Athletics rule — age on 31 August at end of season
// ============================================================

const APP_ENV = 'production'; // matches the main platform's APP_ENV

// ── Age calculation (UK Athletics 31 Aug rule) ───────────────
// The athletics season the session falls in:
//   Oct–Aug = same year season (ref date = 31 Aug of NEXT year)
//   Sep     = new season starts (ref date = 31 Aug of same year + 1)
function athleticsSeasonEndYear(sessionDateStr) {
  const d = new Date(sessionDateStr);
  // Season runs Sep–Aug. If month >= 8 (Sep), we're in the new season.
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}

function ageForAthletics(dobStr, sessionDateStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const endYear = athleticsSeasonEndYear(sessionDateStr);
  const aug31 = new Date(`${endYear}-08-31`);
  let age = aug31.getFullYear() - dob.getFullYear();
  const m = aug31.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && aug31.getDate() < dob.getDate())) age--;
  return age;
}

function ageGroupLabel(dobStr, sessionDateStr) {
  const age = ageForAthletics(dobStr, sessionDateStr);
  if (age === null) return '?';
  if (age <= 10) return 'U11';
  if (age <= 12) return 'U13';
  if (age <= 14) return 'U15';
  if (age <= 16) return 'U17';
  if (age <= 19) return 'U20';
  return 'Senior';
}

// ── Session navigation ────────────────────────────────────────
// EGAC sessions are Tuesday and Saturday. Navigate to prev/next.
function getAdjacentSession(baseDateStr, direction) {
  const sessionDays = [2, 6]; // Tuesday=2, Saturday=6
  const d = new Date(baseDateStr);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + direction);
    if (sessionDays.includes(d.getDay())) break;
  }
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Generate a simple ID ──────────────────────────────────────
function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

// ============================================================
// Main fetch handler
// ============================================================
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // ── Cloudflare Access auth check ─────────────────────────
    // Fail closed — if Access isn't configured, block everything.
    const coachEmail = req.headers.get('cf-access-authenticated-user-email');
    if (!coachEmail) {
      return new Response(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">' +
          '<h2>Access required</h2>' +
          '<p>This tool requires Cloudflare Access authentication. ' +
          'Contact the club administrator if you need access.</p>' +
          '</body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const viewDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // ── POST /api/checkin — toggle check-in ─────────────────
    if (url.pathname === '/api/checkin' && req.method === 'POST') {
      try {
        const { id, type, date } = await req.json();
        const targetDate = date || viewDate;
        const now = new Date().toISOString();

        if (type === 'taster') {
          // Check current state
          const booking = await env.DB.prepare(
            'SELECT id, checked_in_at, enquiry_id FROM bookings WHERE enquiry_id = ? AND session_date = ? AND environment = ?'
          )
            .bind(id, targetDate, APP_ENV)
            .first();

          if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
          }

          const newCheckedIn = !booking.checked_in_at;
          const queries = [];

          // Update booking check-in timestamp
          queries.push(
            env.DB.prepare(
              'UPDATE bookings SET checked_in_at = ? WHERE enquiry_id = ? AND session_date = ? AND environment = ?'
            ).bind(newCheckedIn ? now : null, id, targetDate, APP_ENV)
          );

          if (newCheckedIn) {
            // Fetch name for audit trail
            const enq = await env.DB.prepare('SELECT name FROM enquiries WHERE id = ?')
              .bind(id)
              .first();

            // Write attendance log (INSERT OR IGNORE — idempotent)
            queries.push(
              env.DB.prepare(
                `INSERT OR IGNORE INTO attendance_log
                 (id, person_id, person_type, person_name, session_date, status, marked_by, created_at, environment)
                 VALUES (?, ?, 'taster', ?, ?, 'P', ?, ?, ?)`
              ).bind(newId('att'), id, enq?.name ?? null, targetDate, coachEmail, now, APP_ENV)
            );
          } else {
            // Un-check: remove from attendance_log
            queries.push(
              env.DB.prepare(
                'DELETE FROM attendance_log WHERE person_id = ? AND session_date = ? AND environment = ?'
              ).bind(id, targetDate, APP_ENV)
            );
          }

          await env.DB.batch(queries);
          return Response.json({ ok: true, checked_in: newCheckedIn });
        }

        if (type === 'member') {
          // Check current state via attendance_log
          const existing = await env.DB.prepare(
            'SELECT 1 FROM attendance_log WHERE person_id = ? AND session_date = ? AND environment = ?'
          )
            .bind(id, targetDate, APP_ENV)
            .first();

          const newCheckedIn = !existing;
          const queries = [];

          if (newCheckedIn) {
            const athlete = await env.DB.prepare('SELECT name FROM athletes WHERE id = ?')
              .bind(id)
              .first();

            queries.push(
              env.DB.prepare(
                `INSERT OR IGNORE INTO attendance_log
                 (id, person_id, person_type, person_name, session_date, status, marked_by, created_at, environment)
                 VALUES (?, ?, 'member', ?, ?, 'P', ?, ?, ?)`
              ).bind(newId('att'), id, athlete?.name ?? null, targetDate, coachEmail, now, APP_ENV)
            );

            // Update last_attended_at on the athlete record
            queries.push(
              env.DB.prepare(
                'UPDATE athletes SET last_attended_at = ?, flagged_absent = 0, updated_at = ? WHERE id = ? AND environment = ?'
              ).bind(targetDate, now, id, APP_ENV)
            );
          } else {
            queries.push(
              env.DB.prepare(
                'DELETE FROM attendance_log WHERE person_id = ? AND session_date = ? AND environment = ?'
              ).bind(id, targetDate, APP_ENV)
            );
          }

          await env.DB.batch(queries);
          return Response.json({ ok: true, checked_in: newCheckedIn });
        }

        return Response.json({ error: 'Unknown type' }, { status: 400 });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    // ── GET / — render the register ──────────────────────────
    try {
      // Tasters: confirmed bookings for this date
      const tasterRows = await env.DB.prepare(
        `SELECT
           e.id, e.name, e.dob, e.phone,
           b.checked_in_at,
           b.session_date
         FROM bookings b
         JOIN enquiries e ON e.id = b.enquiry_id AND e.environment = ?
         WHERE b.session_date = ?
           AND b.status = 'confirmed'
           AND b.environment = ?
         ORDER BY e.name ASC`
      )
        .bind(APP_ENV, viewDate, APP_ENV)
        .all();

      // Members: active athletes
      const memberRows = await env.DB.prepare(
        `SELECT
           a.id, a.name, a.dob, a.emergency_contact_phone as phone,
           a.medical_info,
           CASE WHEN al.person_id IS NOT NULL THEN 1 ELSE 0 END as checked_in
         FROM athletes a
         LEFT JOIN attendance_log al
           ON al.person_id = a.id
           AND al.session_date = ?
           AND al.environment = ?
         WHERE a.status = 'active' AND a.environment = ?
         ORDER BY a.name ASC`
      )
        .bind(viewDate, APP_ENV, APP_ENV)
        .all();

      const tasters = (tasterRows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name ?? '(no name)',
        type: 'taster',
        dob: r.dob,
        phone: r.phone,
        medical_info: null,
        checked_in: !!r.checked_in_at,
        age_group: ageGroupLabel(r.dob, viewDate),
      }));

      const members = (memberRows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name ?? '(no name)',
        type: 'member',
        dob: r.dob,
        phone: r.phone,
        medical_info: r.medical_info,
        checked_in: !!r.checked_in,
        age_group: ageGroupLabel(r.dob, viewDate),
      }));

      const checkedInCount = [...tasters, ...members].filter((a) => a.checked_in).length;
      const totalCount = tasters.length + members.length;

      const html = renderPage({
        tasters,
        members,
        viewDate,
        prevDate: getAdjacentSession(viewDate, -1),
        nextDate: getAdjacentSession(viewDate, 1),
        coachEmail,
        checkedInCount,
        totalCount,
      });

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};

// ============================================================
// HTML renderer
// ============================================================
function renderPage({
  tasters,
  members,
  viewDate,
  prevDate,
  nextDate,
  coachEmail,
  checkedInCount,
  totalCount,
}) {
  const displayDate = formatDisplayDate(viewDate);

  function athleteRow(a) {
    const checkedCls = a.checked_in
      ? 'bg-emerald-500 border-emerald-600 text-white'
      : 'bg-white border-slate-300 text-slate-500';
    const rowBg = a.type === 'taster' ? 'bg-amber-50' : 'bg-white';
    const tasterBadge =
      a.type === 'taster'
        ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-400 text-amber-900 tracking-widest">TASTER</span>'
        : '';
    const ageBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-700 uppercase">${a.age_group}</span>`;
    const medicalIcon = a.medical_info
      ? '<span title="Medical info recorded" class="text-red-500 text-sm font-black">⚕</span>'
      : '';
    const escapedName = (a.name ?? '').replace(/'/g, "\\'");
    const escapedId = String(a.id).replace(/'/g, "\\'");

    return `
      <div class="px-4 py-3 border-b flex items-center gap-3 ${rowBg}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-slate-800 text-base">${a.name}</span>
            ${ageBadge}${tasterBadge}${medicalIcon}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wide font-medium">
            ${a.phone ? `📞 ${a.phone}` : 'No contact recorded'}
          </div>
        </div>
        <button
          onclick="checkin('${escapedId}', '${a.type}', this)"
          class="shrink-0 w-20 py-2.5 rounded-xl font-black text-xs border-2 ${checkedCls} active:scale-95 transition-transform"
        >${a.checked_in ? '✓ IN' : 'CHECK IN'}</button>
      </div>`;
  }

  const tasterSection =
    tasters.length === 0
      ? '<p class="px-4 py-6 text-sm text-slate-400 text-center">No taster bookings for this session.</p>'
      : tasters.map(athleteRow).join('');

  const memberSection =
    members.length === 0
      ? '<p class="px-4 py-6 text-sm text-slate-400 text-center italic">No members yet — members appear here once they complete the membership form.</p>'
      : members.map(athleteRow).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1a2b49">
  <title>EGAC Register — ${displayDate}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { -webkit-tap-highlight-color: transparent; }
    button:disabled { opacity: 0.5; }
  </style>
</head>
<body class="bg-slate-100 font-sans" style="padding-bottom: env(safe-area-inset-bottom, 80px)">
  <div class="max-w-lg mx-auto min-h-screen bg-white shadow-xl flex flex-col">

    <!-- Header -->
    <div class="bg-[#1a2b49] px-5 py-4 text-white sticky top-0 z-20">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-black italic uppercase text-xl leading-none tracking-tight">EGAC Register</h1>
          <p class="text-blue-300 text-xs font-bold uppercase tracking-widest mt-1">${displayDate}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-black text-white leading-none">${checkedInCount}<span class="text-blue-300 text-sm font-bold">/${totalCount}</span></p>
          <p class="text-blue-300 text-[10px] uppercase tracking-widest">Checked in</p>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">

      <!-- Tasters section -->
      <div class="px-4 pt-4 pb-1">
        <h2 class="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Taster sessions
          <span class="ml-1 text-amber-500">${tasters.length}</span>
        </h2>
      </div>
      ${tasterSection}

      <!-- Members section -->
      <div class="px-4 pt-5 pb-1">
        <h2 class="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Members
          <span class="ml-1 text-blue-500">${members.length}</span>
        </h2>
      </div>
      ${memberSection}

      <div class="h-24"></div>
    </div>

    <!-- Footer nav -->
    <div class="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-slate-200 px-4 py-3 flex justify-between items-center z-20"
         style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
      <a href="?date=${prevDate}"
         class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-black text-blue-700 uppercase tracking-widest bg-blue-50 rounded-lg">
        ← Prev
      </a>
      <span class="text-[10px] text-slate-400 truncate px-2">
        ${coachEmail.split('@')[0]}
      </span>
      <a href="?date=${nextDate}"
         class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-black text-blue-700 uppercase tracking-widest bg-blue-50 rounded-lg">
        Next →
      </a>
    </div>
  </div>

  <script>
    // Grab the current view date from the URL to pass back to the API.
    function getViewDate() {
      return new URLSearchParams(window.location.search).get('date')
        || new Date().toISOString().split('T')[0];
    }

    async function checkin(id, type, btn) {
      btn.disabled = true;
      const wasIn = btn.textContent.trim().startsWith('✓');
      btn.textContent = '…';

      try {
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, type, date: getViewDate() }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Server error');
        }

        const data = await res.json();
        const nowIn = data.checked_in;

        // Update button state inline without a full reload
        btn.textContent = nowIn ? '✓ IN' : 'CHECK IN';
        btn.className = btn.className
          .replace(/bg-\\S+ border-\\S+ text-\\S+/g, '')
          .trim();
        if (nowIn) {
          btn.classList.add('bg-emerald-500', 'border-emerald-600', 'text-white');
          btn.closest('div[class*="border-b"]')?.classList.remove('bg-amber-50', 'bg-white');
        } else {
          btn.classList.add('bg-white', 'border-slate-300', 'text-slate-500');
        }
        btn.disabled = false;

        // Update the counter in the header
        const counterEl = document.querySelector('p.text-2xl');
        if (counterEl) {
          const total = parseInt(counterEl.querySelector('span')?.textContent?.replace('/', '') || '0');
          const allBtns = document.querySelectorAll('button');
          let count = 0;
          allBtns.forEach(b => { if (b.textContent.trim().startsWith('✓')) count++; });
          counterEl.childNodes[0].textContent = String(count);
        }

      } catch (e) {
        alert('Check-in failed: ' + e.message);
        btn.textContent = wasIn ? '✓ IN' : 'CHECK IN';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

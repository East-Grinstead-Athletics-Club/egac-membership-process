EGAC SaaS Platform
Full Multi-Phase AI Prompt Schedule

Stack: Astro SSR  ·  Cloudflare Pages  ·  Cloudflare Workers  ·  D1 (SQLite)  ·  KV  ·  Resend  ·  Vitest + Miniflare
Updated: March 2026  ·  Test status: 159/159 passing  ·  Prompts 0-1 through 1-6 complete

✅  Prompts 0-1 → 1-6
COMPLETE · 159 tests	⚠️  src/api/academy.ts
FIX BEFORE PROMPT 7	▶  Next: Prompt 7
Public Astro pages	⏳  Prompts 8–14
Cron, Admin, Launch

 
How to Use This Schedule
Each prompt is a complete, self-contained instruction to paste into a new Claude session. The output of each session becomes the input context for the next. Always attach the project zip from the previous session before starting the next prompt.

Between Every Session
npm test               # must stay green
npm run lint           # zero warnings
npm run format:check   # all files formatted
git add -A
git commit -m "phase N prompt N: description"
git push

Critical Design Decisions — Read Before Starting
These architectural rules are baked into the codebase. Future prompts must respect them.

UK Athletics Age Rule
Age groups are determined by the athlete's age on 31 August at the END of the athletics season the session falls in — not their birthday, not the session date.
Session Oct 2026 → season 2026/27 → reference date: 31 Aug 2027
Session Apr 2026 → season 2025/26 → reference date: 31 Aug 2026
Function: athleticsSeasonEndYear(dateIso) in src/lib/business/age.ts

Age Groups are D1-Configurable
There are zero hardcoded slot codes in TypeScript. All age groups, labels, age boundaries, session times, and capacity are stored in the age_groups D1 table and editable at runtime. This exists because UK Athletics is changing boundaries imminently (U11→U12 etc).

Academy Programme
The U11 Academy runs April–August. All 40 athletes attend both Saturday AND Tuesday — it is one cohort, not two separate sessions. Returning athletes (accepted in previous season) are invited first. The system auto-identifies them via the is_returning flag in academy_waitlist.

 
⚠️  Known Issues — Fix Before Prompt 7
src/api/academy.ts calls stale function names from the old data model.

These functions DO NOT EXIST — the file will crash at runtime:
getAcademyInvitationByToken(token, env)     // ❌ OLD — does not exist
processAcademyResponse(token, response, env) // ❌ OLD — does not exist

Replace with:
getWaitlistEntryByToken(token, env)          // ✅ from repositories/academy.ts
recordWaitlistResponse(token, response, env) // ✅ from repositories/academy.ts

The handler logic is correct — only the function names need changing. Also update the mock in tests/unit/api.test.ts (POST /api/academy/respond) from getAcademyInvitationByToken to getWaitlistEntryByToken.

 
Full Prompt Schedule Overview
Prompt	Phase	Deliverable	Status	Tests
0-1	Phase 0	Schema, seed, TS types, D1 client, config, wrangler.toml	COMPLETE	34
0-2	Phase 0	Business logic (age, enquiry, booking, tokens, templates)	COMPLETE	+56
0-3	Phase 0	CI/CD (GitHub Actions), ESLint, Prettier	COMPLETE	—
1-4	Phase 1	Repository layer (all 6 repositories)	COMPLETE	+26
1-5	Phase 1	Email service (Resend client, all senders, preview)	COMPLETE	+17
1-6	Phase 2	Public API handlers (enquiry, booking, academy, health)	COMPLETE	+26
7	Phase 2	Public Astro pages: enquiry form, booking, academy respond	▶ NEXT	—
8	Phase 2	Cron jobs: invite retry, expire, booking reminders, season rollover	PENDING	—
9	Phase 3	Admin portal auth + enquiry management UI	PENDING	—
10	Phase 3	Admin bookings management + attendance	PENDING	—
11	Phase 3	Admin email template editor	PENDING	—
12	Phase 3	Config management + age group admin	PENDING	—
13	Phase 4	Security hardening (rate limiting, input sanitisation, CORS)	PENDING	—
14	Phase 5	Test completion, deploy pipeline, SaaS architecture docs	PENDING	≥50

 
Phase 0 — Foundation
Establishes the entire project skeleton: database schema, TypeScript types, D1 client, business logic layer, and CI pipeline. Nothing can be built without these in place.

Prompt 0-1  Project Scaffold & Environment	COMPLETE
Deliverables
•	db/migrations/0001_initial_schema.sql — all 6 tables + indexes
•	db/seed.sql — 5 age groups + 6 email templates, INSERT OR IGNORE throughout
•	src/lib/db/schema.ts — TypeScript interfaces for all tables (Enquiry, AgeGroup, Booking, AcademyWaitlistEntry, AcademySeason, Env, etc.)
•	src/lib/db/client.ts — D1 wrapper: one(), many(), run(), generateId(), generateToken(), now()
•	src/lib/config.ts — KV-backed SystemConfig with defaults and 5-min TTL
•	wrangler.toml — D1 and KV bindings, three environments (dev/staging/production)
•	tests/unit/db.test.ts — 34 tests

Key architectural decision
All D1 queries include AND environment = ? filtering. Rows written in development are invisible to staging/production queries. This is enforced by passing env.APP_ENV to every repository function.

Prompt 0-2  Core Business Logic Engine	COMPLETE
Deliverables — pure TypeScript functions, no I/O
•	src/lib/business/age.ts — athleticsSeasonEndYear, ageForAthletics, ageOnDate, resolveAgeGroup, isAgeGroupEligible, validateSessionDate, getNextNSessionDates, getNextNTuesdayDates
•	src/lib/business/enquiry.ts — validateEnquiryData, routeEnquiry, sanitiseString
•	src/lib/business/booking.ts — validateBookingRequest, buildBookingConfirmation, buildAvailabilityList
•	src/lib/business/tokens.ts — generateSecureToken, isTokenExpired, isInviteExpired
•	src/lib/business/templates.ts — renderTemplate, extractTemplateVariables, validateTemplateVariables
•	tests/unit/business.test.ts — 56 tests

Prompt 0-3  GitHub Actions CI Pipeline	COMPLETE
Deliverables
•	.github/workflows/ci.yml — install → lint → format-check → test → type-check
•	.github/workflows/deploy-staging.yml — CI → migrate D1 staging → deploy → smoke test
•	.github/workflows/deploy-production.yml — same as staging targeting production
•	.eslintrc.cjs, .prettierrc, .prettierignore
•	docs/ops/ci-secrets.md — every required secret with where to find it and rotation instructions

 
Phase 1 — Data Access Layer
Typed repository functions wrapping D1 queries, and the complete Resend email service. No HTTP handling in this layer.

Prompt 1-4  Repository Layer & D1 CRUD	COMPLETE
Deliverables
•	src/lib/repositories/enquiries.ts — insertEnquiry, getEnquiryById, getEnquiryByEmail, listEnquiries, updateEnquiry, appendEnquiryEvent
•	src/lib/repositories/invites.ts — createInviteForEnquiry, getInviteByToken, markInviteSent/Accepted/Expired, listPendingInvites
•	src/lib/repositories/bookings.ts — createBooking, getBookingByInviteAndDate, countBookingsForDateAndGroup, listUpcomingBookings, updateBookingStatus
•	src/lib/repositories/age-groups.ts — listAgeGroups, getAgeGroupById, getAgeGroupByCode, getTasterAgeGroups, getWaitlistAgeGroups
•	src/lib/repositories/academy.ts — addToWaitlist, getWaitlistEntryByToken, recordWaitlistResponse, assignWaitlistToSeason, createAcademySeason, getOpenAcademySeason, updateSeasonStatus
•	src/lib/repositories/templates.ts — getTemplateByKey, listTemplates, updateTemplate
•	tests/unit/repositories.test.ts — 26 tests against Miniflare D1

Prompt 1-5  Email Service with Resend	COMPLETE
Deliverables
•	src/lib/email/client.ts — sendEmail, sendEmailWithRetry (exponential backoff)
•	src/lib/email/templates.ts — sendBookingInvite, sendBookingConfirmation, sendAcademyWaitlist, sendMembershipInvite, sendBookingReminder
•	src/lib/email/preview.ts — dev preview helper
•	tests/unit/email.test.ts — 17 tests, fetch fully mocked

Email functions never throw
All send functions return { success: boolean, error?: string } and log failures. A broken Resend key or template error must never crash a user-facing request.

 
Phase 2 — Public-Facing Flows

Prompt 1-6  Public API Handlers	COMPLETE
Deliverables
•	src/api/router.ts — handleRequest() main entry point + Cloudflare Worker export
•	src/api/helpers.ts — ok(), err(), parseBody(), corsPreflightResponse()
•	src/api/enquiry.ts — POST /api/enquiry
•	src/api/booking.ts — POST /api/booking
•	src/api/academy.ts — POST /api/academy/respond  ⚠️ SEE KNOWN ISSUES
•	src/api/health.ts — GET /api/health
•	tests/unit/api.test.ts — 26 tests

Prompt 7  Public Astro Pages	▶ START HERE
Context to attach
Attach egac-phase1-corrected.zip. Fix academy.ts (see Known Issues) before writing any new code.

Page 1 — Enquiry Form  ( / )
•	Fields: name*, email*, phone (optional), date of birth (optional)
•	POST to /api/enquiry
•	Confirmation varies by path: taster → "We'll send a booking link shortly" · waitlist → "We've added your child to the Academy waitlist"
•	Progressive enhancement — works without JS for basic submission

Page 2 — Booking Page  ( /book/[token] )
•	SSR: load invite by token server-side on page render
•	Show athlete name, age group, available session dates
•	Capacity per date from countBookingsForDateAndGroup (e.g. "2 places left")
•	POST to /api/booking → confirmation + add-to-calendar link
•	Handle expired/used invite gracefully

Page 3 — Academy Response  ( /academy/respond/[token] )
•	SSR: load waitlist entry by token
•	Show season details, accept/decline buttons
•	POST to /api/academy/respond
•	Handle already-responded gracefully

Notes
•	Use Astro SSR with output: "server" in astro.config.mjs
•	Tailwind CSS for styling
•	Reuse formatDateForDisplay() from src/lib/business/age.ts
•	Server-side form handling preferred over React client components

Prompt 8  Cron Jobs & Invite Lifecycle	PENDING
Deliverables
•	POST /api/cron/expire-invites — marks sent invites older than 14 days as expired; auth: CRON_SECRET
•	POST /api/cron/retry-invites — retries pending invites with < 3 attempts; stops at 3; sets status="failed"
•	POST /api/cron/send-reminders — sends booking_reminder emails ~7 days before session; idempotent (checks enquiry events for "reminder_sent")
•	POST /api/cron/academy-rollover — rolls unplaced waitlist entries to the next season; sets is_returning for returning athletes
•	wrangler.toml cron triggers: [triggers] crons = ["0 9 * * *", "0 18 * * 2", "*/30 * * * *"]
•	tests/unit/cron.test.ts — ≥6 tests: idempotency, retry limits, expiry age checks

 
Phase 3 — Admin Portal
Admin routes require Authorization: Bearer <ADMIN_TOKEN> or x-admin-token header. "dev" token accepted only in APP_ENV=development.

Prompt 9  Admin Auth & Enquiry Management	PENDING
Deliverables
•	src/lib/auth/admin.ts — requireAdmin(request, env), wrapAdminRoute(handler)
•	GET/POST /api/admin/enquiries — list with filters (status, email search, pagination) + manual submission
•	GET/PATCH /api/admin/enquiries/[id] — detail with full event timeline
•	POST /api/admin/invites/resend — resend booking invite; reuses existing pending invite
•	/admin/enquiries.astro — table: date, name, email, DOB, path, invite status, booking status; status tabs; search; pagination
•	/admin/enquiries/[id].astro — contact info, events timeline, bookings, actions: edit note, resend invite
•	tests: unauthenticated → 401, dev token rejected in production, resend creates/reuses invite

Prompt 10  Booking Management & Attendance	PENDING
Deliverables
•	GET /api/admin/bookings — list upcoming, grouped by date, with athlete details per slot
•	POST /api/admin/bookings/[id]/attendance — record attended/no_show/cancelled; optional membership invite (creates OTP, stores in membership_otps table)
•	GET /api/admin/reports — enquiry counts, booking counts, attendance rate, academy pipeline, upcoming sessions
•	/admin/bookings.astro — week view of Tuesdays; attendance buttons (AJAX); "send membership link" checkbox on attended
•	/admin/reports.astro — metric cards + pure CSS charts (no chart library)
•	db/migrations/0002_membership_otps.sql

Prompt 11  Email Template Editor	PENDING
Deliverables
•	GET/POST /api/admin/templates — list + create
•	GET/PATCH /api/admin/templates/[id] — get + partial update; validates {{variable}} placeholders against allowedVars
•	GET /api/admin/templates/[id]/preview — rendered HTML with sample data
•	POST /api/admin/templates/[id]/test-send — sends to admin email only (validated against env.ADMIN_EMAIL)
•	/admin/templates.astro — table with active toggle (AJAX)
•	/admin/templates/[id].astro — plain textarea editor + live preview iframe + variables reference; warn on unsaved changes

Prompt 12  Config Management & Age Group Admin	PENDING
Deliverables
•	GET/PATCH /api/admin/config — read/write KV config; validates types (capacity 1-10, weeks 1-16)
•	GET/POST /api/admin/age-groups — list + create; validates code unique, age range valid, session_time HH:MM
•	PATCH/DELETE /api/admin/age-groups/[id] — update or soft-delete; 409 if age group has future confirmed bookings
•	/admin/config.astro — booking settings + age groups table with inline edit
•	/admin/academy.astro — waitlist table with invitation status; manual trigger; summary stats
•	GET/POST /api/admin/academy — list enriched + manual send trigger

 
Phase 4 — Security Hardening

Prompt 13  Error Handling, Rate Limiting & Security Headers	PENDING
Deliverables
•	src/middleware/index.ts — security headers (X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy) on all responses
•	Rate limiting for public API: KV key ratelimit:{ip}:{minute_bucket}, 10 req/min, 429 with Retry-After
•	src/lib/errors.ts — ValidationError (400), AuthError (401), NotFoundError (404), ConflictError (409), RateLimitError (429)
•	All API routes use handleApiError() — never leaks stack traces
•	Structured JSON logging on all significant operations
•	docs/security/audit.md — SQL injection review, XSS in templates, SSRF checks
•	≥8 tests: rate limit triggers on 11th request, security headers present, health endpoint degrades on DB failure

Phase 5 — CI/CD & SaaS Architecture

Prompt 14  Test Completion, Deploy Pipeline & SaaS Extension Docs	PENDING
Deliverables
•	Test audit — run npm test, list all tests by file, write additional tests until ≥50 total, all passing
•	Deploy pipeline update — add D1 0002 migration step, smoke test (curl /api/health → fail on non-200), PR comment on failure
•	docs/architecture.md — component map (Pages/Workers/D1/KV/Resend), business rule locations, data flow Mermaid diagrams
•	docs/saas-extension.md — multi-club roadmap: schema changes (club_id), env var routing strategy, KV namespace isolation, cost model
•	README.md — architecture summary, environment variables table, test count badge, deployment diagram

 
Reference
Test Count Checkpoints
After Prompt	Expected Total	Status
0-2	≥90	COMPLETE (159)
1-4	≥116	COMPLETE (159)
1-5	≥133	COMPLETE (159)
1-6	≥159	COMPLETE (159)
8	≥165	PENDING
9	≥173	PENDING
13	≥181	PENDING
14	≥50 verified	PENDING

Environment Variables
Variable	Purpose	Notes
RESEND_API_KEY	Resend email API key	resend.com → API Keys
ADMIN_TOKEN	Bearer token for admin portal	openssl rand -hex 32
ADMIN_EMAIL	Admin notification + test send recipient	Must be verified in Resend
EMAIL_FROM	Sending address	Must be verified domain in Resend
CRON_SECRET	Protects cron endpoints	openssl rand -hex 32
APP_ENV	development | staging | production	Controls D1 row isolation
CF_ACCOUNT_ID	Cloudflare account ID	Cloudflare dashboard → sidebar
CLOUDFLARE_API_TOKEN	Cloudflare API token	Needs D1 + Pages + Workers scope

SystemConfig Keys (KV-backed)
Key	Default	Purpose
weeks_ahead_booking	"8"	Tuesdays to offer on booking page
site_name	"EGAC"	Used in email templates
site_url	—	Base URL for booking/response links
email_from	—	Sender address for Resend
venue_name	—	Shown in booking confirmations
venue_address	—	Shown in booking confirmations
admin_email	—	BCC / notification target

Age Groups (D1 seed)
Code	Label	Type	Age on 31 Aug	Session days	Capacity
u11	U11 Academy	waitlist	9–10	Sat + Tue	40/season
u13	U13	taster	11–12	Tuesday	2/session
u15	U15	taster	13–14	Tuesday	2/session
u17	U17	taster	15–16	Tuesday	2/session
u20	U20	taster	17–19	Tuesday	2/session

UK Athletics is changing age group boundaries imminently (U11→U12 etc). All boundaries are admin-editable at runtime — this is the entire point of the D1 model.

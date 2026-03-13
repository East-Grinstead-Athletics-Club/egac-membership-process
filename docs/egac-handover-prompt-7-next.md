# EGAC Platform — Handover Document
**Date:** 13 March 2026  
**Prepared for:** Next development session  
**Project zip:** `egac-phase1-corrected.zip`  
**Test status:** ✅ 159/159 passing, 0 lint warnings

---

## Project Overview

A bespoke SaaS platform for **East Grinstead Athletics Club (EGAC)** handling:
- Public enquiry form → age-group routing → taster booking or Academy waitlist
- Invite-based taster session booking (U13–U20, Tuesday evenings)
- U11 Academy programme (April–August, Sat + Tue) — waitlist-based, no self-booking
- Admin portal (not yet built) for managing enquiries, bookings, templates, config
- Email comms via Resend

**Stack:** Astro (SSR) · Cloudflare Pages · Cloudflare Workers · D1 (SQLite) · KV · Resend · Vitest + Miniflare

---

## Tech Architecture

```
Public web (Astro SSR pages)          → Cloudflare Pages
API handlers (Worker fetch)           → src/api/*.ts → handleRequest() → router.ts
Business logic (pure functions)       → src/lib/business/*.ts
Repository layer (D1 queries)         → src/lib/repositories/*.ts
Email service (Resend)                → src/lib/email/*.ts
Config (KV-backed runtime config)     → src/lib/config.ts
Schema & migrations                   → db/migrations/0001_initial_schema.sql
Seed data                             → db/seed.sql
```

**Environment:** `APP_ENV` on the Worker env object controls D1 row isolation (`development` | `staging` | `production`). All queries scope by environment automatically.

---

## Age Group Model — CRITICAL DESIGN DECISION

Age groups are **fully configurable in D1**. There are zero hardcoded slot codes in TypeScript.

### UK Athletics age rule
An athlete's age group is determined by their age on **31 August at the end of the athletics season the session falls in** — not the session date, not their birthday.

```
Season runs:  1 September → 31 August
Session on:   14 October 2026  → season 2026/27 → reference date: 31 Aug 2027
Session on:   14 April 2026    → season 2025/26 → reference date: 31 Aug 2026
```

The function `athleticsSeasonEndYear(dateIso)` in `src/lib/business/age.ts` handles this. All age calculations MUST go through `ageForAthletics(dob, sessionDate)`.

### Seeded age groups

| Code | Label | Type | Age on 31 Aug | Session days | Time | Capacity |
|------|-------|------|---------------|--------------|------|---------|
| u11 | U11 Academy | waitlist | 9–10 | Sat + Tue | — | 40/season |
| u13 | U13 | taster | 11–12 | Tuesday | 18:30 | 2/session |
| u15 | U15 | taster | 13–14 | Tuesday | 18:30 | 2/session |
| u17 | U17 | taster | 15–16 | Tuesday | 19:30 | 2/session |
| u20 | U20 | taster | 17–19 | Tuesday | 19:30 | 2/session |

UK Athletics is changing age group boundaries imminently (U11→U12, U13→U14 etc). All boundaries are admin-editable at runtime — this is the entire point of the D1 model.

### Routing logic
```typescript
resolveAgeGroup(dob, sessionDate, allGroups) → AgeGroupConfig | null
routeEnquiry(ageGroup) → 'taster' | 'waitlist'
```
- `booking_type === 'waitlist'` → Academy waitlist path  
- `booking_type === 'taster'` or null → booking invite path

---

## Academy Programme Model

- Runs **April–August** as a standalone programme (Sat mornings + Tue evenings)
- All 40 athletes attend **both** Saturday and Tuesday — single cohort, single capacity
- After August, Academy athletes train with the main club until the following April
- **Waitlist-based** — parents cannot self-book; admin triggers bulk invites
- **Returning athletes** (accepted status in previous season) are invited first — system auto-identifies them
- Athletes who don't get a place roll over automatically to next April's waitlist

### Academy tables
- `academy_seasons` — one row per season (e.g. "Academy 2026", April–August)
- `academy_waitlist` — one row per enquiry per season consideration; `is_returning` flag; `rolled_over_from_season_id` for rollover tracking

---

## File Inventory

### Database
```
db/migrations/0001_initial_schema.sql   Full schema — all tables
db/seed.sql                             5 age groups + 6 email templates
```

### Business logic (pure functions, no I/O)
```
src/lib/business/age.ts         athleticsSeasonEndYear, ageForAthletics, ageOnDate,
                                resolveAgeGroup, isAgeGroupEligible, validateSessionDate,
                                getNextNSessionDates, getNextNTuesdayDates (compat wrapper)
src/lib/business/enquiry.ts     validateEnquiryData, routeEnquiry, sanitiseString
src/lib/business/booking.ts     validateBookingRequest, buildBookingConfirmation,
                                buildAvailabilityList
src/lib/business/tokens.ts      generateSecureToken, isTokenExpired, isInviteExpired
src/lib/business/templates.ts   renderTemplate, extractTemplateVariables,
                                validateTemplateVariables
```

### Database layer
```
src/lib/db/schema.ts            All TypeScript types (Enquiry, AgeGroup, Booking,
                                AcademyWaitlistEntry, AcademySeason, Env, etc.)
src/lib/db/client.ts            D1 wrapper: one(), many(), run(), getDB(), getEnv(),
                                generateId(), generateToken(), now()
src/lib/config.ts               KV-backed SystemConfig with defaults
```

### Repositories (D1 queries, environment-scoped)
```
src/lib/repositories/enquiries.ts    insertEnquiry, getEnquiryById, getEnquiryByEmail,
                                     listEnquiries, updateEnquiry, appendEnquiryEvent
src/lib/repositories/invites.ts      createInviteForEnquiry, getInviteByToken,
                                     markInviteAccepted, markInviteExpired, markInviteSent,
                                     listPendingInvites
src/lib/repositories/bookings.ts     createBooking, getBookingById,
                                     getBookingByInviteAndDate,
                                     countBookingsForDateAndGroup,   ← NOTE: new name
                                     listBookingsForDate, listBookingsByEnquiry,
                                     listUpcomingBookings, updateBookingStatus
src/lib/repositories/age-groups.ts   listAgeGroups, getAgeGroupById, getAgeGroupByCode,
                                     getTasterAgeGroups, getWaitlistAgeGroups
src/lib/repositories/academy.ts      addToWaitlist, getWaitlistEntryById,
                                     getWaitlistEntryByToken, getWaitlistEntryByEnquiry,
                                     listWaitlistBySeason, listUnassignedWaitlist,
                                     updateWaitlistStatus, markWaitlistInviteSent,
                                     recordWaitlistResponse, assignWaitlistToSeason,
                                     countAcceptedForSeason,
                                     createAcademySeason, getAcademySeasonById,
                                     getOpenAcademySeason, listAcademySeasons,
                                     updateSeasonStatus
src/lib/repositories/templates.ts    getTemplateByKey, listTemplates, updateTemplate
```

### Email service
```
src/lib/email/client.ts         Resend API wrapper with retry logic
src/lib/email/templates.ts      sendBookingInvite, sendBookingConfirmation,
                                sendAcademyWaitlist, sendMembershipInvite,
                                sendBookingReminder
src/lib/email/preview.ts        Dev preview helper
```

### API handlers (Cloudflare Worker)
```
src/api/router.ts               handleRequest() — main entry point + CF Worker export
src/api/helpers.ts              ok(), err(), parseBody(), corsPreflightResponse()
src/api/enquiry.ts              POST /api/enquiry
src/api/booking.ts              POST /api/booking
src/api/academy.ts              POST /api/academy/respond   ⚠️ SEE KNOWN ISSUES
src/api/health.ts               GET  /api/health
```

### Tests
```
tests/unit/business.test.ts     56 tests — age logic, routing, validation, tokens, templates
tests/unit/db.test.ts           34 tests — D1 client, config, schema types
tests/unit/repositories.test.ts 26 tests — all repositories against Miniflare D1 + seed
tests/unit/email.test.ts        17 tests — email template rendering, retry logic
tests/unit/api.test.ts          26 tests — API handlers with mocked repositories
```

### Config / CI
```
wrangler.toml                   D1 and KV bindings, dev/staging/production environments
.github/workflows/ci.yml        Test + lint on every push
.github/workflows/deploy-staging.yml
.github/workflows/deploy-production.yml
docs/ops/ci-secrets.md          Required GitHub secrets reference
```

---

## Known Issues / Next Session Must-Fix

### ⚠️ `src/api/academy.ts` uses stale function names
The academy respond handler still calls `getAcademyInvitationByToken` and `processAcademyResponse` — these are from the old `academy_invitations` model and **do not exist** in the current repository. The new equivalents are:

```typescript
// OLD (broken — do not use)
getAcademyInvitationByToken(token, env)
processAcademyResponse(token, response, env)

// NEW (correct)
getWaitlistEntryByToken(token, env)        // from repositories/academy.ts
recordWaitlistResponse(token, response, env) // from repositories/academy.ts
```

The handler logic is otherwise correct — only the function names need updating. The test for this handler (`tests/unit/api.test.ts` → `POST /api/academy/respond`) likely also needs its mock updated from `getAcademyInvitationByToken` to `getWaitlistEntryByToken`.

**Fix this before Prompt 7.** It won't affect tests in the current state (the API test file mocks the repo at module level) but will cause a runtime crash.

---

## Prompt Schedule

### ✅ Completed

| Prompt | Phase | Deliverable | Tests |
|--------|-------|-------------|-------|
| 0-1 | Foundation | Schema, seed, TS types, D1 client, config, wrangler.toml | 34 |
| 0-2 | Foundation | Business logic (age, enquiry, booking, tokens, templates) | +56 |
| 0-3 | Foundation | CI/CD (GitHub Actions), ESLint, Prettier | — |
| 1-4 | Backend | Repository layer (all 6 repositories) | +26 |
| 1-5 | Backend | Email service (Resend client, all senders, preview) | +17 |
| 1-6 | Backend | Public API handlers (enquiry, booking, academy, health, router) | +26 |
| — | Correction | Full age group model rewrite (U11–U20, UK Athletics season rule, Academy model) | 159 total |

### ⏳ Remaining

| Prompt | Phase | Deliverable |
|--------|-------|-------------|
| **7** | Frontend | Public Astro pages: enquiry form, booking page, academy response page |
| **8** | Backend | Cron jobs: invite retry, expire invites, booking reminders, academy season rollover |
| **9** | Admin | Admin portal auth (bearer token middleware, login page) |
| **10** | Admin | Admin bookings management UI |
| **11** | Admin | Admin template editor UI |
| **12** | Admin | Config management UI |
| **13** | Security | Security hardening (rate limiting, input sanitisation, CORS lockdown) |
| **14** | Finish | Test completion, deploy pipeline validation, SaaS architecture docs |

---

## Starting Prompt 7 — Public Astro Pages

Three pages to build:

### 1. Enquiry form — `/`
- Fields: name, email, phone (optional), date of birth (optional)
- Submits to `POST /api/enquiry`
- On success: show appropriate confirmation message
  - Taster path: "We'll send you a booking link shortly"
  - Waitlist path: "We've added your child to the Academy waitlist"
- Accessible, no JS required for basic submission (progressive enhancement)

### 2. Booking page — `/book/[token]`
- Loads invite by token (SSR, server-side token lookup)
- Shows athlete name, age group, available Tuesday dates (from `getNextNSessionDates`)
- Date picker: only valid session days, capacity shown (e.g. "2 places left")
- Submits to `POST /api/booking`
- On success: confirmation screen with session details + add-to-calendar link
- Handle expired/used invite gracefully

### 3. Academy response page — `/academy/respond/[token]`
- Loads waitlist entry by token (SSR)
- Shows season details, child name, accept/decline buttons
- Submits to `POST /api/academy/respond`
- Handle already-responded gracefully

### Notes for Prompt 7
- Use Astro's `getStaticPaths` / SSR with `output: 'server'` in `astro.config.mjs`
- Tailwind CSS for styling (already in the stack plan)
- Server-side form handling preferred — no React needed for these pages
- Reuse `formatDateForDisplay()` from `src/lib/business/age.ts` for date display
- The booking page needs to call `countBookingsForDateAndGroup` per date to show availability

---

## Key Business Rules Reference

| Rule | Detail |
|------|--------|
| Age reference date | 31 August at end of the athletics season the session falls in |
| Athletics season | 1 September → 31 August |
| Academy season | April–August (configurable via `academy_seasons` table) |
| Academy capacity | 40 places total per season (one cohort, both Sat + Tue sessions) |
| Invite TTL | 14 days (`isInviteExpired` in tokens.ts) |
| Membership OTP TTL | 7 days |
| Taster capacity | 2 per age group per session (configurable in `age_groups.capacity_per_session`) |
| Session days | U11: Sat + Tue · U13–U20: Tuesday only |
| Returning athletes | Identified by `accepted` status in previous season's `academy_waitlist` |
| Env isolation | All D1 queries filter by `environment` column matching `APP_ENV` |
| Duplicate enquiries | Silently return 200 if email already has a processed enquiry |

---

## SystemConfig Keys (KV-backed, editable at runtime)

| Key | Default | Purpose |
|-----|---------|---------|
| `weeks_ahead_booking` | `'8'` | How many weeks of Tuesdays to offer in the booking page |
| `site_name` | `'EGAC'` | Used in email templates |
| `site_url` | — | Base URL for booking/response links in emails |
| `email_from` | — | Sender address for Resend |
| `venue_name` | — | Shown in booking confirmations |
| `venue_address` | — | Shown in booking confirmations |
| `admin_email` | — | BCC / notification target |

---

## Environment Variables (Cloudflare Worker secrets)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key |
| `ADMIN_TOKEN` | Bearer token for admin API routes |
| `ADMIN_EMAIL` | Admin notification email |
| `EMAIL_FROM` | Sending address (must be verified in Resend) |
| `CRON_SECRET` | Shared secret for cron trigger verification |
| `APP_ENV` | `development` \| `staging` \| `production` |

See `docs/ops/ci-secrets.md` for the full list of GitHub Actions secrets required for CI/CD.

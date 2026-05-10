# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick Start

```bash
npm install                           # Install dependencies
wrangler dev                          # Start dev server (Astro + Workers)
npm test                              # Run tests (Vitest)
npm run lint && npm run format:check  # Check code quality
```

See [Development](#development) section below for database setup and running individual commands.

---

## Project Overview

**EGAC** is a Cloudflare-native club management platform for East Grinstead Athletics Club. It handles athlete enquiries, taster session bookings, Academy waitlist management, and member attendance tracking.

- **Framework**: Astro (SSR via Cloudflare Pages)
- **Serverless compute**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Cache/config**: Cloudflare KV
- **Email**: Resend API
- **Testing**: Vitest + Miniflare

**Zero infrastructure cost** — runs entirely on Cloudflare's free tier.

---

## Architecture

The platform is split into **three layers** with clear responsibilities:

### Layer 1: Astro Pages (SSR)
- Public pages: enquiry form (`/`), booking pages (`/book/[token]`), Academy response (`/academy/respond/[token]`), membership join (`/join`)
- Admin pages: portal at `/admin/*` with cookie-based auth
- Each page file at `src/pages/*.astro` runs as a Cloudflare Worker via the `@astrojs/cloudflare` adapter

### Layer 2: Workers API (Router)
- Single entry point: `src/api/router.ts` (exported to `src/pages/api/[...path].ts`)
- All business logic flows through `src/lib/` modules before touching data
- Three route categories:
  - **Public** (no auth): `/api/enquiry`, `/api/booking`, `/api/academy/respond`
  - **Cron** (Bearer `CRON_SECRET`): `/api/cron/*` for scheduled jobs
  - **Admin** (Bearer `ADMIN_TOKEN`): `/api/admin/*` for portal operations

### Layer 3: Data + Services
- **D1 (SQLite)**: Persistent data — enquiries, bookings, athletes, email templates, config
- **KV**: Config cache (5-min TTL), rate-limit counters, health check probes
- **Resend**: All outbound email (booking invites, confirmations, reminders, Academy notices)

**Key insight**: Business rules are **never** encoded in SQL, templates, or pages. All conditional logic lives in `src/lib/business/*.ts` — pure TypeScript functions with zero I/O.

---

## Directory Structure

```
src/
├── api/
│   ├── admin/           # Admin API endpoints (auth required)
│   ├── cron/            # Scheduled job handlers
│   ├── router.ts        # Single entry point + cron dispatcher
│   └── helpers.ts       # Response builders, auth checks
├── components/          # Astro/HTML components (forms, booking UI, etc)
├── layouts/
│   ├── Base.astro       # Shared base layout
│   ├── PublicLayout.astro  # For public pages
│   └── AdminBase.astro  # For admin pages
├── lib/
│   ├── auth/            # Admin cookie verification
│   ├── business/        # Pure domain logic (age rules, routing, validation)
│   │   ├── age.ts          # UK Athletics age calculation
│   │   ├── enquiry.ts      # Enquiry routing + validation
│   │   ├── booking.ts      # Booking validation + capacity
│   │   ├── tokens.ts       # Token generation/expiry
│   │   └── templates.ts    # Template rendering
│   ├── db/              # D1 client, schema types
│   ├── email/           # Resend client + template senders
│   ├── repositories/    # D1 CRUD (one file per domain model)
│   ├── errors.ts        # Error classes + handler
│   └── config.ts        # KV-backed system config
├── middleware/          # Security headers, rate limiting
├── pages/
│   ├── admin/           # Admin portal pages
│   ├── api/[...path].ts # Catch-all → router
│   ├── index.astro      # Enquiry form
│   ├── book/[token].astro    # Booking page
│   ├── academy/respond/[token].astro
│   └── join.astro       # Membership form
├── styles/              # Global styles (Tailwind)
└── workers/
    └── coach-app.js     # Standalone coach register (Cloudflare Access auth)

db/
├── migrations/          # SQL files (numbered 0001→0004)
└── seed.sql            # Age groups + email template defaults

tests/
└── unit/               # 231 tests across 8 files (no e2e)

docs/
├── architecture.md     # Full component map + data flows
├── security/audit.md   # Security review findings
└── mermaid-*.md       # Data flow diagrams
```

---

## Development

### Prerequisites
- Node ≥18
- `npm` (included with Node)
- `wrangler` (CLI for Cloudflare — installed via `npm install`)

### Start the dev server
```bash
wrangler dev
```
This starts Astro SSR + a local Cloudflare Workers runtime on `http://localhost:8787`.

### Database setup (first time)
```bash
# Run migrations against local D1 (creates tables)
wrangler d1 execute egac --local --file=db/migrations/0001_initial_schema.sql
wrangler d1 execute egac --local --file=db/migrations/0002_membership_forms.sql
wrangler d1 execute egac --local --file=db/migrations/0003_update_academy_waitlist_template.sql
wrangler d1 execute egac --local --file=db/migrations/0004_coach_app.sql

# Seed age groups + email templates
wrangler d1 execute egac --local --file=db/seed.sql
```

### Testing
```bash
npm test                    # Run all 231 tests once
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm test -- business.test  # Run single file (name substring)
```

Tests use **Miniflare** to simulate D1 locally (no external DB calls). All tests run against an in-memory SQLite instance.

### Code quality
```bash
npm run lint                # ESLint (TypeScript + Astro)
npm run format:check        # Prettier
npm run format              # Auto-fix formatting
npm run type-check          # TypeScript compiler (emit errors only)
```

### Other useful commands
```bash
npm run build           # Build for production (output to dist/)
npm run preview         # Preview built site locally
```

---

## Key Conventions

### Row isolation (critical)
Every D1 query must include `AND environment = ?` to separate dev/staging/production data. This is enforced in repository functions, not at the database level. **Never skip this.**

```typescript
// Good ✓
const rows = db.prepare(
  'SELECT * FROM enquiries WHERE environment = ? AND id = ?'
).all(env.APP_ENV, enquiryId);

// Bad ✗
const rows = db.prepare(
  'SELECT * FROM enquiries WHERE id = ?'
).all(enquiryId);
```

### Business logic placement
- **Conditional logic** → `src/lib/business/*.ts` (pure functions, testable)
- **API route logic** → `src/api/*.ts` (handlers, auth, response formatting)
- **Data access** → `src/lib/repositories/*.ts` (D1 CRUD)
- **Page logic** → `src/pages/*.astro` (fetch data, pass to components)
- **Never in**: SQL triggers, email templates, Astro pages

### Error handling
- Throw custom errors from `src/lib/errors.ts` (e.g. `AuthError`, `ValidationError`)
- Catch and format in API handlers via `handleApiError(err, res)`
- Returns 400/401/500 with `{ error: 'message', timestamp }` JSON

### Authentication
- **Admin portal**: `egac_admin_token` cookie (validated on every page load)
- **Admin API**: `Authorization: Bearer ADMIN_TOKEN` header
- **Cron jobs**: `Authorization: Bearer CRON_SECRET` header
- **Coach app**: Cloudflare Access policy (configured in dashboard)
- **Rate limiting**: 10 req/min per IP (KV-backed, on enquiry/booking/academy routes)

### Email templates
- Stored in `email_templates` D1 table (editable via admin portal)
- Rendered from `src/lib/email/templates/` TypeScript files (template definition + variables)
- Variable substitution: `{{parentName}}`, `{{sessionDate}}`, etc.
- **Admin** tests email sends to `ADMIN_EMAIL` only (never to parents in testing)

### Security headers
Added by `src/middleware/index.ts` on every response:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'; form-action 'self'`

---

## Database Schema

Key tables (see migrations for full schema):

| Table | Purpose |
|---|---|
| `enquiries` | Parent registration + event log (JSON array of events) |
| `invites` | Booking invite tokens (one per enquiry, reusable, expiring) |
| `bookings` | Confirmed taster sessions (with `checked_in_at` for coach app) |
| `age_groups` | Configurable boundaries (U10, U11, etc.) |
| `academy_seasons` | Open/closed seasons for waitlist management |
| `academy_waitlist` | Waitlist entries with response tracking |
| `email_templates` | Editable HTML templates (6 types: booking, reminder, Academy, membership) |
| `membership_otps` | One-time tokens for membership form access |
| `membership_forms` | Submitted form payloads (JSON) |
| `athletes` | Active members (inserted from membership form) |
| `attendance_log` | Immutable safeguarding audit trail (coach app) |

All tables have `environment` column for row isolation.

---

## Common Tasks

### Add a new enquiry route (taster vs Academy logic)
1. Update age rules in `src/lib/business/age.ts` (if needed)
2. Update routing logic in `src/lib/business/enquiry.ts`
3. Add tests in `tests/unit/business.test.ts`
4. New email template? Add to `src/lib/email/templates/` and seed in `db/seed.sql`

### Add a new admin endpoint
1. Create handler in `src/api/admin/[name].ts`
2. Add route to router in `src/api/router.ts`
3. Wrap with `adminAuth()` middleware
4. Add tests in `tests/unit/admin.test.ts`

### Run a database migration
1. Create SQL file in `db/migrations/000X_description.sql`
2. Test locally: `wrangler d1 execute egac --local --file=db/migrations/000X_*.sql`
3. Commit to git
4. On production: run manually via `wrangler d1 execute egac --file=db/migrations/000X_*.sql`

### Test an email template
1. Update template in `src/lib/email/templates/[name].ts`
2. Use admin portal "Test Send" → emails `ADMIN_EMAIL`
3. Or add test in `tests/unit/email.test.ts` for rendering

---

## Testing Strategy

231 tests across 8 files — **no E2E**, pure unit + integration:

- **business.test.ts** — age rules, routing, booking validation (pure logic, no I/O)
- **repositories.test.ts** — D1 CRUD (Miniflare SQLite)
- **api.test.ts** — handler logic (mocked D1/KV/Resend)
- **admin.test.ts** — admin routes + auth
- **cron.test.ts** — scheduled job idempotency + logic
- **email.test.ts** — template rendering + variable substitution
- **security.test.ts** — error handling, health checks, rate limiting
- **db.test.ts** — client helpers, config, environment isolation

**Testing patterns**:
- Mock D1 via Miniflare: `const db = getDb(env)` in handlers
- Mock Resend: `vi.spyOn(resend, 'emails.send')` then check `.toHaveBeenCalledWith(...)`
- For business logic: no mocks, just assert return values
- For repositories: use real Miniflare SQLite instance

**Run a single test**:
```bash
npm test -- business.test  # "business" substring match
npm test -- age.test.ts    # exact filename
```

---

## Cron Jobs

Four scheduled jobs configured as native **Cloudflare Cron Triggers** via `wrangler-cron.toml`:

| Schedule | Job | Handler | Purpose |
|---|---|---|---|
| `0 9 * * *` | Daily 09:00 UTC | `runExpireInvites` | Mark invites older than 14 days as expired |
| `*/30 * * * *` | Every 30 min | `runRetryInvites` | Retry pending invite sends (idempotent) |
| `0 18 * * 2` | Tue 18:00 UTC | `runSendReminders` | Send session reminders (~7 days before) |
| `0 9 1 * *` | 1st of month 09:00 UTC | `runAcademyRollover` | Roll over unplaced waitlist, close season |

**Setup:**
- Core logic: `src/api/cron/*.ts` (exports `run*` functions, called by both HTTP and scheduled handlers)
- Scheduler dispatcher: `src/api/cron-scheduler.ts` (routes cron events to handlers)
- Scheduled worker: `src/workers/scheduled.ts` (Cloudflare Cron Trigger entry point)
- Config: `wrangler-cron.toml` (defines triggers)

All handlers are **idempotent by design** — safe to run multiple times. Database operations are protected by `environment` column isolation.

---

## Deployment

### Cloudflare Pages (automatic)
- Push to `main` branch
- GitHub Actions CI runs: tests, lint, build
- Cloudflare Pages deploys automatically
- Handles all HTTP requests (enquiries, bookings, admin portal, etc.)

### Scheduled Worker (manual — first time only)
```bash
# Deploy the cron trigger worker to handle scheduled events
wrangler deploy --config wrangler-cron.toml

# Set secrets (one-time)
wrangler secret put RESEND_API_KEY --config wrangler-cron.toml
wrangler secret put ADMIN_TOKEN --config wrangler-cron.toml
```

After first deploy, cron triggers run automatically on schedule. No further deployment needed unless you modify `src/workers/scheduled.ts` or `wrangler-cron.toml`.

### Coach app (manual)
```bash
wrangler deploy --config wrangler-coach.toml
```
Then configure Cloudflare Access policy on the worker's subdomain (Zero Trust → Applications → Self-hosted).

### Database migrations (manual)
```bash
wrangler d1 execute egac --file=db/migrations/000X_*.sql
```
Always test locally first, then run on production.

---

## Debugging Tips

### Check logs
```bash
wrangler tail         # Stream live logs from production
npm run dev           # Dev server logs printed to terminal
```

### Inspect local D1
```bash
# List tables
wrangler d1 execute egac --local --command "SELECT name FROM sqlite_master WHERE type='table';"

# Query data
wrangler d1 execute egac --local --command "SELECT * FROM enquiries LIMIT 5;"
```

### Rate limiting issues
- KV keys: `ratelimit:{ip}:{minute}` (70-second TTL)
- Test endpoint: `GET /api/health` (rate-limited)
- Clear manually in Cloudflare dashboard or wait for TTL

### Admin auth issues
- Cookie name: `egac_admin_token`
- Stored in browser (httpOnly, secure)
- Validated on page load in layouts
- Clear in browser DevTools if stuck

---

## Important Files

- **`README.md`** — Project overview, stack, environments, usage
- **`docs/architecture.md`** — Full component map, data flows, security model
- **`wrangler.toml`** — Cloudflare config (D1 ID, KV namespace, vars)
- **`package.json`** — Scripts (dev, build, test, lint, migrate)
- **`tsconfig.json`** — TypeScript config (strict mode, Astro resolver)
- **`.eslintrc.cjs`** — Linting rules (TypeScript + Astro)
- **`DESIGN.md`** — Current task: audit egac-website design system and apply to public pages

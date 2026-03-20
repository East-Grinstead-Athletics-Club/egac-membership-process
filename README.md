# EGAC Platform

**East Grinstead Athletics Club** — bespoke club management platform

[![Tests](https://img.shields.io/badge/tests-231%20passing-brightgreen)](tests/)
[![Stack](https://img.shields.io/badge/stack-Astro%20%2B%20Cloudflare-orange)](https://astro.build)
[![Cost](https://img.shields.io/badge/infra%20cost-%C2%A30%2Fmonth-blue)](docs/architecture.md)

---

## What it does

Manages the full athlete journey for a junior athletics club:

- **Enquiry form** — parents register interest; automatically routed to taster booking or Academy waitlist based on child's age (UK Athletics 31 Aug rule)
- **Taster booking** — invite-token booking page with live capacity; confirmation with Google Calendar link
- **Academy waitlist** — U11 programme management with accept/decline flow and season rollover
- **Membership** — OTP-gated form after first attended session; creates athlete record
- **Admin portal** — enquiry management, booking calendar, attendance recording, email templates, config
- **Coach app** — mobile session register with safeguarding attendance log (Cloudflare Access auth)
- **Automated emails** — booking invites, confirmations, reminders, Academy notices, membership links

---

## Stack

| Layer | Technology |
|---|---|
| Framework | [Astro](https://astro.build) (SSR) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers (via Astro adapter) |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Email | [Resend](https://resend.com) |
| Tests | Vitest + Miniflare |
| Coach app auth | Cloudflare Access (Zero Trust) |

**Infrastructure cost: £0/month** at expected club usage. Runs entirely within Cloudflare's free tier.

---

## Architecture

```
Parent/Coach browser
        │
        ▼
Cloudflare Pages (Astro SSR)
  ├── Public pages: /, /book/[token], /academy/respond/[token], /join
  └── Admin pages: /admin/*
        │
        ▼
Cloudflare Workers (/api/* catch-all)
  ├── Public:  POST /api/enquiry, POST /api/booking, POST /api/academy/respond
  ├── Cron:    /api/cron/* (CRON_SECRET auth)
  └── Admin:   /api/admin/* (ADMIN_TOKEN auth)
        │
        ├──▶ D1 (SQLite) — all persistent data
        ├──▶ KV — config cache + rate limiting
        └──▶ Resend — all outbound email

Standalone:
  Coach App Worker ←── Cloudflare Access ←── Coach browser
        └──▶ D1 (shared database)
```

See [`docs/architecture.md`](docs/architecture.md) for full component map, data flow diagrams, and security model.

---

## Environment Variables

Set all secrets via `wrangler secret put <name>`. Never commit to source control.

| Variable | Required | Purpose |
|---|---|---|
| `APP_ENV` | Yes | `development` / `staging` / `production` |
| `RESEND_API_KEY` | Yes | Resend API key |
| `ADMIN_TOKEN` | Yes | Admin portal bearer token |
| `ADMIN_EMAIL` | Yes | Admin notification + template test sends |
| `EMAIL_FROM` | Yes | Sending address (verified Resend domain) |
| `CRON_SECRET` | Yes | Protects cron endpoints |

`EMAIL_FROM` and `APP_ENV` are set as `[vars]` in `wrangler.toml`. All others via `wrangler secret put`.

---

## Local Development

```bash
# Install dependencies
npm install

# Run migrations against local D1
wrangler d1 execute egac --local --file=db/migrations/0001_initial_schema.sql
wrangler d1 execute egac --local --file=db/migrations/0002_membership_forms.sql
wrangler d1 execute egac --local --file=db/migrations/0003_update_academy_waitlist_template.sql
wrangler d1 execute egac --local --file=db/migrations/0004_coach_app.sql
wrangler d1 execute egac --local --file=db/seed.sql

# Start dev server
wrangler dev

# Run tests
npm test

# Lint + format check
npm run lint
npm run format:check
```

---

## Deployment

### Main platform (Cloudflare Pages)

Push to `main` branch. GitHub Actions CI runs tests, lint, and build. Cloudflare Pages deploys automatically on push.

```bash
# Run migrations against production D1
wrangler d1 execute egac --file=db/migrations/0001_initial_schema.sql
# ... repeat for each migration

# Deploy is automatic via GitHub → Cloudflare Pages integration
```

### Coach app (standalone Worker)

```bash
# Deploy the coach Worker separately
wrangler deploy --config wrangler-coach.toml

# Then set up Cloudflare Access policy on the coach subdomain
# Zero Trust → Access → Applications → Self-hosted
# Add coach email addresses to the policy
```

---

## Database Migrations

| File | Purpose |
|---|---|
| `0001_initial_schema.sql` | Core tables: enquiries, invites, bookings, age_groups, academy, email_templates, membership_otps |
| `0002_membership_forms.sql` | Membership form submissions |
| `0003_update_academy_waitlist_template.sql` | Email template content update |
| `0004_coach_app.sql` | Adds `checked_in_at` to bookings, creates `athletes` and `attendance_log` tables |

---

## Project Structure

```
src/
├── api/                    # API handlers (Workers)
│   ├── admin/              # Admin API endpoints
│   ├── cron/               # Scheduled job handlers
│   ├── router.ts           # Single entry point + cron dispatcher
│   └── helpers.ts          # Response builders, auth helpers
├── lib/
│   ├── auth/               # Admin authentication
│   ├── business/           # Pure business logic (age rules, routing, validation)
│   ├── db/                 # D1 client, schema types
│   ├── email/              # Resend client + template senders
│   ├── errors.ts           # Error classes + handleApiError
│   ├── repositories/       # D1 CRUD functions
│   └── config.ts           # KV-backed system config
├── layouts/                # Astro layouts (Base, AdminBase)
├── middleware/             # Security headers + rate limiting
├── pages/                  # Astro SSR pages
│   ├── admin/              # Admin portal
│   ├── api/[...path].ts    # API catch-all → router
│   ├── book/[token].astro  # Booking page
│   └── index.astro         # Public enquiry form
└── workers/
    └── coach-app.js        # Standalone coach register Worker
db/
├── migrations/             # SQL migration files (run in order)
└── seed.sql                # Age groups + email templates
docs/
├── architecture.md         # Full system architecture
├── saas-extension.md       # Multi-club SaaS roadmap
└── security/audit.md       # Security audit findings
tests/
└── unit/                   # 231 tests across 8 files
```

---

## Tests

```bash
npm test
```

**231 tests across 8 files** — business logic, repositories (against Miniflare D1), API handlers, email service, cron jobs, admin routes, security/error handling.

```
tests/unit/business.test.ts     57 tests  — age rules, routing, booking validation
tests/unit/repositories.test.ts 26 tests  — D1 CRUD via Miniflare
tests/unit/api.test.ts          30 tests  — public API handlers
tests/unit/admin.test.ts        24 tests  — admin auth + enquiry management
tests/unit/cron.test.ts         21 tests  — cron job idempotency + logic
tests/unit/email.test.ts        18 tests  — Resend client + template rendering
tests/unit/security.test.ts     21 tests  — error classes, health checks, rate limiting
tests/unit/db.test.ts           34 tests  — client helpers, config, environment isolation
```

---

## Further Reading

- [Architecture](docs/architecture.md) — component map, data flows, security model
- [SaaS Extension](docs/saas-extension.md) — multi-club deployment guide
- [Security Audit](docs/security/audit.md) — SQL injection, XSS, auth, rate limiting review

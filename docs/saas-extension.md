# EGAC Platform — SaaS Extension Roadmap

*How to extend this platform to serve multiple athletics clubs*

---

## Overview

The EGAC platform was built for a single club but the architecture supports multi-club operation with relatively small additions. This document describes the path from single-club to SaaS.

---

## Current Architecture (Single Club)

The platform uses `APP_ENV` (`development` / `staging` / `production`) to isolate rows in D1. Every query includes `AND environment = ?`.

For a second club, the simplest approach is **one deployment per club** — each club gets its own Cloudflare Pages project, its own D1 database, and its own set of secrets. No schema changes required.

---

## Option A: One Deployment Per Club (Recommended for < 10 clubs)

Fork the repository, configure the secrets for the new club, and deploy. Each club is completely isolated at the infrastructure level.

**Onboarding a new club:**

1. Fork the repository or create a new Cloudflare Pages project pointing at the same repo with different build settings
2. Create a new D1 database: `wrangler d1 create <club-name>`
3. Run migrations: `wrangler d1 execute <club-name> --file=db/migrations/0001_initial_schema.sql`
4. Run seed: `wrangler d1 execute <club-name> --file=db/seed.sql`
5. Set secrets via `wrangler secret put` for the new project
6. Update `wrangler.toml` with the new D1 and KV IDs
7. Deploy

**Cost per club:** £0/month (each club stays within Cloudflare's free tier at sub-200 enquiries/month)

**Trade-off:** No shared admin across clubs. Each club manages its own portal independently. Code updates need to be applied to each deployment.

---

## Option B: Multi-Tenant Single Deployment (for 10+ clubs)

If managing many clubs, a shared deployment with `club_id` isolation becomes worthwhile.

### Schema changes required

Add a `clubs` table and `club_id` column to all tables:

```sql
-- New table
CREATE TABLE clubs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,   -- used in subdomain routing
  email_from  TEXT NOT NULL,
  site_url    TEXT NOT NULL,
  active      INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL
);

-- Add to every existing table:
ALTER TABLE enquiries      ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE invites        ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE bookings       ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE academy_seasons ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE academy_waitlist ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE age_groups     ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE email_templates ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE membership_otps ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE membership_forms ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE athletes       ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
ALTER TABLE attendance_log ADD COLUMN club_id TEXT NOT NULL DEFAULT 'egac';
```

### Routing strategy

**Recommended: env var per deployment** (`CLUB_ID` set in `wrangler.toml`). Each club still gets its own Pages project, but they share the same D1 database. Simpler than subdomain routing, no DNS complexity.

```toml
# wrangler.toml for Club B
[vars]
APP_ENV = "production"
CLUB_ID = "eastbourne-ac"
```

All queries then include `AND club_id = ? AND environment = ?`.

**Alternative: subdomain routing** — `cac.platform.com` routes to club `cac`. Requires a custom domain, Cloudflare Workers routing rules, and more DNS configuration. Not recommended unless you need vanity URLs.

### KV namespace isolation

Per-club config using a key prefix:

```
club:{club_id}:config   →  SystemConfig for that club
```

The `getSystemConfig` function would accept a `clubId` parameter and use `club:${clubId}:config` as the KV key.

### Email isolation

Each club needs its own verified sending domain in Resend. The `EMAIL_FROM` env var handles this per-deployment.

---

## Option C: Hybrid (Current Recommended Path)

For the near term, while the platform matures:

1. Run each club as **Option A** (separate deployment)
2. Store all club configs in a shared Notion/spreadsheet for the operator
3. When you have 5+ clubs, migrate to **Option B** with the schema additions above

This avoids premature complexity while keeping the option open.

---

## Next Steps for This Codebase

### Immediate post-launch priorities

**1. Coach app Step B — membership → athletes**

When a taster completes the membership form, automatically create an `athletes` record. The coach app then shows them as a member on the register from the next session.

Add a trigger in the membership form submission handler (`src/api/memberships.ts` or equivalent) that:
- Parses the `payload_json` from `membership_forms`
- Creates an `athletes` row with the extracted name, DOB, emergency contacts, medical info
- Links back to the `membership_form_id`

**2. Pastoral care cron**

Weekly cron job that:
- Finds athletes with `last_attended_at` older than 21 days who had attended in the previous 60 days
- Sets `flagged_absent = 1` and `flagged_absent_at = now()`
- Sends the admin a digest: "N athletes haven't attended in 3+ weeks"

This turns attendance data into a pastoral care signal automatically.

**3. Admin cookie hardening**

Move the `egac_admin_token` cookie from JavaScript `document.cookie` (set on login) to a proper `Set-Cookie` response header with `Secure; HttpOnly; SameSite=Strict` attributes. This prevents XSS from accessing the session cookie.

**4. Availability caching**

The booking page makes N D1 queries (one per available date × age group) on every load. For high traffic, add a short-lived KV cache for availability data with a 2-minute TTL.

**5. Weekly stats email**

Cron job (Monday 09:00) that emails the admin a summary: enquiries this week, sessions attended, Academy pipeline status. Uses the existing email template system.

**6. UK Athletics age boundary update**

UK Athletics is updating age group boundaries (U11→U12, etc.) in the near future. Because all age groups are stored in D1 and admin-editable via the settings page, this is a data change only — no code changes required. Update the `age_groups` table via the admin portal when the new boundaries are confirmed.

---

## Cost Model for Multi-Club

At 10 clubs, each with sub-200 enquiries/month:

| Option | Infrastructure | Per-club cost |
|---|---|---|
| Option A (separate deployments) | Each club on free tier | £0/month |
| Option B (shared D1, >5M rows/day) | D1 paid tier kicks in | ~$5/month total |

The platform is designed to stay within the free tier indefinitely for a club of EGAC's size. A regional network of 10 clubs would still cost less than £10/month combined.

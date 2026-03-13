# CI Secrets & Environment Variables

All secrets are stored in GitHub → Repository → Settings → Secrets and variables → Actions.
**Never put secrets in source code or wrangler.toml.**

---

## Required secrets

### Cloudflare

| Secret | Description | Where to find it |
|--------|-------------|-----------------|
| `CF_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare dashboard → right sidebar on any zone page |
| `CLOUDFLARE_API_TOKEN` | API token for deployments | Cloudflare dashboard → My Profile → API Tokens → Create Token → use "Edit Cloudflare Workers" template, add D1 and Pages permissions |

### Application

| Secret | Description | Where to find it |
|--------|-------------|-----------------|
| `RESEND_API_KEY` | Resend email API key | resend.com → API Keys → Create API Key |
| `ADMIN_TOKEN` | Long random string for admin portal access | Generate with: `openssl rand -hex 32` |
| `CRON_SECRET` | Protects cron endpoints from unauthorised calls | Generate with: `openssl rand -hex 32` |

### URLs & monitoring

| Secret | Description | Example |
|--------|-------------|---------|
| `PAGES_SITE_URL` | Production Cloudflare Pages URL | `https://egac.pages.dev` |
| `STAGING_SITE_URL` | Staging Cloudflare Pages URL | `https://egac-staging.pages.dev` |
| `MONITORING_MENTION` | GitHub user/team to mention on deploy failure | `@egac-web/admins` |

---

## Worker secrets (set via wrangler, not GitHub)

These are set directly on the Cloudflare Worker and are not GitHub secrets.
Run these once per environment:

```bash
# Production
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_TOKEN
wrangler secret put CRON_SECRET
wrangler secret put ADMIN_EMAIL

# Staging
wrangler secret put RESEND_API_KEY --env staging
wrangler secret put ADMIN_TOKEN --env staging
wrangler secret put CRON_SECRET --env staging
wrangler secret put ADMIN_EMAIL --env staging
```

---

## Local development (.dev.vars)

Create a `.dev.vars` file in the project root for local `wrangler dev`.
This file is in `.gitignore` and must never be committed.

```
RESEND_API_KEY=your_resend_key_here
ADMIN_TOKEN=dev
CRON_SECRET=dev_cron_secret
ADMIN_EMAIL=you@example.com
APP_ENV=development
```

Note: `ADMIN_TOKEN=dev` is accepted by the auth middleware in development
mode only. It is rejected in staging and production.

---

## Rotation

Rotate secrets every 90 days or immediately if you suspect a leak:

1. Generate a new value (`openssl rand -hex 32`)
2. Update in GitHub Secrets
3. Update via `wrangler secret put` for the Worker
4. Test a deploy to confirm the new secret works
5. Document the rotation date in your team notes

---

## Cloudflare API Token permissions

When creating the `CLOUDFLARE_API_TOKEN`, it needs these permissions:

- **Account** → Cloudflare Pages → Edit
- **Account** → D1 → Edit  
- **Account** → Workers Scripts → Edit
- **Zone** → (none required for Pages deployments)

Scope it to your specific account, not all accounts.

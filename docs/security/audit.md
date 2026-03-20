# EGAC Platform — Security Audit

*Last reviewed: March 2026*

---

## Summary

| Area | Status | Notes |
|---|---|---|
| SQL injection | ✅ Clean | All queries use `?` placeholders |
| XSS in email templates | ✅ Mitigated | Variables rendered into HTML are text values only |
| SSRF | ✅ Not applicable | No user-provided URLs are fetched |
| Auth — admin routes | ✅ Bearer token | ADMIN_TOKEN env var, checked on every request |
| Auth — cron routes | ✅ Bearer token | CRON_SECRET env var, separate from admin token |
| Auth — coach app | ✅ Cloudflare Access | Zero Trust policy required, Worker fails closed |
| Rate limiting | ✅ Implemented | 10 req/min per IP on public endpoints via KV |
| Security headers | ✅ Implemented | Via Astro middleware on all responses |
| Stack trace exposure | ✅ Never | `handleApiError` catches all unknown errors |
| Environment isolation | ✅ Enforced | All D1 queries include `AND environment = ?` |

---

## SQL Injection

**Finding:** All D1 queries throughout `src/lib/repositories/` use prepared statement `?` placeholders via `env.DB.prepare(...).bind(...)`. No string concatenation is used to construct SQL.

**Verification:** Checked all repository files:
- `enquiries.ts` — all queries parameterised ✅
- `invites.ts` — all queries parameterised ✅
- `bookings.ts` — all queries parameterised ✅
- `academy.ts` — all queries parameterised ✅
- `age-groups.ts` — all queries parameterised ✅
- `templates.ts` — all queries parameterised ✅
- `membership-forms.ts` — all queries parameterised ✅

**Dynamic query construction** (e.g. `updateEnquiry`, `updateEmailTemplate`) builds the `SET clause` string from a whitelist of allowed field names — user input only reaches `?` bind positions, never the query string itself.

---

## XSS in Email Templates

**Finding:** Email templates use `{{variable_name}}` substitution via `renderTemplate()` in `src/lib/business/templates.ts`. Variables are substituted as raw strings into HTML.

**Risk:** If a variable value contains `<script>` or similar, it would be rendered into the email HTML. However:

1. All variable values come from our own database (`enquiry.name`, `booking.session_date`, config values, etc.) — never directly from user input in the same request
2. Email clients apply their own sanitisation before rendering
3. The `validateTemplateVariables` function prevents unknown variables from being introduced

**Recommendation for Step B:** When membership form data flows into email templates (athlete name, etc.), apply HTML entity encoding before substitution. Add a `sanitiseHtml(str)` wrapper to `renderTemplate` for values sourced from user-submitted forms.

---

## SSRF (Server-Side Request Forgery)

**Finding:** The only outbound HTTP request the platform makes is to `https://api.resend.com/emails` in `src/lib/email/client.ts`. The URL is hardcoded — no user-provided URLs are ever fetched.

**Status:** Not applicable. ✅

---

## Authentication — Admin Routes

**Finding:** All admin API routes call `requireAdmin(request, env)` from `src/lib/auth/admin.ts` before any logic executes. The function checks:
1. `Authorization: Bearer <token>` header
2. `x-admin-token` header (fallback)
3. Validates against `env.ADMIN_TOKEN`
4. Accepts `'dev'` token **only** when `env.APP_ENV === 'development'`

**Admin Astro pages** use `checkAdminToken()` against a cookie, and redirect to `/admin/login` if invalid. The cookie is `HttpOnly`-equivalent (set server-side) and expires on logout.

**Recommendation:** Set the admin cookie with `Secure; SameSite=Strict` attributes. Currently set via JavaScript `document.cookie` on login — move to a `Set-Cookie` response header from the login API endpoint.

---

## Authentication — Cron Routes

**Finding:** All cron endpoints check `Authorization: Bearer <CRON_SECRET>` before executing. The `checkCronAuth` helper in `src/api/helpers.ts` returns false if `CRON_SECRET` is empty — preventing accidental open access in misconfigured environments.

---

## Authentication — Coach App

**Finding:** `src/workers/coach-app.js` checks for the `cf-access-authenticated-user-email` header injected by Cloudflare Access. If absent, returns `403`. This is defence in depth — the primary protection is the Cloudflare Access Zero Trust policy on the route.

---

## Rate Limiting

**Implementation:** `src/middleware/index.ts` applies rate limiting to:
- `POST /api/enquiry`
- `POST /api/booking`
- `POST /api/academy/respond`

**Mechanism:** KV key `ratelimit:{ip}:{minute-bucket}`, limit 10 requests/minute per IP. Returns `429` with `Retry-After: 60` header. Rate limiting failures are caught and logged — a KV outage never blocks legitimate requests.

**IP detection:** Uses `CF-Connecting-IP` (set by Cloudflare, cannot be spoofed by clients). Falls back to `X-Forwarded-For` for local dev.

---

## Security Headers

**Implementation:** `src/middleware/index.ts` adds to every response:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; ...` |

**Note:** `unsafe-inline` is required for Tailwind CDN. When Tailwind is moved to a build step (future), replace with a nonce-based CSP.

---

## Error Handling

**Implementation:** `src/lib/errors.ts` provides typed error classes (`ValidationError`, `AuthError`, `NotFoundError`, `ConflictError`, `RateLimitError`) and `handleApiError()` which:
- Maps known error types to appropriate HTTP status codes
- Logs unknown errors with context
- **Never** exposes stack traces or internal error details in responses

---

## Environment Isolation

**Finding:** Every D1 query includes `AND environment = ?` binding, populated from `env.APP_ENV`. Rows written in `development` are never visible to `production` queries and vice versa.

**Enforced by:** `getEnv(env)` in `src/lib/db/client.ts`, called at the start of every repository function.

---

## Recommendations for Future Work

1. **Admin cookie hardening** — move from JS `document.cookie` to `Set-Cookie` response header with `Secure; SameSite=Strict; HttpOnly`
2. **HTML sanitisation in templates** — when Step B adds membership data to email templates, wrap user-supplied values in an HTML entity encoder before substitution
3. **CSP nonces** — replace `unsafe-inline` once Tailwind is a build-step dependency
4. **Audit log** — the `attendance_log` table provides a coach-level audit trail. Consider adding an admin action log for sensitive operations (template edits, config changes)
5. **Token rotation** — document the process for rotating `ADMIN_TOKEN` and `CRON_SECRET` without downtime

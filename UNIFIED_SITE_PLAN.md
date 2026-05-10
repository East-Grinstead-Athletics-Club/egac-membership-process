# EGAC Platform — Unified Site Architecture Plan

**Status:** Step 1 in progress  
**Date:** 2026-05-10  
**Purpose:** Full architectural roadmap for merging egac-website and egac-membership into one seamless site at `eastgrinsteadac.co.uk`

---

## Overview

The EGAC platform currently consists of two separate Cloudflare Pages projects:

- **egac-website** (`eastgrinsteadac.co.uk`) — public club website (news, events, training info)
- **egac-membership** (`egac-membership.pages.dev`) — membership process platform (enquiries, bookings, Academy, admin portal)

The goal is to make these appear as **one seamless site** at `eastgrinsteadac.co.uk`, with consistent design and no visible transition between the two codebases. Both projects remain independently deployed and maintained — the router is the only shared layer.

---

## Full Architecture Vision

A single Cloudflare Worker sits in front of both Pages projects and routes requests based on path. Visitors always stay on `eastgrinsteadac.co.uk`.

```
eastgrinsteadac.co.uk
        │
        ▼
┌─────────────────────────────┐
│   Cloudflare Router Worker  │  (Workers Route on eastgrinsteadac.co.uk/*)
│   wrangler-router.toml      │
└────────────┬────────────────┘
             │
       ┌─────┴──────┐
       │            │
       ▼            ▼
 egac-website   egac-membership
   (Pages)         (Pages)
```

### Routing rules

| Path pattern | Routes to | Notes |
|---|---|---|
| `/` | egac-website | Home page |
| `/events*` | egac-website | Events listing and detail |
| `/training*` | egac-website | Training information |
| `/records*` | egac-website | Results and records |
| `/about*` | egac-website | About the club |
| `/news*` | egac-website | News articles |
| `/join*` | egac-membership | Enquiry / registration form |
| `/book/*` | egac-membership | Booking token pages |
| `/academy/*` | egac-membership | Academy waitlist responses |
| `/admin/*` | egac-membership | Admin portal |
| `/api/*` | egac-membership | All API routes |

### Router Worker (not yet built)

- New config: `wrangler-router.toml` (in egac-membership repo or a dedicated repo)
- New worker: `src/workers/router.ts`
- Uses `fetch()` to proxy requests to the appropriate Pages project origin
- Preserves the original URL — no redirects, browser stays on `eastgrinsteadac.co.uk/join` etc.
- Configured as a **Workers Route** on the `eastgrinsteadac.co.uk` zone in Cloudflare dashboard

### DNS change (when router is ready)

- Currently: `eastgrinsteadac.co.uk` points directly to egac-website Pages project
- Change to: `eastgrinsteadac.co.uk` points to the router Worker
- egac-website becomes an internal origin (`egac-website.pages.dev`) — not publicly exposed
- egac-membership becomes an internal origin (`egac-membership.pages.dev`) — not publicly exposed

---

## Phase Plan

### ✅ Step 1 (NOW) — Design alignment

Apply the egac-website design system to all public-facing pages of egac-membership so they are visually indistinguishable from the main site.

**Why now:** When the router is wired up, egac-membership pages will appear inline on `eastgrinsteadac.co.uk`. Doing the design work now means the router step (Step 2) is purely infrastructure — no visual work needed at that point.

**Scope — public pages only:**
- `src/layouts/PublicLayout.astro` — Material Symbols font, dark mode script aligned to system preference, `<slot name="head">`, remove `max-w-2xl` from `<main>`
- `src/components/layout/Nav.astro` — switch inline SVG icons to Material Symbols font (dark mode toggle + hamburger)
- `src/components/layout/Footer.astro` — add social icons block (placeholder hrefs)
- `src/pages/index.astro` — add full-width hero section above the form
- `src/pages/join.astro` — add hero section
- `src/pages/book/[token].astro` — add hero section
- `src/pages/academy/respond/[token].astro` — add hero section

**Out of scope:** Admin pages (`/admin/*`), `Base.astro`, `AdminBase.astro`, coach app, `tailwind.config.cjs` (already identical)

---

### ⬜ Step 2 (FUTURE) — Router Worker

Build and deploy the Cloudflare Worker that proxies requests to the correct Pages project based on path.

**Tasks:**
1. Create `src/workers/router.ts` with path-matching logic
2. Create `wrangler-router.toml` with Workers Route configuration
3. Set `workers_dev = false` (router should only run on the custom domain, not `.workers.dev`)
4. Test locally with `wrangler dev --config wrangler-router.toml`
5. Deploy: `wrangler deploy --config wrangler-router.toml`
6. Verify routes via Cloudflare dashboard (Workers & Pages → Routes)

**Prerequisites:** Step 1 complete.

---

### ⬜ Step 3 (FUTURE) — DNS cutover

Point `eastgrinsteadac.co.uk` at the router Worker. Both Pages projects become internal origins.

**Tasks:**
1. Confirm router Worker is deployed and tested
2. Update DNS: change `eastgrinsteadac.co.uk` to route through the Worker (Cloudflare manages this via Workers Route — no DNS record change may be needed if using zone routes)
3. Verify all paths resolve correctly:
   - `eastgrinsteadac.co.uk/` → egac-website home
   - `eastgrinsteadac.co.uk/join` → membership enquiry form
   - `eastgrinsteadac.co.uk/book/[token]` → booking page
   - `eastgrinsteadac.co.uk/admin` → admin portal (auth required)
4. Check SSL certificates are valid on the custom domain
5. Monitor error rates for 24 hours post-cutover

**Prerequisites:** Step 2 complete, DNS access confirmed.

---

### ⬜ Step 4 (FUTURE) — Nav link unification

Update egac-membership `Nav.astro` nav links to match the full egac-website nav.

**Change:**  
Current links: `[Join, Contact]`  
New links: `[Home, Events, Training, Records, About, Join]` (matching egac-website exactly)

The `Register` CTA button in the nav becomes `Join Us` linking to `/join`.

**Why deferred:** These links only make sense once the membership pages are under `eastgrinsteadac.co.uk` and the full site nav is navigable. Before the DNS cutover, links like `/events` would 404.

**Prerequisites:** Step 3 complete.

---

### ⬜ Step 5 (FUTURE) — Volunteers page decision

The volunteers page (`/volunteer`) exists on egac-website and was explicitly excluded from this plan. A decision is needed on whether to:
- Include it in the router routing table
- Keep it isolated / remove it from the nav

**Prerequisites:** Steps 1–4 complete.

---

## Hero Pattern Reference

Used on all inner pages of egac-website. To be applied to all egac-membership public pages in Step 1.

```html
<section class="pt-32 pb-16 bg-primary text-white overflow-hidden relative">
  <div class="absolute top-0 right-0 w-1/3 h-full bg-primary-container opacity-20 -skew-x-12 translate-x-1/2" aria-hidden="true"></div>
  <div class="max-w-7xl mx-auto px-6 relative z-10">
    <h1 class="text-5xl md:text-6xl font-headline font-bold mb-6">Page Title</h1>
    <p class="text-xl text-on-primary-container max-w-2xl leading-relaxed">Page subtitle.</p>
  </div>
</section>
```

Note: `pt-32` clears the fixed nav. Form/content below hero uses `max-w-2xl mx-auto px-6 py-12`.

---

## Key Files Reference

| File | Project | Purpose |
|---|---|---|
| `tailwind.config.cjs` | both | Identical MD3 token palette — do not change |
| `egac-website-styling.md` | egac-website | Full design token and component reference |
| `src/layouts/BaseLayout.astro` | egac-website | Reference layout |
| `src/components/layout/Nav.astro` | egac-website | Reference nav (canonical) |
| `src/components/layout/Footer.astro` | egac-website | Reference footer (canonical) |
| `src/layouts/PublicLayout.astro` | egac-membership | Base layout for all public pages |
| `src/components/layout/Nav.astro` | egac-membership | Nav to be updated in Step 1 |
| `src/components/layout/Footer.astro` | egac-membership | Footer to be updated in Step 1 |
| `PROGRAM_OF_WORKS.md` | egac-membership | Deployment phase plan (Phases 1–5) |

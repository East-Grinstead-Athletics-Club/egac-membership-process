# EGAC Platform — Program of Works
## Deployment via Claude Code Prompts

**Version:** 1.0  
**Status:** Ready for execution  
**Target:** Cloudflare Pages + Workers (eastgrinsteadac.co.uk)  
**Timeline:** ~6 hours elapsed time (3–4 hours active work)

---

## Overview

This document breaks the EGAC platform deployment into **5 executable phases**, each with a self-contained Claude Code prompt. Each phase includes success criteria and handoff requirements.

**How to use:**
1. Start with **Phase 1** — copy the prompt into Claude Code
2. When phase completes, verify success criteria
3. Move to next phase
4. If anything fails, capture error output and re-run with context

**Exit criteria:** All 5 phases complete + smoke test passes → platform is live

---

## Phase 1: Preparation & Secrets Management

### Objective
Set wrangler secrets and verify local environment is ready for deployment.

### Duration
5–10 minutes

### Prompt for Claude Code

```
You are helping deploy the EGAC (East Grinstead Athletics Club) platform to 
Cloudflare Pages + Workers. This is Phase 1: Preparation & Secrets Management.

Task: Set up all required secrets for production deployment.

Current context:
- Project: /home/eddie/projects/egac/membership-process
- This is a Cloudflare Pages + Workers project (Astro framework)
- All source code is ready (231 tests passing, zero lint errors)
- No secrets are currently set in Cloudflare

Actions required:
1. Verify wrangler is installed and authenticated:
   - Run: wrangler whoami
   - Confirm output shows Cloudflare account ID

2. Generate three cryptographically secure tokens:
   - ADMIN_TOKEN: Run `openssl rand -hex 32` → save to secure location
   - CRON_SECRET: Run `openssl rand -hex 32` → save to secure location
   - RESEND_API_KEY: Already in your Resend account dashboard (look for "API Keys")

3. Set secrets in production environment:
   - wrangler secret put ADMIN_TOKEN --env production
     (Paste the ADMIN_TOKEN from step 2)
   
   - wrangler secret put CRON_SECRET --env production
     (Paste the CRON_SECRET from step 2)
   
   - wrangler secret put RESEND_API_KEY --env production
     (Paste your Resend API key)

4. Verify secrets are set (without revealing values):
   - Run: wrangler secret list
   - Confirm all three secrets appear in the output

5. Verify local environment can build:
   - Run: npm install
   - Run: npm run build
   - Confirm dist/ directory is created with no errors

6. Verify tests still pass:
   - Run: npm test
   - Confirm 231 tests pass

Success criteria:
- ✅ wrangler whoami shows account ID
- ✅ All three secrets set and listed
- ✅ npm run build succeeds
- ✅ 231 tests pass
- ✅ No errors in stdout/stderr

Report:
- List all three secret names (not values)
- Confirm build output size
- Confirm test count: 231/231
- Any warnings or issues encountered?
```

### Success Verification
After Claude completes Phase 1, verify:
```bash
wrangler secret list
# Should show: ADMIN_TOKEN, CRON_SECRET, RESEND_API_KEY

npm test 2>&1 | grep -E "passing|failing"
# Should show: 231 passing
```

### Handoff to Phase 2
- ✅ Secrets are set
- ✅ Build succeeds
- ✅ Tests pass
- Proceed to Phase 2: Staging Deployment & Testing

---

## Phase 2: Staging Deployment & Testing

### Objective
Deploy to staging environment and run comprehensive manual tests to verify all features work end-to-end.

### Duration
2–3 hours

### Prompt for Claude Code

```
You are helping deploy the EGAC platform. This is Phase 2: Staging Deployment & Testing.

Prerequisites (from Phase 1):
- ✅ All secrets set (ADMIN_TOKEN, CRON_SECRET, RESEND_API_KEY)
- ✅ Local build succeeds
- ✅ 231 tests pass

Task: Deploy to staging environment and verify all critical user journeys work.

Actions:

1. Create staging branch and push:
   - Run: git checkout -b staging-deploy-test
   - Run: git push -u origin staging-deploy-test
   - Verify GitHub Actions CI pipeline runs (check GitHub Actions tab)
   - Wait for: lint, format-check, test, type-check, build to all pass
   - Expected time: 5-10 minutes

2. Verify deployment to staging:
   - After all CI checks pass, Cloudflare Pages should deploy automatically
   - Check Cloudflare Pages dashboard: egac project → Deployments
   - Note the staging preview URL (will look like: https://staging-deploy-test.egac.pages.dev)

3. Test the health endpoint:
   - Run: curl https://staging-deploy-test.egac.pages.dev/api/health
   - Expected response: { "status": "ok", "database": "ok", "cache": "ok", "email": "ok" }
   - If health check fails, stop and investigate D1 connection

4. Manual Testing — Critical User Journeys (30 mins total):

   TEST A: Enquiry for Year 5 child (Academy path)
   - Navigate to: https://staging-deploy-test.egac.pages.dev/
   - Fill enquiry form:
     * Parent name: "Test Parent A"
     * Child name: "Test Child A"
     * Child DOB: 2014-09-15 (age 9, Year 5)
     * Email: your-test-email@example.com
   - Submit form
   - Verify response page says: "Thanks - check your email for a confirmation"
   - Check inbox: Should receive email about Academy waitlist (not taster invite)
   - Verify email contains: "Academy" or "waiting list" (not "book a taster")

   TEST B: Enquiry for Year 4 child (Rejection path)
   - Fill enquiry form again:
     * Parent name: "Test Parent B"
     * Child name: "Test Child B"
     * Child DOB: 2015-09-15 (age 8, Year 4)
     * Email: your-test-email@example.com
   - Submit form
   - Check inbox: Should receive rejection email
   - Verify email contains: "Year 5 upwards" or "not yet old enough"

   TEST C: Enquiry for Year 7 child (Taster path)
   - Fill enquiry form again:
     * Parent name: "Test Parent C"
     * Child name: "Test Child C"
     * Child DOB: 2013-09-15 (age 10, Year 7)
     * Email: your-test-email@example.com
   - Submit form
   - Check inbox: Should receive booking invite email
   - Verify email contains: "Book your session" or "booking_url"
   - Click the booking link in the email

   TEST D: Book a taster session
   - From booking email (Test C), click booking link
   - Page loads: "Book a taster session"
   - Select a Tuesday date
   - Enter child's name, select age group (U14)
   - Submit booking
   - Verify response: "Booking confirmed"
   - Check inbox: Should receive confirmation email
   - Verify confirmation email shows:
     * Date and time of session
     * Training location (should match Settings in admin)
     * Age group label (should be "U14")

   TEST E: Admin portal login
   - Navigate to: https://staging-deploy-test.egac.pages.dev/admin/login
   - Username: "admin" (or any text)
   - Password: Paste your ADMIN_TOKEN from Phase 1
   - Verify: Redirects to /admin/enquiries
   - Verify: Can see the 3 test enquiries created above

   TEST F: Admin settings
   - Navigate to: https://staging-deploy-test.egac.pages.dev/admin/settings
   - Update "Training Location for Tuesday": "Broadfield Stadium"
   - Click Save
   - Verify: Page shows "Settings updated"
   - Verify: Value persists on page reload

5. Verify cron endpoints can be called:
   - Run: curl -X POST https://staging-deploy-test.egac.pages.dev/api/cron/health \
             -H "Authorization: Bearer <CRON_SECRET>"
   - Expected: 200 OK
   - (This endpoint doesn't exist; use expire-invites instead)
   - Run: curl -X POST https://staging-deploy-test.egac.pages.dev/api/cron/expire-invites \
             -H "Authorization: Bearer <CRON_SECRET>"
   - Expected: 200 OK (even if no invites to expire)

6. Lighthouse audit (optional, 10 mins):
   - Open DevTools on public pages (enquiry form, booking page)
   - Run Lighthouse audit (Performance, Accessibility, Best Practices)
   - Note any issues; take screenshots

Success criteria:
- ✅ Health check returns 200 with all services "ok"
- ✅ TEST A: Year 5 enquiry receives Academy email (not taster)
- ✅ TEST B: Year 4 enquiry receives rejection email
- ✅ TEST C: Year 7 enquiry receives booking invite
- ✅ TEST D: Can book session; confirmation email shows correct location + date/time
- ✅ TEST E: Admin login works; can see enquiries
- ✅ TEST F: Settings persist after save
- ✅ Cron endpoint responds to authorization

Report (after all tests):
- List all 5 tests and pass/fail status
- Note any email delays (some email providers delay delivery 1-2 minutes)
- Note any UI inconsistencies or missing design elements
- List Lighthouse scores if available
- Any errors in browser console? (Check DevTools)
- Any issues that block proceeding to Phase 3?
```

### Success Verification
After Claude completes Phase 2:
```bash
# Verify staging deployment is active
# (No bash command needed; check Cloudflare Pages dashboard manually)
```

### Handoff to Phase 3
- ✅ All 6 manual tests pass (enquiry routing, booking, admin, settings)
- ✅ Health check passes
- ✅ No blocking UI/UX issues
- ✅ Emails deliver correctly
- Proceed to Phase 3: Cloudflare Configuration

---

## Phase 3: Cloudflare Configuration

### Objective
Configure Cloudflare services (Access policy for coach app, Cron triggers, custom domain, email verification).

### Duration
20–30 minutes

### Prompt for Claude Code

```
You are helping deploy the EGAC platform. This is Phase 3: Cloudflare Configuration.

Prerequisites (from Phase 2):
- ✅ Staging tests pass
- ✅ Health check passes
- ✅ All secrets set

Task: Configure Cloudflare services for production deployment.

**IMPORTANT:** This phase requires manual Cloudflare dashboard access. 
Claude will provide step-by-step instructions; you execute them manually in the dashboard.

Actions:

1. Configure Cloudflare Access (Coach App Zero Trust)
   
   Cloudflare Dashboard:
   - Go to: Zero Trust → Access → Applications
   - Click: "Add an application"
   - Choose: "Self-hosted"
   - Fill in:
     * Application name: "EGAC Coach App"
     * Subdomain: "coach" (full domain will be coach.eastgrinsteadac.co.uk)
     * Application domain: coach.eastgrinsteadac.co.uk (you'll configure DNS later)
     * Click: Next
   
   - Configure Rules:
     * Session duration: 24 hours (coaches should re-authenticate daily)
     * Click: "Add a policy"
     * Policy name: "Coach Email Domain"
     * Action: Allow
     * Rule type: Email
     * Email: ends with eastgrinsteadac.co.uk
     * Click: Add rule
     * Click: Save application
   
   - Note the Access URL that's displayed (e.g., https://coach.eastgrinsteadac.co.uk)
   - Verify: Coach app is now behind Zero Trust

2. Configure DNS for coach app subdomain

   Your DNS Provider (not Cloudflare dashboard):
   - Add CNAME record:
     * Name: coach
     * Value: egac.pages.dev (Cloudflare Pages domain)
   - Save
   - Wait for DNS to propagate (usually <5 minutes, test with: nslookup coach.eastgrinsteadac.co.uk)

3. Configure Cron Triggers

   Cloudflare Pages Dashboard:
   - Go to: Pages → egac project → Settings → Functions → Cron Triggers
   - Click: "Add Cron Trigger"
   
   Add 4 triggers (one at a time):
   
   Trigger 1: Expire old invites (daily)
   - Cron: 0 9 * * *
   - URL: /api/cron/expire-invites
   - Save
   
   Trigger 2: Retry pending invites (every 30 mins)
   - Cron: */30 * * * *
   - URL: /api/cron/retry-invites
   - Save
   
   Trigger 3: Send booking reminders (Tuesday 18:00 UTC)
   - Cron: 0 18 * * 2
   - URL: /api/cron/send-reminders
   - Save
   
   Trigger 4: Academy season rollover (1st of month)
   - Cron: 0 9 1 * *
   - URL: /api/cron/academy-rollover
   - Save
   
   Verify: All 4 cron triggers appear in the list

4. Configure custom domain

   Cloudflare Pages Dashboard:
   - Go to: Pages → egac project → Settings → Domains
   - Click: "Add custom domain"
   - Enter: eastgrinsteadac.co.uk
   - System will check DNS records (if your registrar uses Cloudflare nameservers, it auto-verifies)
   - If DNS is external (GoDaddy, etc.), you may need to add a CNAME or TXT record
   - Verify: Custom domain shows as "Active"
   - SSL/TLS certificate will auto-provision (usually <5 minutes)

5. Verify email domain in Resend

   Resend Dashboard:
   - Log in: https://resend.com/dashboard
   - Go to: Domains
   - Click: "Add Domain"
   - Enter: updates.eastgrinsteadac.co.uk
   - System provides DKIM, SPF, and DMARC records
   - Add these records to your DNS provider:
     * DKIM record (TXT): Copy exact value from Resend
     * SPF record (TXT): If you have existing SPF, append Resend's SPF
     * DMARC record (TXT): Optional but recommended
   - In Resend, click: "Verify"
   - Wait for verification (usually <5 minutes after DNS propagates)
   - Verify: Domain shows as "Verified" in Resend

6. Test all configurations

   Verify Cron Triggers:
   - In Cloudflare Pages dashboard, you can see "Last Run" timestamps for each trigger
   - (They won't run until their scheduled time, so you may see "Never" initially)

   Verify Coach App Access:
   - Try to access: https://coach.eastgrinsteadac.co.uk (as a coach)
   - Should redirect to Cloudflare Access login
   - Log in with an email that ends with @eastgrinsteadac.co.uk
   - Should grant access to coach app

   Verify Custom Domain:
   - Navigate to: https://eastgrinsteadac.co.uk/
   - Should load the enquiry form
   - Check browser address bar: Should show https (green lock icon)

Success criteria:
- ✅ Cloudflare Access policy created for coach app
- ✅ Coach app subdomain DNS resolves
- ✅ 4 cron triggers configured and listed
- ✅ Custom domain eastgrinsteadac.co.uk points to Pages
- ✅ SSL/TLS certificate active (green lock icon)
- ✅ Email domain verified in Resend (DKIM/SPF/DMARC records set)

Report:
- Confirm all 4 cron triggers are listed
- Confirm custom domain is "Active"
- Confirm email domain is "Verified" in Resend
- Any DNS propagation delays? (Note how long it took)
- Any issues accessing coach app via Zero Trust?
```

### Success Verification
After Claude provides instructions and you complete them:
```bash
# Test custom domain is live
curl https://eastgrinsteadac.co.uk/api/health

# Test Resend email domain
# (Check Resend dashboard manually for "Verified" status)

# Test Cloudflare Access (manual browser test)
# Navigate to https://coach.eastgrinsteadac.co.uk
```

### Handoff to Phase 4
- ✅ All Cloudflare configurations complete
- ✅ DNS records set and verified
- ✅ Email domain verified in Resend
- ✅ Cron triggers configured
- Proceed to Phase 4: Production Deployment

---

## Phase 4: Production Deployment

### Objective
Deploy to production (main branch) and verify live platform is operational.

### Duration
10–15 minutes

### Prompt for Claude Code

```
You are helping deploy the EGAC platform. This is Phase 4: Production Deployment.

Prerequisites (from Phases 1–3):
- ✅ All secrets set
- ✅ Staging tests pass
- ✅ Cloudflare configuration complete (cron, access, domain, email)

Task: Deploy to production by pushing to main branch.

Actions:

1. Verify main branch is clean and ready:
   - Run: git status
   - Expected: "On branch main" and "working tree clean"
   - If not clean: Run git add and git commit before proceeding

2. Verify current branch has all Phase 5 changes (design system, age groups, etc.):
   - Run: git log --oneline -5
   - Confirm recent commits include: "Phase 5", "Phase 4", "Age groups", etc.
   - If changes are on a different branch, merge or rebase first

3. Push to main:
   - Run: git push origin main
   - Watch GitHub Actions (https://github.com/YOUR_ORG/egac/actions)
   - Expected workflow: "Deploy — Production"
   - Pipeline steps (in order):
     1. CI checks (lint, test, type-check)
     2. D1 migrations (0001–0006)
     3. Deploy to Cloudflare Pages
     4. Smoke test (health check)
   - Expected total time: 5–10 minutes
   - Verify all steps pass (green checkmarks)

4. Monitor deployment:
   - Go to Cloudflare Pages dashboard → egac project → Deployments
   - Should see new deployment with status "Success"
   - Deployment should be labeled "main" (production)

5. Test production health endpoint:
   - Run: curl https://eastgrinsteadac.co.uk/api/health
   - Expected response:
     {
       "status": "ok",
       "database": "ok",
       "cache": "ok",
       "email": "ok"
     }
   - If health check fails, run: wrangler d1 info egac --remote
   - And check Cloudflare Pages error logs for D1 connection issues

6. Verify public site is live:
   - Navigate to: https://eastgrinsteadac.co.uk/
   - Verify enquiry form loads
   - Verify Nav and Footer render correctly
   - Verify dark mode toggle works
   - Open browser DevTools: Console tab
   - Confirm no JavaScript errors

7. Test a real enquiry end-to-end (5 mins):
   - Fill enquiry form on production:
     * Parent name: "Production Test"
     * Child name: "Production Test Child"
     * Child DOB: 2014-09-15 (Year 5)
     * Email: your-test-email@example.com
   - Submit
   - Verify: "Thanks - check your email for a confirmation"
   - Check inbox (2–5 minute delay):
     * Should receive email from: noreply@updates.eastgrinsteadac.co.uk
     * Email subject: "Academy Programme - Waitlist"
     * Body contains: "Academy" or "waiting list"

8. Monitor for errors (next 5 minutes):
   - Go to Cloudflare Analytics (Pages dashboard → egac → Analytics)
   - Verify no 5xx errors
   - Verify no unusual spike in 4xx errors
   - Keep this open for next 5 minutes

Success criteria:
- ✅ GitHub Actions workflow passes all steps (green)
- ✅ Cloudflare Pages deployment shows "Success"
- ✅ /api/health returns 200 with all services "ok"
- ✅ Public site loads at https://eastgrinsteadac.co.uk
- ✅ Enquiry form works; email delivers correctly
- ✅ No 5xx errors in Cloudflare Analytics

Report:
- Confirm GitHub Actions workflow completed
- Confirm health check passed
- Confirm test enquiry received confirmation email
- Screenshot of Cloudflare Pages dashboard showing "Success" deployment
- Any issues or warnings encountered?
```

### Success Verification
After Claude completes Phase 4:
```bash
# Verify production health
curl https://eastgrinsteadac.co.uk/api/health

# Verify deployment is live
curl -I https://eastgrinsteadac.co.uk/ | grep "HTTP"
# Should return: HTTP/2 200
```

### Handoff to Phase 5
- ✅ Production deployment complete
- ✅ Health check passes
- ✅ Public site is live and functional
- ✅ Test enquiry processed successfully
- Proceed to Phase 5: Post-Deployment Validation & Handoff

---

## Phase 5: Post-Deployment Validation & Handoff

### Objective
Verify platform is stable, all features work in production, and document operational procedures.

### Duration
30–45 minutes

### Prompt for Claude Code

```
You are helping deploy the EGAC platform. This is Phase 5: Post-Deployment Validation & Handoff.

Prerequisites (from Phase 4):
- ✅ Production deployment complete
- ✅ Health check passes
- ✅ Public site is live

Task: Comprehensive post-deployment validation and operational handoff.

Actions:

1. Monitor Cloudflare Analytics (10 mins total):
   - Go to: Cloudflare Pages dashboard → egac project → Analytics
   - Verify:
     * No 5xx errors (system errors)
     * No spike in 4xx errors (user errors)
     * Response times are <1s for most requests
     * Request rate is normal (low traffic expected for day 1)
   - Screenshot the analytics dashboard

2. Verify email delivery (10 mins):
   - Go to Resend dashboard: https://resend.com/dashboard → Emails
   - Check "Recent emails" section
   - Verify:
     * At least 3–4 emails have been sent (from test enquiries)
     * All show status: "Delivered" (not "Bounced" or "Failed")
     * Sender shows: noreply@updates.eastgrinsteadac.co.uk
   - If any emails show "Bounced", investigate:
     * Is recipient email address valid?
     * Is domain properly verified in Resend?
   - Screenshot the email list

3. Run comprehensive feature validation (15 mins):

   TEST 1: Full enquiry → booking → confirmation flow
   - Navigate to: https://eastgrinsteadac.co.uk/
   - Submit enquiry (Year 7 child → taster path):
     * Fill all required fields
     * Use a real email address
     * Submit
   - Check inbox (wait up to 5 minutes for email)
   - Click booking link in email
   - Book a session (select Tuesday, child name, age group)
   - Submit booking
   - Check inbox: Should receive confirmation email
   - Verify confirmation email shows:
     * Correct session date/time
     * Training location (should match Settings)
     * Age group label

   TEST 2: Admin portal is accessible
   - Navigate to: https://eastgrinsteadac.co.uk/admin/login
   - Log in with ADMIN_TOKEN
   - Navigate to: Enquiries
   - Verify: Can see all test enquiries
   - Navigate to: Settings
   - Verify: Training locations are displayed
   - Navigate to: Templates
   - Verify: Can see all 6 email templates

   TEST 3: Academy route works
   - New tab, navigate to: https://eastgrinsteadac.co.uk/
   - Submit enquiry (Year 5 child → Academy path):
     * Fill all fields
     * Child DOB: Set to Year 5 (2014-09-15)
     * Submit
   - Check inbox: Should receive Academy email (not taster email)
   - Verify: Email mentions "Academy" or "waiting list"

   TEST 4: Rejection email works
   - New tab, navigate to: https://eastgrinsteadac.co.uk/
   - Submit enquiry (Year 4 child → rejection path):
     * Fill all fields
     * Child DOB: Set to Year 4 (2015-09-15)
     * Submit
   - Check inbox: Should receive rejection email
   - Verify: Email explains "Year 5 upwards"

   If all tests pass: Great! Core flows work. If any test fails, note the issue.

4. Verify cron jobs are configured (1 min):
   - Go to Cloudflare Pages → egac → Settings → Functions → Cron Triggers
   - Verify all 4 triggers are listed:
     ✅ 0 9 * * * (expire-invites)
     ✅ */30 * * * * (retry-invites)
     ✅ 0 18 * * 2 (send-reminders)
     ✅ 0 9 1 * * (academy-rollover)
   - Note next scheduled run times

5. Verify Cloudflare Access for coach app (1 min):
   - Attempt to access: https://coach.eastgrinsteadac.co.uk/
   - Should redirect to Cloudflare Access login
   - (Don't log in; just verify the login page appears)

6. Document operational procedures:
   - Create file: /home/eddie/projects/egac/membership-process/RUNBOOK.md
   - Include sections:
     * Daily checks (health endpoint, Cloudflare Analytics)
     * Email troubleshooting (Resend delivery, domain verification)
     * Admin password reset procedure (ADMIN_TOKEN rotation)
     * Cron job monitoring (expected run times, failure alerts)
     * Incident response (503 error = check Cloudflare status, etc.)
     * Backup/restore procedure (D1 auto-backup info)
   - See template below

7. Create deployment summary:
   - Output a checklist:
     ✅ Production deployment complete (commit hash)
     ✅ All tests pass in CI/CD
     ✅ Health check passes (all services ok)
     ✅ Enquiry routing works (Year 5 → Academy, Year 7 → taster, Year 4 → rejection)
     ✅ Email delivery works (Resend verified, emails delivering)
     ✅ Admin portal accessible
     ✅ Coach app behind Cloudflare Access
     ✅ Cron triggers configured and scheduled
     ✅ Cloudflare Analytics show no errors
     ✅ Custom domain active (eastgrinsteadac.co.uk)
   - Deployment date/time
   - Live URL: https://eastgrinsteadac.co.uk
   - Admin URL: https://eastgrinsteadac.co.uk/admin
   - Coach app URL: https://coach.eastgrinsteadac.co.uk (Zero Trust)

Success criteria:
- ✅ All 4 feature tests pass (enquiry, Academy, rejection, booking)
- ✅ Admin portal accessible
- ✅ Coach app behind Cloudflare Access
- ✅ No 5xx errors in Cloudflare Analytics
- ✅ Email delivery working (Resend shows "Delivered")
- ✅ Cron triggers configured
- ✅ RUNBOOK.md created with operational procedures

Report:
- Confirm all feature tests passed
- Screenshot of Cloudflare Analytics (no errors)
- Screenshot of Resend emails (all delivered)
- Screenshot of cron triggers configuration
- Links to live site and admin portal
- Note any issues or follow-up actions needed
```

### RUNBOOK.md Template

```markdown
# EGAC Platform — Operational Runbook

## Daily Health Checks
Every morning, check:
- curl https://eastgrinsteadac.co.uk/api/health → should return "ok"
- Cloudflare Analytics → check for 5xx errors
- Resend dashboard → check for bounced/failed emails

## Email Troubleshooting
If emails aren't sending:
1. Check Resend API status: https://resend.com/dashboard/emails
2. Verify domain is "Verified" in Resend (DKIM/SPF)
3. Check Cloudflare Analytics for errors
4. Check wrangler logs: wrangler tail --env production

If email deliverability is low:
- New domain reputation: may take 1-2 weeks to warm up
- Monitor Resend bounce rate; keep below 1%
- Consider reducing email frequency if needed

## Admin Token Rotation
To rotate ADMIN_TOKEN without downtime:
1. Generate new token: openssl rand -hex 32
2. Set in production: wrangler secret put ADMIN_TOKEN
3. Verify health check still passes: curl /api/health
4. Old token remains valid for ~1 minute during transition
5. Update team documentation with new token

## Cron Job Monitoring
Expected cron run times:
- expire-invites: 09:00 UTC daily
- retry-invites: Every 30 minutes
- send-reminders: 18:00 UTC on Tuesdays
- academy-rollover: 09:00 UTC on the 1st of each month

If cron job fails:
1. Check Cloudflare Pages logs: Pages → egac → Functions → Cron Triggers
2. Check D1 connection: wrangler d1 info egac --remote
3. Check Resend API status: May have temporary outage
4. Retry manually: curl -X POST /api/cron/[job-name] -H "Authorization: Bearer $CRON_SECRET"

## Incident Response
- **502/503 Errors**: Check Cloudflare status page; likely upstream issue
- **D1 Connection Error**: Verify D1 database exists: wrangler d1 info egac --remote
- **Email Send Failures**: Check Resend API key; verify domain verified; check quota (free tier = 3k/month)
- **High 4xx Rate**: Likely client errors (malformed requests); check browser console
- **Rate Limiting**: If legitimate users see 429, increase rate limit in src/middleware/index.ts

## Backup & Restore
Cloudflare D1 automatically backs up to nightly snapshots. To restore:
- Contact Cloudflare support with time range needed
- Full restore takes ~1 hour
- No automated restore process; manual recovery required

## Scaling Concerns
Free tier covers: ~200 enquiries/month, ~100 bookings/month, ~50 Academy applicants/season
If usage exceeds these, upgrade Resend or monitor D1 quota.
```

### Success Verification
After Claude completes Phase 5:
```bash
# Verify RUNBOOK.md was created
ls -la RUNBOOK.md

# Verify no outstanding issues
git status
# Should show working tree clean
```

### Final Handoff
- ✅ All 5 phases complete
- ✅ Production platform is live and operational
- ✅ All features tested and working
- ✅ Operational runbook created
- ✅ Team can now manage platform independently

---

## Success Criteria (Overall)

By the end of all 5 phases, you should have:

### Deployment
- ✅ Production platform live at eastgrinsteadac.co.uk
- ✅ GitHub Actions CI/CD passing all checks
- ✅ All secrets securely set in Cloudflare
- ✅ D1 migrations applied (6 migrations)

### Features Verified
- ✅ Enquiry form works (public page)
- ✅ Age-based routing works (Year 5 → Academy, Year 7 → taster, <Year 5 → rejection)
- ✅ Email delivery works (Resend verified and sending)
- ✅ Booking flow works (can book session, receive confirmation with location)
- ✅ Admin portal accessible and functional
- ✅ Coach app behind Cloudflare Access
- ✅ Settings can be updated (training locations)

### Infrastructure
- ✅ Cloudflare Pages deployment (zero-downtime)
- ✅ D1 database connected and queried
- ✅ KV cache operational (config, rate limiting)
- ✅ Resend email API integrated
- ✅ Cloudflare Access (coach app Zero Trust)
- ✅ Cron triggers scheduled (4 jobs)

### Security & Monitoring
- ✅ ADMIN_TOKEN and CRON_SECRET securely stored
- ✅ Rate limiting active (10 req/min per IP)
- ✅ Security headers set (CSP, X-Frame-Options, etc.)
- ✅ Cloudflare Analytics monitoring active
- ✅ Health check endpoint passing
- ✅ Operational runbook created

### Cost
- ✅ Infrastructure cost: £0/month (all free tier)
- ✅ Resend cost: Free tier (3k emails/month) — within budget
- ✅ Custom domain: £0 (Cloudflare managed)

---

## Rollback Plan (If Needed)

If a critical issue is discovered in production:

1. **Immediate Action:** Disable cron triggers (Cloudflare Pages → Functions → disable)
2. **Revert Code:** `git revert <commit-hash> && git push origin main` (triggers CI/CD redeploy)
3. **Investigate:** Check Cloudflare logs, Resend delivery, D1 queries
4. **Re-enable:** Once issue is fixed, re-enable cron triggers

**Note:** Reverting is safe; D1 data is preserved. No data loss on code rollback.

---

## What Happens Next

After Phase 5 completes:

### Week 1 (Monitoring)
- Monitor Resend delivery rates daily
- Monitor Cloudflare Analytics for errors
- Collect feedback from coaches on coach app
- Warm up email domain (domain reputation will improve)

### Week 2+ (Optimization)
- Analyze enquiry patterns
- Review email bounce rates
- Consider UI/UX improvements (design system Phase 5 polish)
- Document any bugs or feature requests

### Future Phases (Out of Scope)
- Multi-club SaaS extension (documented in `docs/saas-extension.md`)
- Bulk admin actions (attendance, exports)
- Monitoring/alerting system
- Performance optimizations

---

## Summary

| Phase | Duration | Key Action | Success Metric |
|---|---|---|---|
| 1: Preparation | 10 min | Set secrets, build locally | 231 tests pass |
| 2: Staging | 2–3 hrs | Deploy to staging, manual tests | All 6 feature tests pass |
| 3: Configuration | 20–30 min | Cloudflare Access, cron, domain | All configs verified |
| 4: Production | 10–15 min | Push to main, CI/CD deploys | Health check passes |
| 5: Validation | 30–45 min | Feature validation, runbook | All features work, team ready |

**Total elapsed time:** ~4–5 hours  
**Total active work:** ~3–4 hours  
**Deployment cutover time:** <5 minutes (automatic)

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-10  
**Status:** Ready for execution

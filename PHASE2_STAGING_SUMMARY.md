# Phase 2: Staging Deployment & Testing Summary

**Status:** IN PROGRESS  
**Timestamp:** 2026-05-10 17:10 UTC  
**Branch:** `staging-deploy-test`  
**Deployment URL:** `https://staging-deploy-test.egac-cl9.pages.dev`

---

## CI/CD Pipeline Status

### Run #1 (Initial push)
- **Status:** ❌ FAILED
- **Issues:** 3 lint errors
  - `src/api/enquiry.ts:15` — unused import `markWaitlistInviteSent`
  - `src/lib/config.ts:37` — unused variable `CONFIG_TTL_SECONDS`
  - `src/pages/docs/index.astro:134` — undefined variable `variable`

### Run #2 (Lint fixes applied)
- **Status:** ✅ IN PROGRESS → Will confirm completion
- **Changes:**
  - Removed unused import from enquiry.ts
  - Prefixed unused var with `_` in config.ts
  - Fixed template syntax in docs page
  - Committed and pushed fixes
  - All 251 tests passed locally during Phase 1

---

## Pages Deployment Status

**Waiting for staging deployment to be live at:**  
`https://staging-deploy-test.egac-cl9.pages.dev`

**Health check endpoint:**  
`https://staging-deploy-test.egac-cl9.pages.dev/api/health`

---

## Automated Tests (Ready to Execute)

Once health check passes, run these automated verifications:

```bash
# Test 1: Health check
curl https://staging-deploy-test.egac-cl9.pages.dev/api/health

# Test 2: Enquiry form page loads
curl https://staging-deploy-test.egac-cl9.pages.dev/ | grep enquiry

# Test 3: Admin login page loads
curl https://staging-deploy-test.egac-cl9.pages.dev/admin/login | grep password
```

---

## Manual Tests (In Browser)

Once site is live, perform these 6 critical user journey tests:

### TEST A: Year 5 Child → Academy Path
1. Navigate to: `https://staging-deploy-test.egac-cl9.pages.dev/`
2. Fill enquiry form:
   - Parent name: "Test Parent A"
   - Child name: "Test Child A"
   - Child DOB: `2014-09-15` (Year 5)
   - Email: your test email
3. Submit → verify "check your email for confirmation"
4. Check inbox → **Expect:** Academy waitlist email (not taster invite)

### TEST B: Year 4 Child → Rejection Path
1. Fill enquiry form:
   - Parent name: "Test Parent B"
   - Child name: "Test Child B"
   - Child DOB: `2015-09-15` (Year 4)
   - Email: your test email
2. Check inbox → **Expect:** Rejection email ("not yet old enough")

### TEST C: Year 7 Child → Taster Path
1. Fill enquiry form:
   - Parent name: "Test Parent C"
   - Child name: "Test Child C"
   - Child DOB: `2013-09-15` (Year 7)
   - Email: your test email
2. Check inbox → **Expect:** Booking invite email
3. **Click booking link** in email

### TEST D: Book Taster Session
1. From booking email (TEST C), click booking link
2. Verify page loads: "Book a taster session"
3. Select Tuesday date, fill child name, select age group (U14)
4. Submit booking
5. Check inbox → **Expect:** Confirmation email with:
   - Date/time of session
   - Training location (from admin settings)
   - Age group label (U14)

### TEST E: Admin Portal Login
1. Navigate to: `https://staging-deploy-test.egac-cl9.pages.dev/admin/login`
2. Username: `admin` (any text)
3. Password: Paste your `ADMIN_TOKEN` from Phase 1
4. Verify: Redirects to `/admin/enquiries`
5. Verify: Can see the 3 test enquiries created above

### TEST F: Admin Settings Persistence
1. Navigate to: `https://staging-deploy-test.egac-cl9.pages.dev/admin/settings`
2. Update "Training Location for Tuesday": e.g. "Broadfield Stadium"
3. Click Save
4. Verify: "Settings updated" message
5. Reload page → **Expect:** Value persists

---

## Success Criteria

| Criterion | Status |
|---|---|
| CI/CD pipeline passes (lint, test, build) | 🟡 In progress |
| Health check returns 200 | 🟡 Waiting |
| Pages deployment is live | 🟡 Waiting |
| TEST A: Year 5 → Academy email | ⬜ Ready |
| TEST B: Year 4 → Rejection email | ⬜ Ready |
| TEST C: Year 7 → Taster email | ⬜ Ready |
| TEST D: Booking + confirmation email | ⬜ Ready |
| TEST E: Admin login works | ⬜ Ready |
| TEST F: Settings persist | ⬜ Ready |

---

## Next Steps

1. ✅ Wait for health check to pass
2. ✅ Run 6 manual tests in browser
3. ✅ Document results
4. ✅ Proceed to Phase 3 (Cloudflare Configuration)

---

**Notes:**
- Email delivery may have 1–2 minute delay; be patient
- Check browser DevTools console for errors
- If any test fails, note the error and investigate before proceeding

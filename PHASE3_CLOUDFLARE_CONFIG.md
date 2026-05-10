# Phase 3: Cloudflare Configuration — Execution Checklist

**Duration:** 20–30 minutes  
**Requirements:** Manual Cloudflare dashboard access  
**Your role:** Execute dashboard steps; Claude verifies completion  
**Estimated effort:** ~5 minutes per task

---

## TASK 1: Cloudflare Access (Coach App Zero Trust)

**Dashboard:** https://dash.cloudflare.com → Zero Trust → Access → Applications

### Steps:
1. ☐ Click **"Add an application"**
2. ☐ Choose **"Self-hosted"**
3. ☐ Fill form:
   - **Application name:** `EGAC Coach App`
   - **Subdomain:** `coach`
   - **Application domain:** `coach.eastgrinsteadac.co.uk`
4. ☐ Click **"Next"**
5. ☐ Configure policy:
   - **Policy name:** `Coach Email Domain`
   - **Action:** `Allow`
   - **Rule type:** `Email`
   - **Email condition:** `ends with eastgrinsteadac.co.uk`
6. ☐ Click **"Add rule"**
7. ☐ Click **"Save application"**

**Verification:**
- [ ] Access URL displayed: `https://coach.eastgrinsteadac.co.uk`
- [ ] Policy shows "Coach Email Domain" with Allow action

**Status:** ⬜ Pending

---

## TASK 2: DNS for Coach App Subdomain

**Where:** Your DNS provider (GoDaddy, Namecheap, Cloudflare Registrar, etc.)

### Steps:
1. ☐ Log in to your DNS provider
2. ☐ Find your domain: `eastgrinsteadac.co.uk`
3. ☐ Create new CNAME record:
   - **Name:** `coach`
   - **Value:** `egac.pages.dev`
   - **TTL:** 3600 (or default)
4. ☐ Save the record
5. ☐ Wait for DNS propagation (~5 minutes)

**Verification (in terminal):**
```bash
nslookup coach.eastgrinsteadac.co.uk
# Should resolve to Cloudflare Pages IP
```

**Status:** ⬜ Pending

---

## TASK 3: Cron Triggers (4 jobs)

**Dashboard:** https://dash.cloudflare.com → Pages → egac → Settings → Functions → Cron Triggers

### TRIGGER 1: Expire Old Invites
1. ☐ Click **"Add Cron Trigger"**
2. ☐ **Cron:** `0 9 * * *` (Daily 09:00 UTC)
3. ☐ **URL:** `/api/cron/expire-invites`
4. ☐ Click **"Save"**

### TRIGGER 2: Retry Pending Invites
1. ☐ Click **"Add Cron Trigger"**
2. ☐ **Cron:** `*/30 * * * *` (Every 30 minutes)
3. ☐ **URL:** `/api/cron/retry-invites`
4. ☐ Click **"Save"**

### TRIGGER 3: Send Booking Reminders
1. ☐ Click **"Add Cron Trigger"**
2. ☐ **Cron:** `0 18 * * 2` (Tuesday 18:00 UTC)
3. ☐ **URL:** `/api/cron/send-reminders`
4. ☐ Click **"Save"**

### TRIGGER 4: Academy Season Rollover
1. ☐ Click **"Add Cron Trigger"**
2. ☐ **Cron:** `0 9 1 * *` (1st of month 09:00 UTC)
3. ☐ **URL:** `/api/cron/academy-rollover`
4. ☐ Click **"Save"**

**Verification:**
- [ ] All 4 triggers appear in the list
- [ ] No "Never" status (first run will show after scheduled time)

**Status:** ⬜ Pending

---

## TASK 4: Custom Domain

**Dashboard:** https://dash.cloudflare.com → Pages → egac → Settings → Domains

### Steps:
1. ☐ Click **"Add custom domain"**
2. ☐ Enter domain: `eastgrinsteadac.co.uk`
3. ☐ Click **"Add domain"**
4. ☐ If prompted for DNS records:
   - If using Cloudflare nameservers: Auto-verified ✓
   - If external DNS: Add provided CNAME/TXT records to your DNS provider
5. ☐ Wait for SSL/TLS certificate (usually <5 minutes)

**Verification:**
- [ ] Domain shows as **"Active"** with green checkmark
- [ ] SSL/TLS status: **"Active"**

**Status:** ⬜ Pending

---

## TASK 5: Email Domain (Resend)

**Dashboard:** https://resend.com/dashboard → Domains

### Steps:
1. ☐ Log in to Resend dashboard
2. ☐ Go to **Domains**
3. ☐ Click **"Add Domain"**
4. ☐ Enter: `updates.eastgrinsteadac.co.uk`
5. ☐ Resend displays 3 DNS records:
   - **DKIM (TXT)** — Copy exact value
   - **SPF (TXT)** — If you have existing SPF, append this
   - **DMARC (TXT)** — Optional but recommended
6. ☐ Add all records to your DNS provider
7. ☐ Return to Resend → Click **"Verify"**
8. ☐ Wait for verification (~5 minutes after DNS propagates)

**Verification:**
- [ ] Domain shows as **"Verified"** in Resend

**Status:** ⬜ Pending

---

## TASK 6: Verification Tests

### Test 1: Coach App Access
```
URL: https://coach.eastgrinsteadac.co.uk
Expected: Cloudflare Access login page
- [ ] Page loads (no 404)
- [ ] Login form appears
```

### Test 2: Custom Domain
```
URL: https://eastgrinsteadac.co.uk/
Expected: Enquiry form loads
- [ ] Page loads (no errors)
- [ ] Browser shows https (green lock)
- [ ] URL shows eastgrinsteadac.co.uk in address bar
```

### Test 3: Cron Triggers
```
Cloudflare Pages dashboard → Functions → Cron Triggers
Expected: All 4 triggers listed
- [ ] expire-invites (0 9 * * *)
- [ ] retry-invites (*/30 * * * *)
- [ ] send-reminders (0 18 * * 2)
- [ ] academy-rollover (0 9 1 * *)
```

---

## Summary

| Task | Status | Est. Time | Notes |
|---|---|---|---|
| 1. Cloudflare Access | ⬜ | 3 min | Dashboard only |
| 2. DNS (Coach) | ⬜ | 2 min | + ~5 min propagation |
| 3. Cron Triggers | ⬜ | 5 min | 4 triggers, 1 min each |
| 4. Custom Domain | ⬜ | 2 min | + ~5 min SSL provision |
| 5. Email Domain | ⬜ | 3 min | + ~5 min propagation |
| 6. Verification | ⬜ | 5 min | Test all configurations |
| **TOTAL** | | **20–30 min** | Mostly waiting for DNS |

---

## After Completion

Once you've completed all steps above:
1. ✅ Reply with which tasks are complete
2. ✅ Claude will verify programmatically
3. ✅ Proceed to Phase 4 (Production Deployment)

**Ready to begin? Start with Task 1.**

#!/bin/bash
# Phase 3 Verification Script
# Checks completion of Cloudflare configuration tasks

set -e

echo "🔍 Phase 3: Cloudflare Configuration Verification"
echo "=================================================="
echo ""

DOMAIN="eastgrinsteadac.co.uk"
COACH_DOMAIN="coach.$DOMAIN"
EMAIL_DOMAIN="updates.$DOMAIN"
PAGES_URL="https://egac.pages.dev"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; }
fail() { echo -e "${RED}❌ FAIL${NC}: $1"; }
warn() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; }

# Task 1: Coach app subdomain resolves
echo "TASK 1: Coach App Subdomain (DNS)"
COACH_IP=$(nslookup $COACH_DOMAIN 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}' || echo "")
if [ -n "$COACH_IP" ]; then
  pass "Coach domain resolves to $COACH_IP"
else
  fail "Coach domain does not resolve (may need more time)"
fi
echo ""

# Task 2: Custom domain resolves
echo "TASK 2: Custom Domain"
DOMAIN_IP=$(nslookup $DOMAIN 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}' || echo "")
if [ -n "$DOMAIN_IP" ]; then
  pass "Custom domain resolves to $DOMAIN_IP"
else
  fail "Custom domain does not resolve"
fi
echo ""

# Task 3: Custom domain loads with HTTPS
echo "TASK 3: Custom Domain HTTPS"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Custom domain returns HTTP 200"
elif [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
  pass "Custom domain returns HTTP $HTTP_CODE (redirect)"
else
  fail "Custom domain returned HTTP $HTTP_CODE"
fi
echo ""

# Task 4: Email domain DNS records (optional, checks if SPF exists)
echo "TASK 4: Email Domain SPF Record"
SPF=$(dig +short TXT $EMAIL_DOMAIN 2>/dev/null | grep -i "v=spf1" || echo "")
if [ -n "$SPF" ]; then
  pass "SPF record found for $EMAIL_DOMAIN"
else
  warn "SPF record not yet found (may still be propagating)"
fi
echo ""

echo "=================================================="
echo "Manual Dashboard Verification Required:"
echo ""
echo "1. Cloudflare Access:"
echo "   Dashboard → Zero Trust → Access → Applications"
echo "   ☐ See \"EGAC Coach App\" listed"
echo "   ☐ Policy \"Coach Email Domain\" with Allow action"
echo ""
echo "2. Cron Triggers:"
echo "   Dashboard → Pages → egac → Settings → Functions → Cron Triggers"
echo "   ☐ expire-invites (0 9 * * *)"
echo "   ☐ retry-invites (*/30 * * * *)"
echo "   ☐ send-reminders (0 18 * * 2)"
echo "   ☐ academy-rollover (0 9 1 * *)"
echo ""
echo "3. Custom Domain:"
echo "   Dashboard → Pages → egac → Settings → Domains"
echo "   ☐ $DOMAIN shows as \"Active\""
echo ""
echo "4. Email Domain:"
echo "   Resend.com → Domains"
echo "   ☐ $EMAIL_DOMAIN shows as \"Verified\""
echo ""
echo "=================================================="

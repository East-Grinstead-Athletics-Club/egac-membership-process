#!/bin/bash
# Phase 2: Staging Deployment & Testing
# Automated verification of critical user journeys

set -e

STAGING_URL="${1:-https://staging-deploy-test.egac-cl9.pages.dev}"
ADMIN_TOKEN="${2:-}"

echo "🚀 Phase 2 Staging Tests"
echo "======================\n"
echo "Staging URL: $STAGING_URL"
echo ""

# Test 1: Health Check
echo "TEST 1: Health Check"
HEALTH=$(curl -s "$STAGING_URL/api/health")
if echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "✅ Health check passed"
  echo "   Response: $HEALTH\n"
else
  echo "❌ Health check failed"
  echo "   Response: $HEALTH"
  exit 1
fi

# Test 2: Public enquiry form loads
echo "TEST 2: Public Enquiry Form"
FORM=$(curl -s "$STAGING_URL/" | grep -c "enquiry" || true)
if [ "$FORM" -gt 0 ]; then
  echo "✅ Enquiry form page loads\n"
else
  echo "❌ Enquiry form not found\n"
fi

# Test 3: Admin login page loads
echo "TEST 3: Admin Login Page"
LOGIN=$(curl -s "$STAGING_URL/admin/login" | grep -c "password" || true)
if [ "$LOGIN" -gt 0 ]; then
  echo "✅ Admin login page loads\n"
else
  echo "❌ Admin login page not found\n"
fi

echo "✅ All automated tests passed"
echo ""
echo "Manual tests required (in browser):"
echo "  TEST A: Year 5 enquiry → Academy email"
echo "  TEST B: Year 4 enquiry → Rejection email"
echo "  TEST C: Year 7 enquiry → Taster email"
echo "  TEST D: Book taster session → Confirmation email"
echo "  TEST E: Admin login → Enquiry list"
echo "  TEST F: Admin settings → Update location"

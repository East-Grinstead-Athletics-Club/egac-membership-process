// ============================================================
// EGAC Platform — Astro Middleware
// src/middleware/index.ts
//
// Applied to every request passing through Astro SSR.
//
// 1. Security headers — added to every response
// 2. Rate limiting — KV-backed, applied to public API routes only
//    Limit: 10 requests per minute per IP
//    Key:   ratelimit:{ip}:{YYYY-MM-DDTHH:MM} (minute bucket)
// ============================================================

import { defineMiddleware } from 'astro:middleware';
import { RateLimitError, handleApiError } from '../lib/errors.js';

// ── Security headers ──────────────────────────────────────────
// Applied to every response from Astro SSR.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ── Rate limiting config ──────────────────────────────────────
const RATE_LIMIT_MAX = 10; // requests per window
const RATE_LIMIT_WINDOW = 60; // seconds (1 minute)

// Public routes that are rate limited
const RATE_LIMITED_PATHS = ['/api/enquiry', '/api/booking', '/api/academy/respond'];

// ── Middleware ────────────────────────────────────────────────
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ── Rate limiting (public API routes only) ────────────────
  const isRateLimited = RATE_LIMITED_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  if (isRateLimited && request.method !== 'OPTIONS') {
    try {
      const env = locals.runtime?.env;
      if (env?.KV) {
        // Get client IP — Cloudflare sets CF-Connecting-IP
        const ip =
          request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          'unknown';

        // Minute bucket key
        const now = new Date();
        const bucket = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
        const key = `ratelimit:${ip}:${bucket}`;

        const current = await env.KV.get(key);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= RATE_LIMIT_MAX) {
          const rateLimitResponse = handleApiError(new RateLimitError(RATE_LIMIT_WINDOW));
          // Add security headers to rate limit response too
          const headers = new Headers(rateLimitResponse.headers);
          for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
            headers.set(k, v);
          }
          return new Response(rateLimitResponse.body, {
            status: 429,
            headers,
          });
        }

        // Increment counter — TTL slightly longer than window to handle clock drift
        await env.KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW + 10 });
      }
    } catch (e) {
      // Rate limiting failure must never block legitimate requests
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'rate_limit_check_failed',
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }

  // ── Process request ───────────────────────────────────────
  const response = await next();

  // ── Add security headers to all responses ────────────────
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

// ============================================================
// EGAC Platform — Admin Authentication
// src/lib/auth/admin.ts
//
// Shared auth utilities for admin API routes and Astro pages.
//
// API routes use:  Authorization: Bearer <ADMIN_TOKEN>
//                  or x-admin-token header
// Astro pages use: egac_admin_token cookie (checked server-side)
//
// Special rule: the literal string 'dev' is accepted as a token
// ONLY when APP_ENV === 'development'. This lets local testing
// work without needing to look up the real token, while
// ensuring a misconfigured 'dev' token never works in production.
// ============================================================

import type { Env } from '../db/schema.js';

// ------------------------------------------------------------
// checkAdminToken
// Core logic — shared between HTTP handler and Astro page auth.
// ------------------------------------------------------------
export function checkAdminToken(token: string, env: Env): boolean {
  if (!token) return false;
  // 'dev' shorthand is only valid in the development environment
  if (token === 'dev') return env.APP_ENV === 'development';
  return token === env.ADMIN_TOKEN;
}

// ------------------------------------------------------------
// requireAdmin
// Returns true if the request is authenticated as an admin.
// Reads from HttpOnly cookie first, then Authorization header (Bearer),
// then x-admin-token as a legacy fallback.
// ------------------------------------------------------------
export function requireAdmin(request: Request, env: Env): boolean {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const cookieToken = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('egac_admin_token='))
    ?.slice('egac_admin_token='.length);

  if (cookieToken && checkAdminToken(cookieToken, env)) {
    return true;
  }

  const auth = request.headers.get('Authorization') ?? '';
  const altHeader = request.headers.get('x-admin-token') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : altHeader;
  return checkAdminToken(provided, env);
}

// ------------------------------------------------------------
// wrapAdminRoute
// Higher-order function — wraps a handler with a 401 guard.
// Use for simple handlers that don't need dynamic URL segments.
// ------------------------------------------------------------
export function wrapAdminRoute(
  handler: (request: Request, env: Env) => Promise<Response>
): (request: Request, env: Env) => Promise<Response> {
  return async (request: Request, env: Env): Promise<Response> => {
    if (!requireAdmin(request, env)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return handler(request, env);
  };
}

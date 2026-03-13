// ============================================================
// EGAC Platform — API Helpers
// src/api/helpers.ts
//
// Shared utilities for all API handlers:
// - Typed JSON responses
// - Consistent error shapes
// - CORS headers
// - Request body parsing with validation
// ============================================================

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ------------------------------------------------------------
// CORS headers — only needed for the public enquiry endpoint
// which may be called from egac.co.uk directly.
// All other endpoints are same-origin or server-to-server.
// ------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ------------------------------------------------------------
// Response builders
// ------------------------------------------------------------
export function ok<T>(data: T, status = 200, cors = false): Response {
  const body: ApiSuccess<T> = { ok: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(cors ? CORS_HEADERS : {}),
    },
  });
}

export function err(message: string, status = 400, code?: string, cors = false): Response {
  const body: ApiError = { ok: false, error: message, ...(code ? { code } : {}) };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(cors ? CORS_HEADERS : {}),
    },
  });
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ------------------------------------------------------------
// parseBody
// Safely parses JSON request body.
// Returns null if body is empty or not valid JSON.
// ------------------------------------------------------------
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// requireMethod
// Returns an error response if the method doesn't match.
// Returns null if the method is correct (proceed normally).
// ------------------------------------------------------------
export function requireMethod(request: Request, method: string): Response | null {
  if (request.method.toUpperCase() !== method.toUpperCase()) {
    return err(`Method ${request.method} not allowed`, 405);
  }
  return null;
}

// ------------------------------------------------------------
// requireAdminToken
// Validates the Authorization: Bearer <token> header against
// the ADMIN_TOKEN env var.
// Returns an error response if invalid, null if valid.
// ------------------------------------------------------------
export function requireAdminToken(request: Request, adminToken: string): Response | null {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || token !== adminToken) {
    return err('Unauthorized', 401, 'UNAUTHORIZED');
  }
  return null;
}

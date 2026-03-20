// ============================================================
// EGAC Platform — Custom Error Classes
// src/lib/errors.ts
//
// Typed error classes that map cleanly to HTTP status codes.
// All API handlers catch these and pass them to handleApiError.
//
// Usage:
//   throw new ValidationError('Email is required');
//   throw new NotFoundError('Enquiry not found');
//   return handleApiError(error, 'handler_name');
// ============================================================

// ------------------------------------------------------------
// Error classes
// ------------------------------------------------------------

export class ValidationError extends Error {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  readonly status = 401;
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  readonly code = 'RATE_LIMITED';
  readonly retryAfter: number;
  constructor(retryAfter = 60) {
    super('Too many requests — please try again later');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ------------------------------------------------------------
// handleApiError
// Maps known error types to structured JSON responses.
// Unknown errors are logged and return a generic 500.
// Stack traces are NEVER exposed in responses.
// ------------------------------------------------------------

interface KnownError {
  status: number;
  code: string;
  message: string;
}

function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof ValidationError ||
    e instanceof AuthError ||
    e instanceof ForbiddenError ||
    e instanceof NotFoundError ||
    e instanceof ConflictError ||
    e instanceof RateLimitError
  );
}

export function handleApiError(error: unknown, context?: string): Response {
  if (isKnownError(error)) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (error instanceof RateLimitError) {
      headers['Retry-After'] = String(error.retryAfter);
    }

    return new Response(JSON.stringify({ ok: false, error: error.message, code: error.code }), {
      status: error.status,
      headers,
    });
  }

  // Unknown error — log it but never expose details
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled_error',
      context: context ?? 'unknown',
      error: error instanceof Error ? error.message : String(error),
    })
  );

  return new Response(
    JSON.stringify({ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}

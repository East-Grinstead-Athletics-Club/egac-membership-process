// ============================================================
// EGAC Platform — Token Business Logic
// src/lib/business/tokens.ts
//
// Secure token generation and expiry checking.
// No I/O — pure functions only.
// ============================================================

import { generateToken as _generateToken } from '../db/client.js';

// ------------------------------------------------------------
// generateSecureToken
// Returns a cryptographically random hex string.
// Length parameter is the number of random bytes —
// the resulting string will be 2× as long (hex encoding).
// Default 24 bytes → 48 char hex string.
// ------------------------------------------------------------
export function generateSecureToken(byteLength = 24): string {
  return _generateToken(byteLength);
}

// ------------------------------------------------------------
// isTokenExpired
// Returns true if the token is older than ttlDays.
// createdAt is an ISO 8601 string (as stored in D1).
// ------------------------------------------------------------
export function isTokenExpired(
  createdAt: string,
  ttlDays: number,
  now: Date = new Date()
): boolean {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return true; // Unparseable = treat as expired

  const ageMs = now.getTime() - created.getTime();
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

  return ageMs >= ttlMs;
}

// ------------------------------------------------------------
// isInviteExpired
// Convenience wrapper with the standard 14-day invite TTL.
// ------------------------------------------------------------
export const INVITE_TTL_DAYS = 14;

export function isInviteExpired(
  createdAt: string,
  now: Date = new Date()
): boolean {
  return isTokenExpired(createdAt, INVITE_TTL_DAYS, now);
}

// ------------------------------------------------------------
// isMembershipOtpExpired
// Convenience wrapper with the standard 7-day membership OTP TTL.
// ------------------------------------------------------------
export const MEMBERSHIP_OTP_TTL_DAYS = 7;

export function isMembershipOtpExpired(
  createdAt: string,
  now: Date = new Date()
): boolean {
  return isTokenExpired(createdAt, MEMBERSHIP_OTP_TTL_DAYS, now);
}

// ------------------------------------------------------------
// tokenAgeInHours
// Returns how many hours old a token is.
// Used by the cron retry job (only retry invites > 1 hour old).
// ------------------------------------------------------------
export function tokenAgeInHours(
  createdAt: string,
  now: Date = new Date()
): number {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return Infinity;
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60);
}

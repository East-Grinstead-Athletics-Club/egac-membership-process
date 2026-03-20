// ============================================================
// EGAC Platform — GET /api/health
// src/api/health.ts
// ============================================================

import { ok, err } from './helpers.js';
import type { Env } from '../lib/db/schema.js';

export async function handleHealth(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  const checks: Record<string, boolean> = {
    db: false,
    kv: false,
    email: false,
  };

  // ── D1 check ─────────────────────────────────────────────
  try {
    await env.DB.prepare('SELECT 1').first();
    checks.db = true;
  } catch (dbErr) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'health_check_db_failed',
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
    );
  }

  // ── KV check ─────────────────────────────────────────────
  try {
    const testKey = '_health_check';
    await env.KV.put(testKey, '1', { expirationTtl: 60 });
    const val = await env.KV.get(testKey);
    checks.kv = val === '1';
  } catch {
    checks.kv = false;
  }

  // ── Email key check ───────────────────────────────────────
  checks.email = typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.length > 0;

  const allOk = Object.values(checks).every(Boolean);

  if (!checks.db) {
    return err('Database unavailable', 503, 'DB_UNAVAILABLE');
  }

  return ok({
    status: allOk ? 'ok' : 'degraded',
    checks,
    environment: env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
}

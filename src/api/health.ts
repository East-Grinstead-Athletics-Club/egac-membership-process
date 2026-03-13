// ============================================================
// EGAC Platform — GET /api/health
// src/api/health.ts
//
// Liveness and readiness check.
// Called by GitHub Actions smoke tests after each deploy.
// Also useful for Cloudflare uptime monitoring.
//
// Returns:
//   - 200 with build info if D1 is reachable
//   - 503 if D1 query fails
// ============================================================

import { ok, err } from './helpers.js';
import type { Env } from '../lib/db/schema.js';

export async function handleHealth(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return err('Method not allowed', 405);

  // Probe D1 with a minimal query — verifies the DB binding is live
  try {
    await env.DB.prepare('SELECT 1').first();
  } catch (dbErr) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'health_check_db_failed',
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
    );

    return err('Database unavailable', 503, 'DB_UNAVAILABLE');
  }

  return ok({
    status: 'ok',
    environment: env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
}

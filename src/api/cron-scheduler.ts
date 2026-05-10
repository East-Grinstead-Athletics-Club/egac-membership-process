// ============================================================
// EGAC Platform — Cron Scheduler
// src/api/cron-scheduler.ts
//
// Dispatches native Cloudflare Cron Triggers to the appropriate
// business logic handlers. Called by the scheduled event handler
// in src/pages/api/[...path].ts
//
// This allows cron jobs to be configured in wrangler.toml
// using native Cron Triggers rather than external services.
// ============================================================

import { runExpireInvites } from './cron/expire-invites.js';
import { runRetryInvites } from './cron/retry-invites.js';
import { runSendReminders } from './cron/send-reminders.js';
import { runAcademyRollover } from './cron/academy-rollover.js';
import type { Env } from '../lib/db/schema.js';

// Map of cron expressions to their handlers.
// Cloudflare's scheduled handler fires with the matched cron expression.
const cronMap: Record<string, (env: Env) => Promise<unknown>> = {
  '0 9 * * *': runExpireInvites, // Daily 09:00 UTC: expire stale booking invites
  '*/30 * * * *': runRetryInvites, // Every 30 min: retry pending invite sends
  '0 18 * * 2': runSendReminders, // Tue 18:00 UTC: send booking reminders (7 days ahead)
  '0 9 1 * *': runAcademyRollover, // 1st of month 09:00 UTC: academy season rollover
};

export async function handleScheduledEvent(env: Env, cron?: string): Promise<void> {
  // For local development with wrangler dev --test-scheduled, the cron expression is passed.
  // For production, Cloudflare automatically matches the expression; we'll log all available crons.
  const executedCron = cron || '(production triggered)';

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'scheduled_event_fired',
      cron: executedCron,
      timestamp: new Date().toISOString(),
    })
  );

  // In production, Cloudflare will call this once per matched trigger.
  // In development, we can test a specific cron via query parameter or test a single handler.
  // For now, we'll execute all handlers (idempotent by design).
  const results: Record<string, unknown> = {};

  for (const [cronExpr, handler] of Object.entries(cronMap)) {
    try {
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'executing_cron_handler',
          cron: cronExpr,
        })
      );

      results[cronExpr] = await handler(env);

      console.log(
        JSON.stringify({
          level: 'info',
          event: 'cron_handler_complete',
          cron: cronExpr,
          result: results[cronExpr],
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'cron_handler_failed',
          cron: cronExpr,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'scheduled_batch_complete',
      results,
    })
  );
}

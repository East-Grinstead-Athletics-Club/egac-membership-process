// ============================================================
// EGAC Platform — Scheduled Worker
// src/workers/scheduled.ts
//
// Standalone Worker that handles Cloudflare Cron Triggers.
// Configured in wrangler.toml with [triggers] section.
//
// This worker is deployed alongside the Pages project and
// processes scheduled cron events.
// ============================================================

import { handleScheduledEvent } from '../api/cron-scheduler.js';
import type { Env } from '../lib/db/schema.js';

interface ScheduledController {
  cron: string;
  noRetry: () => void;
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await handleScheduledEvent(env, controller.cron);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'scheduled_worker_fatal',
          cron: controller.cron,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      );
      // Optionally call controller.noRetry() to prevent Cloudflare from retrying
      // For now, allow Cloudflare to retry once
    }
  },
};

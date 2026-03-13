// ============================================================
// EGAC Cron Worker
// workers/cron/src/index.ts
//
// Triggers scheduled jobs in the Pages project by POSTing to
// the existing /api/cron/* HTTP endpoints with CRON_SECRET.
//
// This Worker exists solely because Cloudflare Pages does not
// support [triggers] in wrangler.toml. All business logic
// remains in the Pages project.
// ============================================================

export interface Env {
  CRON_SECRET: string;
  PAGES_URL: string;
}

const CRON_ROUTES: Record<string, string> = {
  '0 9 * * *':    '/api/cron/expire-invites',
  '0 18 * * 2':   '/api/cron/send-reminders',
  '*/30 * * * *': '/api/cron/retry-invites',
  '0 9 1 * *':    '/api/cron/academy-rollover',
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const route = CRON_ROUTES[event.cron];

    if (!route) {
      console.warn(JSON.stringify({ level: 'warn', event: 'unknown_cron', cron: event.cron }));
      return;
    }

    const url = `${env.PAGES_URL}${route}`;

    ctx.waitUntil(
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      })
        .then(async (res) => {
          const body = await res.text();
          console.log(
            JSON.stringify({ level: 'info', event: 'cron_triggered', cron: event.cron, route, status: res.status, body })
          );
        })
        .catch((e: unknown) => {
          console.error(
            JSON.stringify({ level: 'error', event: 'cron_trigger_failed', cron: event.cron, route, error: String(e) })
          );
        })
    );
  },
};

```mermaid
%% Diagram: Cron Worker Integration
graph TD
  subgraph workers/cron/src/index.ts [Cron Worker]
    CronWorker[scheduled]
    CronWorker --> CRON_ROUTES[CRON_ROUTES]
    CRON_ROUTES --> ExpireInvitesRoute[/api/cron/expire-invites]
    CRON_ROUTES --> SendRemindersRoute[/api/cron/send-reminders]
    CRON_ROUTES --> RetryInvitesRoute[/api/cron/retry-invites]
    CRON_ROUTES --> AcademyRolloverRoute[/api/cron/academy-rollover]
    CronWorker --> PagesPOST[POST to Pages API]
  end
  subgraph src/api/router.ts [API Router]
    ExpireInvitesRoute --> ExpireInvitesHandler[handleExpireInvites]
    SendRemindersRoute --> SendRemindersHandler[handleSendReminders]
    RetryInvitesRoute --> RetryInvitesHandler[handleRetryInvites]
    AcademyRolloverRoute --> AcademyRolloverHandler[handleAcademyRollover]
  end
  CronWorker -.-> CloudflarePages[Cloudflare Pages]
```

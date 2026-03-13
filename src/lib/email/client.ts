// ============================================================
// EGAC Platform — Email Client
// src/lib/email/client.ts
//
// All outbound email routes through this module.
// Uses Resend's REST API directly — no SDK dependency,
// keeping the Worker bundle small.
//
// Key design decisions:
// - Never throws — email failures return {success: false}
//   so a failed email never crashes a booking or enquiry
// - Retry uses exponential backoff: 200ms, 400ms, 800ms
// - From address comes from env.EMAIL_FROM with a fallback
// ============================================================

import type { Env } from '../db/schema.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const RETRY_DELAYS_MS = [200, 400, 800];

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string; // Resend email ID on success
  error?: string; // Error message on failure
}

// ------------------------------------------------------------
// sendEmail
// Single attempt. Returns {success: false} on any failure
// rather than throwing — callers decide how to handle it.
// ------------------------------------------------------------
export async function sendEmail(options: SendEmailOptions, env: Env): Promise<SendEmailResult> {
  const from = env.EMAIL_FROM || 'noreply@egac.co.uk';

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown error');
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'email_send_failed',
          status: response.status,
          to: options.to,
          subject: options.subject,
          error: body,
        })
      );
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    const data = await response.json<{ id: string }>();

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'email_sent',
        resend_id: data.id,
        to: options.to,
        subject: options.subject,
      })
    );

    return { success: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'email_send_exception',
        to: options.to,
        error: message,
      })
    );
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------
// sendEmailWithRetry
// Retries up to maxAttempts times with exponential backoff.
// Returns the first successful result, or the last failure.
// ------------------------------------------------------------
export async function sendEmailWithRetry(
  options: SendEmailOptions,
  env: Env,
  maxAttempts = 3
): Promise<SendEmailResult> {
  let lastResult: SendEmailResult = { success: false, error: 'No attempts made' };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 800;
      await sleep(delayMs);
    }

    lastResult = await sendEmail(options, env);

    if (lastResult.success) return lastResult;

    console.log(
      JSON.stringify({
        level: 'warn',
        event: 'email_retry',
        attempt: attempt + 1,
        maxAttempts,
        to: options.to,
        error: lastResult.error,
      })
    );
  }

  return lastResult;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

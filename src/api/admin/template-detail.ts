// ============================================================
// EGAC Platform — Admin Template Detail API
// src/api/admin/template-detail.ts
//
// GET    /api/admin/templates/:id         — get template
// PATCH  /api/admin/templates/:id         — partial update
// GET    /api/admin/templates/:id/preview — rendered preview
// POST   /api/admin/templates/:id/test-send — send test email
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import { getEmailTemplateById, updateEmailTemplate } from '../../lib/repositories/templates.js';
import {
  validateTemplateVariables,
  extractTemplateVariables,
} from '../../lib/business/templates.js';
import { generatePreviewById } from '../../lib/email/preview.js';
import { sendEmailWithRetry } from '../../lib/email/client.js';
import { renderTemplate, buildSampleVars } from '../../lib/business/templates.js';
import type { Env } from '../../lib/db/schema.js';

// ------------------------------------------------------------
// handleAdminTemplateDetail  — GET/PATCH /api/admin/templates/:id
// ------------------------------------------------------------
export async function handleAdminTemplateDetail(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  if (request.method === 'GET') return handleGet(env, id);
  if (request.method === 'PATCH') return handlePatch(request, env, id);
  return err('Method not allowed', 405);
}

// ── GET ──────────────────────────────────────────────────────

async function handleGet(env: Env, id: string): Promise<Response> {
  const template = await getEmailTemplateById(id, env);
  if (!template) return err('Template not found', 404, 'NOT_FOUND');

  const detectedVars = extractTemplateVariables(template.html);
  return ok({ template, detected_variables: detectedVars });
}

// ── PATCH ────────────────────────────────────────────────────

async function handlePatch(request: Request, env: Env, id: string): Promise<Response> {
  const body = await parseBody<{
    name?: string;
    subject?: string;
    html?: string;
    text_content?: string;
    variables?: string;
    active?: number;
  }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const template = await getEmailTemplateById(id, env);
  if (!template) return err('Template not found', 404, 'NOT_FOUND');

  // If HTML is being updated, validate variables against allowed list
  if (body.html !== undefined) {
    let allowedVars: string[] = [];
    try {
      allowedVars = JSON.parse(template.variables || '[]') as string[];
    } catch {
      allowedVars = [];
    }

    // If allowedVars is empty, derive from current template (permissive)
    if (allowedVars.length === 0) {
      allowedVars = extractTemplateVariables(template.html);
    }

    // Also allow any new vars explicitly passed in variables field
    if (body.variables) {
      try {
        const bodyVars = JSON.parse(body.variables) as string[];
        allowedVars = [...new Set([...allowedVars, ...bodyVars])];
      } catch {
        /* ignore invalid json */
      }
    }

    const unknown = validateTemplateVariables(body.html, allowedVars);
    if (unknown.length > 0) {
      return err(
        `Unknown template variables: ${unknown.map((v) => `{{${v}}}`).join(', ')}`,
        422,
        'UNKNOWN_VARIABLES'
      );
    }
  }

  const updated = await updateEmailTemplate(
    id,
    {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.html !== undefined ? { html: body.html } : {}),
      ...(body.text_content !== undefined ? { text_content: body.text_content } : {}),
      ...(body.variables !== undefined ? { variables: body.variables } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
    env
  );

  console.log(JSON.stringify({ level: 'info', event: 'admin_template_updated', template_id: id }));

  return ok({ template: updated });
}

// ------------------------------------------------------------
// handleAdminTemplatePreview  — GET /api/admin/templates/:id/preview
// ------------------------------------------------------------
export async function handleAdminTemplatePreview(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'GET') return err('Method not allowed', 405);

  // Extract optional sampleVar overrides from query string
  const url = new URL(request.url);
  const overrides: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== 'token') overrides[key] = value;
  });

  try {
    const preview = await generatePreviewById(id, overrides, env);
    return ok(preview);
  } catch (e) {
    return err(String(e), 404, 'PREVIEW_FAILED');
  }
}

// ------------------------------------------------------------
// handleAdminTemplateTestSend  — POST /api/admin/templates/:id/test-send
// ------------------------------------------------------------
export async function handleAdminTemplateTestSend(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<{
    to?: string;
    sample_vars?: Record<string, string>;
  }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const to = String(body.to ?? '')
    .trim()
    .toLowerCase();
  if (!to) return err('to is required', 422, 'MISSING_TO');

  // Security: only send to the configured admin email
  const adminEmail = String(
    (env as Env & { ADMIN_EMAIL?: string }).ADMIN_EMAIL ?? ''
  ).toLowerCase();
  if (!adminEmail) return err('ADMIN_EMAIL is not configured', 500, 'NO_ADMIN_EMAIL');
  if (to !== adminEmail) {
    return err(
      'Test emails can only be sent to the configured admin email address',
      403,
      'FORBIDDEN_RECIPIENT'
    );
  }

  const template = await getEmailTemplateById(id, env);
  if (!template) return err('Template not found', 404, 'NOT_FOUND');

  const vars = buildSampleVars(body.sample_vars ?? {});

  let html: string;
  let subject: string;
  try {
    html = renderTemplate(template.html, vars);
    subject = renderTemplate(template.subject, vars);
  } catch (e) {
    // Graceful fallback — replace unresolved vars with placeholders
    html = template.html.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
    subject = template.subject.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  }

  const result = await sendEmailWithRetry({ to, subject: `[TEST] ${subject}`, html }, env);

  if (!result.success) {
    return err(`Failed to send test email: ${result.error}`, 502, 'EMAIL_FAILED');
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'admin_template_test_sent',
      template_id: id,
      to,
      resend_id: result.id,
    })
  );

  return ok({ sent: true, email_id: result.id });
}

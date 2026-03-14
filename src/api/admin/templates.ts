// ============================================================
// EGAC Platform — GET/POST /api/admin/templates
// src/api/admin/templates.ts
//
// GET  — list all templates with active status
// POST — create a new template (validates variables)
//
// Auth: Authorization: Bearer <ADMIN_TOKEN>
// ============================================================

import { ok, err, parseBody } from '../helpers.js';
import { requireAdmin } from '../../lib/auth/admin.js';
import {
  listEmailTemplates,
  createEmailTemplate,
  getEmailTemplateByKey,
} from '../../lib/repositories/templates.js';
import {
  validateTemplateVariables,
  extractTemplateVariables,
} from '../../lib/business/templates.js';
import { generateId, now } from '../../lib/db/client.js';
import type { Env } from '../../lib/db/schema.js';

export async function handleAdminTemplates(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return err('Unauthorized', 401, 'UNAUTHORIZED');

  if (request.method === 'GET') return handleList(env);
  if (request.method === 'POST') return handleCreate(request, env);
  return err('Method not allowed', 405);
}

// ── GET ──────────────────────────────────────────────────────

async function handleList(env: Env): Promise<Response> {
  const templates = await listEmailTemplates(env);
  return ok({ templates });
}

// ── POST ─────────────────────────────────────────────────────

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{
    key?: string;
    name?: string;
    subject?: string;
    html?: string;
    text_content?: string;
    variables?: string;
  }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const key = String(body.key ?? '').trim();
  const name = String(body.name ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const html = String(body.html ?? '').trim();

  if (!key) return err('key is required', 422, 'MISSING_KEY');
  if (!name) return err('name is required', 422, 'MISSING_NAME');
  if (!subject) return err('subject is required', 422, 'MISSING_SUBJECT');
  if (!html) return err('html is required', 422, 'MISSING_HTML');

  // Key must be unique
  const existing = await getEmailTemplateByKey(key, env);
  if (existing) return err(`Template with key '${key}' already exists`, 409, 'KEY_EXISTS');

  // Extract variables from HTML and store them
  const detectedVars = extractTemplateVariables(html);
  const variables = body.variables ?? JSON.stringify(detectedVars);

  const template = await createEmailTemplate(
    {
      id: generateId('tmpl'),
      key,
      name,
      subject,
      html,
      text_content: body.text_content ?? null,
      variables,
      active: 1,
      created_at: now(),
      updated_at: null,
    },
    env
  );

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'admin_template_created',
      template_id: template.id,
      key,
    })
  );

  return ok({ template }, 201);
}

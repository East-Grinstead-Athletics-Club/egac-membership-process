// ============================================================
// EGAC Platform — Email Templates Repository
// src/lib/repositories/templates.ts
// ============================================================

import { generateId, now, one, many, run, getDB } from '../db/client.js';
import type { EmailTemplate, EmailTemplateInsert, Env } from '../db/schema.js';

// ------------------------------------------------------------
// listEmailTemplates
// ------------------------------------------------------------
export async function listEmailTemplates(env: Env): Promise<EmailTemplate[]> {
  const db = getDB(env);

  // Templates are not environment-scoped — they are global to the deployment.
  // A staging deployment has its own D1 database with its own templates.
  return many<EmailTemplate>(db.prepare('SELECT * FROM email_templates ORDER BY name ASC'));
}

// ------------------------------------------------------------
// getEmailTemplateByKey
// Primary lookup — used when sending emails.
// ------------------------------------------------------------
export async function getEmailTemplateByKey(key: string, env: Env): Promise<EmailTemplate | null> {
  const db = getDB(env);

  return one<EmailTemplate>(
    db.prepare('SELECT * FROM email_templates WHERE key = ? AND active = 1').bind(key)
  );
}

// ------------------------------------------------------------
// getEmailTemplateById
// Used by the admin template editor.
// ------------------------------------------------------------
export async function getEmailTemplateById(id: string, env: Env): Promise<EmailTemplate | null> {
  const db = getDB(env);

  return one<EmailTemplate>(db.prepare('SELECT * FROM email_templates WHERE id = ?').bind(id));
}

// ------------------------------------------------------------
// createEmailTemplate
// ------------------------------------------------------------
export async function createEmailTemplate(
  data: EmailTemplateInsert,
  env: Env
): Promise<EmailTemplate> {
  const db = getDB(env);
  const id = data.id || generateId('tmpl');
  const createdAt = data.created_at || now();

  await run(
    db
      .prepare(
        `INSERT INTO email_templates
         (id, key, name, subject, html, text_content, variables, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .bind(
        id,
        data.key,
        data.name,
        data.subject,
        data.html,
        data.text_content ?? null,
        data.variables ?? '[]',
        createdAt
      )
  );

  const template = await getEmailTemplateById(id, env);
  if (!template) throw new Error(`Failed to retrieve template after insert: ${id}`);
  return template;
}

// ------------------------------------------------------------
// updateEmailTemplate
// Partial update — only touches the fields provided.
// ------------------------------------------------------------
export async function updateEmailTemplate(
  id: string,
  data: Partial<
    Pick<EmailTemplate, 'name' | 'subject' | 'html' | 'text_content' | 'variables' | 'active'>
  >,
  env: Env
): Promise<EmailTemplate> {
  const db = getDB(env);

  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now()];

  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name);
  }
  if (data.subject !== undefined) {
    sets.push('subject = ?');
    params.push(data.subject);
  }
  if (data.html !== undefined) {
    sets.push('html = ?');
    params.push(data.html);
  }
  if (data.text_content !== undefined) {
    sets.push('text_content = ?');
    params.push(data.text_content);
  }
  if (data.variables !== undefined) {
    sets.push('variables = ?');
    params.push(data.variables);
  }
  if (data.active !== undefined) {
    sets.push('active = ?');
    params.push(data.active);
  }

  params.push(id);

  await run(
    db.prepare(`UPDATE email_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...params)
  );

  const updated = await getEmailTemplateById(id, env);
  if (!updated) throw new Error(`Template not found after update: ${id}`);
  return updated;
}

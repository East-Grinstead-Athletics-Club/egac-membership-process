// ============================================================
// EGAC Platform — Email Preview
// src/lib/email/preview.ts
//
// Renders a template with sample data for the admin preview panel.
// No email is sent — returns the rendered HTML and subject only.
// ============================================================

import { getEmailTemplateByKey, getEmailTemplateById } from '../repositories/templates.js';
import { renderTemplate, buildSampleVars } from '../business/templates.js';
import type { Env } from '../db/schema.js';

export interface PreviewResult {
  html: string;
  subject: string;
  templateKey: string;
  templateName: string;
}

// ------------------------------------------------------------
// generatePreview
// Fetches a template by key and renders it with sample variables.
// Custom overrides can be passed to preview specific values.
// ------------------------------------------------------------
export async function generatePreview(
  templateKey: string,
  sampleVarOverrides: Record<string, string> = {},
  env: Env
): Promise<PreviewResult> {
  const template = await getEmailTemplateByKey(templateKey, env);

  if (!template) {
    throw new Error(`Template '${templateKey}' not found or inactive`);
  }

  const vars = buildSampleVars(sampleVarOverrides);

  // Render — catch unknown variable errors gracefully in preview mode
  // by substituting a placeholder rather than throwing
  let html: string;
  let subject: string;

  try {
    html = renderTemplate(template.html, vars);
  } catch {
    // In preview mode, replace any unresolved {{vars}} with a visible placeholder
    html = template.html.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  }

  try {
    subject = renderTemplate(template.subject, vars);
  } catch {
    subject = template.subject.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  }

  return {
    html,
    subject,
    templateKey: template.key,
    templateName: template.name,
  };
}

// ------------------------------------------------------------
// generatePreviewById
// Same as generatePreview but looks up by ID rather than key.
// Used in the template editor (where the admin has the ID).
// ------------------------------------------------------------
export async function generatePreviewById(
  templateId: string,
  sampleVarOverrides: Record<string, string> = {},
  env: Env
): Promise<PreviewResult> {
  const template = await getEmailTemplateById(templateId, env);

  if (!template) {
    throw new Error(`Template ID '${templateId}' not found`);
  }

  const vars = buildSampleVars(sampleVarOverrides);

  let html: string;
  let subject: string;

  try {
    html = renderTemplate(template.html, vars);
  } catch {
    html = template.html.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  }

  try {
    subject = renderTemplate(template.subject, vars);
  } catch {
    subject = template.subject.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  }

  return {
    html,
    subject,
    templateKey: template.key,
    templateName: template.name,
  };
}

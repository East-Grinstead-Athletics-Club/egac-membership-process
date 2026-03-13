// ============================================================
// EGAC Platform — Template Business Logic
// src/lib/business/templates.ts
//
// Template rendering and variable validation.
// No database access — operates on template strings directly.
// ============================================================

// ------------------------------------------------------------
// renderTemplate
// Replaces all {{variable_name}} placeholders in an HTML or
// text string with the provided values.
//
// Rules:
//   - Throws if a {{variable}} in the template is not in vars
//     (prevents sending emails with unfilled placeholders)
//   - Ignores extra keys in vars that aren't used in the template
//     (permissive on input, strict on output)
//   - Variable names are case-sensitive
// ------------------------------------------------------------
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  // Find all {{variable}} tokens in the template
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(template)) !== null) {
    found.add(match[1].trim());
  }

  // Check every found token has a value supplied
  const missing = [...found].filter((token) => !(token in vars));
  if (missing.length > 0) {
    throw new Error(
      `Template contains unreplaced variables: ${missing.map((m) => `{{${m}}}`).join(', ')}`
    );
  }

  // Replace all tokens
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    return vars[key.trim()] ?? '';
  });
}

// ------------------------------------------------------------
// validateTemplateVariables
// Scans a template HTML string for {{variable}} tokens and
// returns a list of any that are NOT in the allowedVars list.
//
// Used in the admin template editor to warn about unknown vars
// before saving.
// ------------------------------------------------------------
export function validateTemplateVariables(
  html: string,
  allowedVars: string[]
): string[] {
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const unknown: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const token = match[1].trim();
    if (!allowedVars.includes(token)) {
      unknown.push(token);
    }
  }

  return [...new Set(unknown)]; // deduplicate
}

// ------------------------------------------------------------
// extractTemplateVariables
// Returns all unique {{variable}} names found in a template.
// Used to build the variables reference panel in the template editor.
// ------------------------------------------------------------
export function extractTemplateVariables(template: string): string[] {
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(template)) !== null) {
    found.add(match[1].trim());
  }

  return [...found];
}

// ------------------------------------------------------------
// Default sample variables for template preview rendering.
// Covers all variables used across all EGAC email templates.
// ------------------------------------------------------------
export const SAMPLE_TEMPLATE_VARS: Record<string, string> = {
  contact_name: 'Jane Smith',
  parent_name: 'Jane Smith',
  child_name: 'Emily Smith',
  booking_url: 'https://egac.pages.dev/booking?invite=abc123def456',
  available_dates_list: '• Tuesday 14 April 2026\n• Tuesday 21 April 2026\n• Tuesday 28 April 2026',
  session_date: 'Tuesday 14 April 2026',
  session_time: '18:30',
  slot_label: 'U13 (Tuesday 18:30)',
  venue: 'East Grinstead Leisure Centre',
  add_to_calendar_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
  response_url: 'https://egac.pages.dev/academy/respond?token=xyz789',
  membership_url: 'https://egac.pages.dev/join?token=mem123',
};

// ------------------------------------------------------------
// buildSampleVars
// Merges custom overrides with the defaults.
// Used when an admin previews a template with their own values.
// ------------------------------------------------------------
export function buildSampleVars(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return { ...SAMPLE_TEMPLATE_VARS, ...overrides };
}

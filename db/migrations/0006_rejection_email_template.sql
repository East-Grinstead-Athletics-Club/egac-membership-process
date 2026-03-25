-- ============================================================
-- EGAC Platform - Update academy_rejection email template
-- Migration: 0006_rejection_email_template.sql
--
-- Changes {{contact_name}} to {{parent_name}} + {{child_name}}
-- to match the pattern used by other academy emails.
-- ============================================================

UPDATE email_templates
SET
  html = '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2>Hi {{parent_name}},</h2><p>Thank you for your interest in East Grinstead Athletics Club for <strong>{{child_name}}</strong>.</p><p>We are sorry to say that our Junior Academy is only able to register children from <strong>Year 5</strong> upwards. Unfortunately {{child_name}} is not yet old enough to join.</p><p>We would love to welcome {{child_name}} when they reach Year 5 — please do reapply at that point and we will be happy to add them to the waiting list.</p><p>The EGAC Team</p></body></html>',
  text_content = 'Hi {{parent_name}},

Thank you for your interest in East Grinstead Athletics Club for {{child_name}}.

We are sorry to say that our Junior Academy is only able to register children from Year 5 upwards. Unfortunately {{child_name}} is not yet old enough to join.

We would love to welcome {{child_name}} when they reach Year 5 - please do reapply at that point and we will be happy to add them to the waiting list.

The EGAC Team',
  variables = '["parent_name","child_name"]',
  updated_at = datetime('now')
WHERE key = 'academy_rejection';

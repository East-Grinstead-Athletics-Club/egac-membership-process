-- ============================================================
-- EGAC Platform - Seed Data
-- File: db/seed.sql
-- Run after 0001_initial_schema.sql
-- All INSERT OR IGNORE — fully idempotent, safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Age groups
-- Two default groups matching EGAC session schedule.
-- Codes 'u13' and 'u15plus' are referenced throughout
-- business logic — do not change the code values.
-- ------------------------------------------------------------
INSERT OR IGNORE INTO age_groups
  (id, code, label, min_age, max_age, session_day, session_time,
   capacity_per_session, active, sort_order, created_at)
VALUES
  ('ag_u13',     'u13',     'U13 (Tue 18:30)', 11, 12,   'Tuesday', '18:30', 2, 1, 1,
   datetime('now')),
  ('ag_u15plus', 'u15plus', 'U15+ (Tue 19:30)', 13, NULL, 'Tuesday', '19:30', 2, 1, 2,
   datetime('now'));

-- ------------------------------------------------------------
-- Email templates
-- Stub HTML included for each template.
-- Admins edit these via the admin portal template editor.
-- Variables list defines which {{placeholder}} tokens are valid.
-- ------------------------------------------------------------

-- 1. Booking invite — sent to non-academy enquiries
INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_invite',
  'booking_invite',
  'Booking Invitation',
  'Book your taster session at EGAC',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">Hi {{contact_name}},</h2>
<p>Thank you for your interest in East Grinstead Athletics Club.</p>
<p>We''d love to invite you to book a free taster session. Click the button below to choose a date that works for you:</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{booking_url}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Book your session</a>
</p>
<p><strong>Available dates:</strong></p>
<p>{{available_dates_list}}</p>
<p style="color:#666;font-size:14px;">This invitation link is personal to you and will expire after 14 days.</p>
<p>If you have any questions, please reply to this email.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Thank you for your interest in East Grinstead Athletics Club.

Book your free taster session here: {{booking_url}}

Available dates:
{{available_dates_list}}

This link expires after 14 days.

The EGAC Team',
  '["contact_name","booking_url","available_dates_list"]',
  1,
  datetime('now')
);

-- 2. Booking confirmation — sent when a session is booked
INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_confirmation',
  'booking_confirmation',
  'Booking Confirmation',
  'Your EGAC taster session is confirmed',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">You''re booked in, {{contact_name}}!</h2>
<p>Your taster session at East Grinstead Athletics Club is confirmed.</p>
<table style="border-collapse:collapse;width:100%;margin:24px 0;">
  <tr><td style="padding:8px 0;color:#666;width:140px;">Date</td><td style="padding:8px 0;font-weight:600;">{{session_date}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;font-weight:600;">{{session_time}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Group</td><td style="padding:8px 0;font-weight:600;">{{slot_label}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Venue</td><td style="padding:8px 0;font-weight:600;">{{venue}}</td></tr>
</table>
<p style="text-align:center;margin:24px 0;">
  <a href="{{add_to_calendar_url}}" style="border:1px solid #2563eb;color:#2563eb;padding:10px 20px;border-radius:8px;text-decoration:none;">Add to Google Calendar</a>
</p>
<p style="color:#666;font-size:14px;">Please wear comfortable sports clothing and bring water.</p>
<p>See you on the track!</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Your taster session is confirmed.

Date: {{session_date}}
Time: {{session_time}}
Group: {{slot_label}}
Venue: {{venue}}

Add to calendar: {{add_to_calendar_url}}

See you on the track!
The EGAC Team',
  '["contact_name","session_date","session_time","slot_label","venue","add_to_calendar_url"]',
  1,
  datetime('now')
);

-- 3. Academy waitlist — sent to under-10 enquiries
INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_academy_waitlist',
  'academy_waitlist',
  'Academy Waiting List',
  'EGAC Junior Academy — your place on the waiting list',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">Hi {{parent_name}},</h2>
<p>Thank you for your interest in the East Grinstead Athletics Club Junior Academy for <strong>{{child_name}}</strong>.</p>
<p>We''ve added them to our waiting list for the next intake. We''ll be in touch when places become available.</p>
<p>When the time comes, we''ll send you a link to confirm whether you''d still like a place:</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{response_url}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Confirm your interest</a>
</p>
<p style="color:#666;font-size:14px;">If you no longer wish to be on the waiting list, simply ignore this message.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{parent_name}},

Thank you for your interest in the EGAC Junior Academy for {{child_name}}.

We have added them to our waiting list. We will be in touch when places are available.

Confirm your interest: {{response_url}}

The EGAC Team',
  '["parent_name","child_name","response_url"]',
  1,
  datetime('now')
);

-- 4. Membership invite — sent after a successful taster session
INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_membership_invite',
  'membership_invite',
  'Membership Invitation',
  'Welcome to EGAC — join as a member',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">Great session, {{contact_name}}!</h2>
<p>We loved having you at East Grinstead Athletics Club and we''d love for you to join as a full member.</p>
<p>Click below to complete your membership application:</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{membership_url}}" style="background:#16a34a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Join EGAC</a>
</p>
<p style="color:#666;font-size:14px;">This link is valid for 7 days.</p>
<p>We look forward to welcoming you to the club!</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Great session — we would love you to join EGAC as a full member.

Complete your application here: {{membership_url}}

This link is valid for 7 days.

The EGAC Team',
  '["contact_name","membership_url"]',
  1,
  datetime('now')
);

-- 5. Booking reminder — sent ~7 days before session
INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_reminder',
  'booking_reminder',
  'Session Reminder',
  'Reminder: your EGAC taster session is coming up',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">See you soon, {{contact_name}}!</h2>
<p>Just a reminder that your EGAC taster session is coming up:</p>
<table style="border-collapse:collapse;width:100%;margin:24px 0;">
  <tr><td style="padding:8px 0;color:#666;width:140px;">Date</td><td style="padding:8px 0;font-weight:600;">{{session_date}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;font-weight:600;">{{session_time}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Group</td><td style="padding:8px 0;font-weight:600;">{{slot_label}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Venue</td><td style="padding:8px 0;font-weight:600;">{{venue}}</td></tr>
</table>
<p style="color:#666;font-size:14px;">Please wear comfortable sports clothing and bring water.</p>
<p>Looking forward to seeing you!</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

A reminder that your EGAC taster session is coming up.

Date: {{session_date}}
Time: {{session_time}}
Group: {{slot_label}}
Venue: {{venue}}

The EGAC Team',
  '["contact_name","session_date","session_time","slot_label","venue"]',
  1,
  datetime('now')
);

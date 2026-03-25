-- ============================================================
-- EGAC Platform - Seed Data
-- File: db/seed.sql
-- All INSERT OR IGNORE — fully idempotent, safe to re-run.
--
-- Age group ages are on 31 August of the athletics season:
--   U12 Academy    : 9–10   waitlist, Sat + Tue, Apr–Aug (school years 5–6)
--   U14            : 11–12  taster,   Tuesday (2 places, school years 7–8)
--   U16 and older  : 13+    taster,   Tuesday (2 places, school years 9–10+)
--   U18            : 15–16  taster,   Tuesday (2 places, school years 11–12)
-- ============================================================

INSERT OR REPLACE INTO age_groups
  (id, code, label, booking_type,
   age_min_aug31, age_max_aug31,
   session_days, session_time,
   capacity_per_session, season_capacity,
   season_start_month, season_end_month,
   active, sort_order, created_at)
VALUES
  ('ag_u11', 'u12', 'U12 Academy', 'waitlist',
   9, 10,
   '["Saturday","Tuesday"]', NULL,
   NULL, 40,
   4, 8,
    1, 1, datetime('now')),

  ('ag_u13', 'u14', 'U14', 'taster',
   11, 12,
   '["Tuesday"]', '18:30',
   2, NULL,
   NULL, NULL,
   1, 2, datetime('now')),

  ('ag_u15', 'u16', 'U16 and older', 'taster',
   13, 120,
   '["Tuesday"]', '18:30',
   2, NULL,
   NULL, NULL,
   1, 3, datetime('now')),

  ('ag_u17', 'u18', 'U18', 'taster',
   15, 16,
   '["Tuesday"]', '19:30',
   2, NULL,
   NULL, NULL,
    1, 4, datetime('now')),

  ('ag_u20', 'u20', 'U20', 'taster',
   17, 19,
   '["Tuesday"]', '19:30',
   2, NULL,
   NULL, NULL,
    1, 5, datetime('now'));

-- ------------------------------------------------------------
-- Email templates
-- ------------------------------------------------------------

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_invite', 'booking_invite', 'Booking Invitation',
  'Book your taster session at EGAC',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>Hi {{contact_name}},</h2>
<p>Thank you for your interest in East Grinstead Athletics Club.</p>
<p>We would love to invite you to book a free taster session:</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{booking_url}}" style="background:#2563eb;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Book your session</a>
</p>
<p><strong>Available dates:</strong></p>
<p style="white-space:pre-line;">{{available_dates_list}}</p>
<p style="color:#666;font-size:14px;">This link is personal to you and expires after 14 days.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Book your taster session: {{booking_url}}

Available dates:
{{available_dates_list}}

This link expires after 14 days.
The EGAC Team',
  '["contact_name","booking_url","available_dates_list"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_confirmation', 'booking_confirmation', 'Booking Confirmation',
  'Your EGAC taster session is confirmed',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>You are booked in, {{contact_name}}!</h2>
<table style="border-collapse:collapse;width:100%;margin:24px 0;">
  <tr><td style="padding:8px 0;color:#666;width:140px;">Date</td><td style="font-weight:600;">{{session_date}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Time</td><td style="font-weight:600;">{{session_time}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Group</td><td style="font-weight:600;">{{age_group_label}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Venue</td><td style="font-weight:600;">{{venue}}</td></tr>
</table>
<p style="text-align:center;">
  <a href="{{add_to_calendar_url}}" style="border:1px solid #2563eb;color:#2563eb;padding:10px 20px;border-radius:8px;text-decoration:none;">Add to Google Calendar</a>
</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Your taster session is confirmed.
Date: {{session_date}}
Time: {{session_time}}
Group: {{age_group_label}}
Venue: {{venue}}

Add to calendar: {{add_to_calendar_url}}

The EGAC Team',
  '["contact_name","session_date","session_time","age_group_label","venue","add_to_calendar_url"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_academy_waitlist', 'academy_waitlist', 'Academy Waiting List',
  'EGAC Junior Academy - your place on the waiting list',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>Hi {{parent_name}},</h2>
<p>Thank you for your interest in the EGAC Junior Academy for <strong>{{child_name}}</strong>.</p>
<p>We run an Academy for U11 children and operate a waiting list for those interested. Once space becomes available, you will be contacted and offered a place.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{parent_name}},

Thank you for your interest in the EGAC Junior Academy for {{child_name}}.
We run an Academy for U11 children and operate a waiting list for those interested. Once space becomes available, you will be contacted and offered a place.

The EGAC Team',
  '["parent_name","child_name"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_academy_rejection', 'academy_rejection', 'Academy Application - Too Young',
  'Thank you for your interest in EGAC',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>Hi {{contact_name}},</h2>
<p>Thank you for your interest in East Grinstead Athletics Club.</p>
<p>Our Junior Academy accepts children from <strong>Year 5</strong> upwards (age 9–10). Unfortunately the child you have applied for is not yet old enough to join.</p>
<p>We would love to welcome them when they reach Year 5 — please do reapply at that point and we will be happy to add them to the waiting list.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Thank you for your interest in East Grinstead Athletics Club.

Our Junior Academy accepts children from Year 5 upwards (age 9-10). Unfortunately the child you have applied for is not yet old enough to join.

We would love to welcome them when they reach Year 5 — please do reapply at that point and we will be happy to add them to the waiting list.

The EGAC Team',
  '["contact_name"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_academy_invite', 'academy_invite', 'Academy Season Invitation',
  'A place is available for {{child_name}} in the EGAC Academy',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>Hi {{parent_name}},</h2>
<p>Great news — a place is available for <strong>{{child_name}}</strong> in the <strong>{{season_label}}</strong> EGAC Junior Academy.</p>
<p>The Academy runs from <strong>{{season_start}}</strong> to <strong>{{season_end}}</strong>.</p>
<p>Please confirm whether you would like this place:</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{accept_url}}" style="background:#16a34a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:12px;">Accept place</a>
  <a href="{{decline_url}}" style="background:#dc2626;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Decline</a>
</p>
<p style="color:#666;font-size:14px;">Please respond within 7 days. If we do not hear from you the place will be offered to the next family on the list.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{parent_name}},

A place is available for {{child_name}} in the {{season_label}} EGAC Junior Academy ({{season_start}} to {{season_end}}).

Accept: {{accept_url}}
Decline: {{decline_url}}

Please respond within 7 days.
The EGAC Team',
  '["parent_name","child_name","season_label","season_start","season_end","accept_url","decline_url"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_membership_invite', 'membership_invite', 'Membership Invitation',
  'Welcome to EGAC - join as a member',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>Great session, {{contact_name}}!</h2>
<p>We loved having you at EGAC and we would love for you to join as a full member.</p>
<p style="text-align:center;margin:32px 0;">
  <a href="{{membership_url}}" style="background:#16a34a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Join EGAC</a>
</p>
<p style="color:#666;font-size:14px;">This link is valid for 7 days.</p>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Join EGAC as a full member: {{membership_url}}

This link is valid for 7 days.
The EGAC Team',
  '["contact_name","membership_url"]',
  1, datetime('now')
);

INSERT OR IGNORE INTO email_templates
  (id, key, name, subject, html, text_content, variables, active, created_at)
VALUES (
  'tmpl_booking_reminder', 'booking_reminder', 'Session Reminder',
  'Reminder: your EGAC taster session is coming up',
  '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2>See you soon, {{contact_name}}!</h2>
<table style="border-collapse:collapse;width:100%;margin:24px 0;">
  <tr><td style="padding:8px 0;color:#666;width:140px;">Date</td><td style="font-weight:600;">{{session_date}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Time</td><td style="font-weight:600;">{{session_time}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Group</td><td style="font-weight:600;">{{age_group_label}}</td></tr>
  <tr><td style="padding:8px 0;color:#666;">Venue</td><td style="font-weight:600;">{{venue}}</td></tr>
</table>
<p>The EGAC Team</p>
</body></html>',
  'Hi {{contact_name}},

Your EGAC taster session reminder:
Date: {{session_date}}
Time: {{session_time}}
Group: {{age_group_label}}
Venue: {{venue}}

The EGAC Team',
  '["contact_name","session_date","session_time","age_group_label","venue"]',
  1, datetime('now')
);

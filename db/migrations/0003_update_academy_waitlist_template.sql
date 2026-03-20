UPDATE email_templates
SET html='<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2>Hi {{parent_name}},</h2><p>Thank you for your interest in the EGAC Junior Academy for <strong>{{child_name}}</strong>.</p><p>We run an Academy for U11 children and operate a waiting list for those interested. Once space becomes available, you will be contacted and offered a place.</p><p>The EGAC Team</p></body></html>',
    text_content='Hi {{parent_name}},

Thank you for your interest in the EGAC Junior Academy for {{child_name}}.
We run an Academy for U11 children and operate a waiting list for those interested. Once space becomes available, you will be contacted and offered a place.

The EGAC Team',
    updated_at=datetime('now')
WHERE key='academy_waitlist';

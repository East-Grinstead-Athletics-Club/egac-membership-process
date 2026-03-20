-- ------------------------------------------------------------
-- membership_forms
-- Captures completed membership application payloads submitted
-- through the tokenized /join flow.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_forms (
  id                TEXT PRIMARY KEY,
  enquiry_id        TEXT NOT NULL,
  membership_otp_id TEXT NOT NULL,
  submitted_at      TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  environment       TEXT DEFAULT 'production',
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id),
  FOREIGN KEY (membership_otp_id) REFERENCES membership_otps(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS membership_forms_otp_idx
  ON membership_forms(membership_otp_id, environment);

CREATE INDEX IF NOT EXISTS membership_forms_enquiry_idx
  ON membership_forms(enquiry_id);

CREATE INDEX IF NOT EXISTS membership_forms_env_idx
  ON membership_forms(environment);

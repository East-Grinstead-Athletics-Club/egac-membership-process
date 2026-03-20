-- ============================================================
-- Migration 0004: Coach App — attendance infrastructure
--
-- Adds:
--   1. checked_in_at column to bookings (taster check-in)
--   2. athletes table (created from membership form completion)
--   3. attendance_log table (immutable safeguarding audit trail)
--
-- Run against production:
--   wrangler d1 execute egac --file=db/migrations/0004_coach_app.sql
-- Run against local:
--   wrangler d1 execute egac --local --file=db/migrations/0004_coach_app.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add check-in timestamp to bookings
--    NULL = not yet checked in
--    ISO timestamp = checked in at this time
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN checked_in_at TEXT;

-- ------------------------------------------------------------
-- 2. athletes
--    Created when a taster completes the membership form.
--    Links back to the original enquiry for full history.
--    medical_info and emergency contacts stored for coach access.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS athletes (
  id                        TEXT PRIMARY KEY,
  enquiry_id                TEXT,
  membership_form_id        TEXT,                    -- FK to membership_forms
  name                      TEXT NOT NULL,
  dob                       TEXT,
  email                     TEXT,
  phone                     TEXT,                    -- athlete's own phone (if adult)
  emergency_contact_name    TEXT NOT NULL,
  emergency_contact_phone   TEXT NOT NULL,
  emergency_contact_name_2  TEXT,
  emergency_contact_phone_2 TEXT,
  medical_info              TEXT,                    -- free text for coach awareness
  status                    TEXT DEFAULT 'active'
                            CHECK (status IN ('active','inactive','suspended')),
  last_attended_at          TEXT,                    -- updated by coach app on each check-in
  flagged_absent            INTEGER DEFAULT 0,       -- set by pastoral care cron
  flagged_absent_at         TEXT,                    -- when the flag was set
  environment               TEXT NOT NULL DEFAULT 'production',
  created_at                TEXT NOT NULL,
  updated_at                TEXT,
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id),
  FOREIGN KEY (membership_form_id) REFERENCES membership_forms(id)
);

CREATE INDEX IF NOT EXISTS athletes_enquiry_idx   ON athletes(enquiry_id);
CREATE INDEX IF NOT EXISTS athletes_status_idx    ON athletes(status, environment);
CREATE INDEX IF NOT EXISTS athletes_env_idx       ON athletes(environment);
CREATE UNIQUE INDEX IF NOT EXISTS athletes_form_idx ON athletes(membership_form_id)
  WHERE membership_form_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. attendance_log
--    Immutable write-once audit trail. Records are never deleted.
--    Covers both members (athletes table) and tasters (bookings).
--    person_name is denormalised — correct at time of check-in,
--    preserved even if the name changes later.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_log (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL,      -- athlete.id OR enquiry.id
  person_type  TEXT NOT NULL       -- 'member' | 'taster'
               CHECK (person_type IN ('member','taster')),
  person_name  TEXT,               -- denormalised for audit durability
  session_date TEXT NOT NULL,      -- YYYY-MM-DD
  status       TEXT NOT NULL DEFAULT 'P'
               CHECK (status IN ('P','A')),  -- P=present, A=absent (future use)
  marked_by    TEXT DEFAULT 'coach-app',
  created_at   TEXT NOT NULL,
  environment  TEXT NOT NULL DEFAULT 'production',
  UNIQUE (person_id, session_date)             -- one record per person per session
);

CREATE INDEX IF NOT EXISTS attendance_log_person_idx ON attendance_log(person_id);
CREATE INDEX IF NOT EXISTS attendance_log_date_idx   ON attendance_log(session_date);
CREATE INDEX IF NOT EXISTS attendance_log_env_idx    ON attendance_log(environment);

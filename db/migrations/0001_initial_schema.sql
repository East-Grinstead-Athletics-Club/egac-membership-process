-- ============================================================
-- EGAC Platform - Initial Schema Migration
-- Migration: 0001_initial_schema.sql
-- Target: Cloudflare D1 (SQLite)
--
-- Age group design notes:
--   Age groups are fully configurable in D1. No slot codes are
--   hardcoded in application logic.
--
--   Age is determined by the athlete's age on 31 August of
--   the athletics season the session falls in (UK standard).
--   A session on 14 October 2026 falls in the 2026/27 season
--   so the reference date is 31 August 2026.
--
--   Academy is a separate programme with its own season,
--   waitlist, and capacity model.
-- ============================================================

-- ------------------------------------------------------------
-- enquiries
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  name          TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  dob           TEXT,
  source        TEXT DEFAULT 'website',
  processed     INTEGER DEFAULT 0,
  age_group_id  TEXT,
  note          TEXT,
  raw_payload   TEXT,
  events        TEXT DEFAULT '[]',
  invite_id     TEXT,
  environment   TEXT DEFAULT 'production'
);

CREATE INDEX IF NOT EXISTS enquiries_email_idx      ON enquiries(email);
CREATE INDEX IF NOT EXISTS enquiries_created_idx    ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS enquiries_processed_idx  ON enquiries(processed);
CREATE INDEX IF NOT EXISTS enquiries_env_idx        ON enquiries(environment);
CREATE INDEX IF NOT EXISTS enquiries_email_env_idx  ON enquiries(email, environment);
CREATE INDEX IF NOT EXISTS enquiries_age_group_idx  ON enquiries(age_group_id);

-- ------------------------------------------------------------
-- invites
-- Taster session booking invites only. Not used for Academy.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  id              TEXT PRIMARY KEY,
  token           TEXT UNIQUE NOT NULL,
  enquiry_id      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  sent_at         TEXT,
  accepted_at     TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','accepted','expired')),
  send_attempts   INTEGER DEFAULT 0,
  last_send_error TEXT,
  environment     TEXT DEFAULT 'production',
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id)
);

CREATE INDEX IF NOT EXISTS invites_token_idx  ON invites(token);
CREATE INDEX IF NOT EXISTS invites_enq_idx    ON invites(enquiry_id);
CREATE INDEX IF NOT EXISTS invites_status_idx ON invites(status);
CREATE INDEX IF NOT EXISTS invites_env_idx    ON invites(environment);

-- ------------------------------------------------------------
-- age_groups
-- Single source of truth for all age group configuration.
--
-- booking_type:
--   'taster'   athlete books a taster session via invite link
--   'waitlist' athlete joins the Academy waiting list
--
-- age_min_aug31 / age_max_aug31:
--   Athlete's age on 31 Aug of the relevant athletics season.
--   U11=9-10, U13=11-12, U15=13-14, U17=15-16, U20=17-19
--
-- session_days: JSON array e.g. ["Tuesday"] or ["Saturday","Tuesday"]
--
-- season_start_month / season_end_month:
--   NULL = year-round (taster groups).
--   4 / 8 = April to August (Academy season).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS age_groups (
  id                   TEXT PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,
  label                TEXT NOT NULL,
  booking_type         TEXT NOT NULL DEFAULT 'taster'
                       CHECK (booking_type IN ('taster','waitlist')),
  age_min_aug31        INTEGER NOT NULL,
  age_max_aug31        INTEGER NOT NULL,
  session_days         TEXT NOT NULL DEFAULT '["Tuesday"]',
  session_time         TEXT,
  capacity_per_session INTEGER DEFAULT 2,
  season_capacity      INTEGER,
  season_start_month   INTEGER,
  season_end_month     INTEGER,
  active               INTEGER DEFAULT 1,
  sort_order           INTEGER DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT
);

CREATE INDEX IF NOT EXISTS age_groups_code_idx         ON age_groups(code);
CREATE INDEX IF NOT EXISTS age_groups_active_idx       ON age_groups(active);
CREATE INDEX IF NOT EXISTS age_groups_booking_type_idx ON age_groups(booking_type);

-- ------------------------------------------------------------
-- bookings
-- Taster session bookings only (booking_type = 'taster').
-- age_group_id denormalised for reporting stability.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  enquiry_id      TEXT NOT NULL,
  invite_id       TEXT,
  age_group_id    TEXT NOT NULL,
  session_date    TEXT NOT NULL,
  session_time    TEXT,
  status          TEXT DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','cancelled','attended','no_show')),
  attendance_note TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT,
  environment     TEXT DEFAULT 'production',
  FOREIGN KEY (enquiry_id)   REFERENCES enquiries(id),
  FOREIGN KEY (invite_id)    REFERENCES invites(id),
  FOREIGN KEY (age_group_id) REFERENCES age_groups(id)
);

CREATE INDEX IF NOT EXISTS bookings_date_idx          ON bookings(session_date);
CREATE INDEX IF NOT EXISTS bookings_ag_date_idx       ON bookings(age_group_id, session_date);
CREATE INDEX IF NOT EXISTS bookings_enquiry_idx       ON bookings(enquiry_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx        ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_env_idx           ON bookings(environment);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_invite_date_uniq
  ON bookings(invite_id, session_date) WHERE invite_id IS NOT NULL;

-- ------------------------------------------------------------
-- academy_seasons
-- One row per Academy season, typically April-August annually.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academy_seasons (
  id           TEXT PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  label        TEXT NOT NULL,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  capacity     INTEGER NOT NULL DEFAULT 40,
  status       TEXT NOT NULL DEFAULT 'upcoming'
               CHECK (status IN ('upcoming','open','closed','archived')),
  age_group_id TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  FOREIGN KEY (age_group_id) REFERENCES age_groups(id)
);

CREATE INDEX IF NOT EXISTS academy_seasons_status_idx    ON academy_seasons(status);
CREATE INDEX IF NOT EXISTS academy_seasons_ag_idx        ON academy_seasons(age_group_id);

-- ------------------------------------------------------------
-- academy_waitlist
-- One row per enquiry per season they are considered for.
-- Athletes can appear across multiple seasons via roll-over.
--
-- position: FCFS order within a season (lower = earlier).
-- is_returning: 1 if they attended the previous season.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academy_waitlist (
  id                         TEXT PRIMARY KEY,
  enquiry_id                 TEXT NOT NULL,
  season_id                  TEXT,
  token                      TEXT UNIQUE NOT NULL,
  position                   INTEGER,
  status                     TEXT NOT NULL DEFAULT 'waiting'
                             CHECK (status IN (
                               'waiting','invited','accepted',
                               'declined','ineligible','withdrawn'
                             )),
  is_returning               INTEGER DEFAULT 0,
  rolled_over_from_season_id TEXT,
  invited_at                 TEXT,
  responded_at               TEXT,
  response                   TEXT CHECK (response IN ('yes','no',NULL)),
  send_attempts              INTEGER DEFAULT 0,
  last_send_error            TEXT,
  created_at                 TEXT NOT NULL,
  environment                TEXT DEFAULT 'production',
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id),
  FOREIGN KEY (season_id)  REFERENCES academy_seasons(id)
);

CREATE INDEX IF NOT EXISTS acad_wl_enquiry_idx  ON academy_waitlist(enquiry_id);
CREATE INDEX IF NOT EXISTS acad_wl_season_idx   ON academy_waitlist(season_id);
CREATE INDEX IF NOT EXISTS acad_wl_token_idx    ON academy_waitlist(token);
CREATE INDEX IF NOT EXISTS acad_wl_status_idx   ON academy_waitlist(status);
CREATE INDEX IF NOT EXISTS acad_wl_env_idx      ON academy_waitlist(environment);
CREATE INDEX IF NOT EXISTS acad_wl_position_idx ON academy_waitlist(season_id, position);

-- ------------------------------------------------------------
-- email_templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_templates (
  id           TEXT PRIMARY KEY,
  key          TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  html         TEXT NOT NULL,
  text_content TEXT,
  variables    TEXT DEFAULT '[]',
  active       INTEGER DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS email_templates_key_idx    ON email_templates(key);
CREATE INDEX IF NOT EXISTS email_templates_active_idx ON email_templates(active);

-- ------------------------------------------------------------
-- membership_otps
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_otps (
  id          TEXT PRIMARY KEY,
  enquiry_id  TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL,
  used_at     TEXT,
  environment TEXT DEFAULT 'production',
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id)
);

CREATE INDEX IF NOT EXISTS membership_otps_token_idx  ON membership_otps(token);
CREATE INDEX IF NOT EXISTS membership_otps_enq_idx    ON membership_otps(enquiry_id);
CREATE INDEX IF NOT EXISTS membership_otps_env_idx    ON membership_otps(environment);

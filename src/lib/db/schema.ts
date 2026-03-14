// ============================================================
// EGAC Platform — Database Schema Types
// src/lib/db/schema.ts
// ============================================================

// ------------------------------------------------------------
// Enquiry
// ------------------------------------------------------------
export interface Enquiry {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  phone: string | null;
  dob: string | null;
  source: string;
  processed: number;
  age_group_id: string | null;
  note: string | null;
  raw_payload: string | null;
  events: string;
  invite_id: string | null;
  environment: Environment;
}

export interface EnquiryInsert {
  id: string;
  created_at: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  dob?: string | null;
  source?: string;
  processed?: number;
  age_group_id?: string | null;
  note?: string | null;
  raw_payload?: string | null;
  events?: string;
  invite_id?: string | null;
  environment: Environment;
}

export interface EnquiryEvent {
  type: EnquiryEventType;
  timestamp: string;
  [key: string]: unknown;
}

export type EnquiryEventType =
  | 'academy_waitlist_added'
  | 'academy_response_received'
  | 'booking_invite_sent'
  | 'booking_created'
  | 'invite_expired'
  | 'invite_resent'
  | 'attendance_recorded'
  | 'membership_invite_sent'
  | 'reminder_sent';

export interface EnquiryFilters {
  status?: 'pending' | 'processed' | 'academy';
  search?: string;
  limit?: number;
  offset?: number;
  environment?: Environment;
}

// ------------------------------------------------------------
// Invite (taster booking only — not used for Academy)
// ------------------------------------------------------------
export interface Invite {
  id: string;
  token: string;
  enquiry_id: string;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  status: InviteStatus;
  send_attempts: number;
  last_send_error: string | null;
  environment: Environment;
}

export type InviteStatus = 'pending' | 'sent' | 'accepted' | 'expired';

// ------------------------------------------------------------
// Age Group
// Single source of truth for all age group configuration.
// booking_type drives the enquiry routing logic.
// ------------------------------------------------------------
export interface AgeGroup {
  id: string;
  code: string;
  label: string;
  booking_type: 'taster' | 'waitlist';
  age_min_aug31: number;
  age_max_aug31: number;
  session_days: string; // JSON array: '["Tuesday"]'
  session_time: string | null;
  capacity_per_session: number | null;
  season_capacity: number | null;
  season_start_month: number | null;
  season_end_month: number | null;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}

// ------------------------------------------------------------
// Booking (taster sessions only)
// ------------------------------------------------------------
export interface Booking {
  id: string;
  enquiry_id: string;
  invite_id: string | null;
  age_group_id: string;
  session_date: string;
  session_time: string | null;
  status: BookingStatus;
  attendance_note: string | null;
  created_at: string;
  updated_at: string | null;
  environment: Environment;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'attended' | 'no_show';

// ------------------------------------------------------------
// Academy Season
// ------------------------------------------------------------
export interface AcademySeason {
  id: string;
  code: string;
  label: string;
  start_date: string;
  end_date: string;
  capacity: number;
  status: AcademySeasonStatus;
  age_group_id: string;
  created_at: string;
  updated_at: string | null;
}

export type AcademySeasonStatus = 'upcoming' | 'open' | 'closed' | 'archived';

// ------------------------------------------------------------
// Academy Waitlist
// ------------------------------------------------------------
export interface AcademyWaitlistEntry {
  id: string;
  enquiry_id: string;
  season_id: string | null;
  token: string;
  position: number | null;
  status: AcademyWaitlistStatus;
  is_returning: number;
  rolled_over_from_season_id: string | null;
  invited_at: string | null;
  responded_at: string | null;
  response: 'yes' | 'no' | null;
  send_attempts: number;
  last_send_error: string | null;
  created_at: string;
  environment: Environment;
}

export type AcademyWaitlistStatus =
  | 'waiting'
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'ineligible'
  | 'withdrawn';

// ------------------------------------------------------------
// Email Template
// ------------------------------------------------------------
export interface EmailTemplate {
  id: string;
  key: EmailTemplateKey;
  name: string;
  subject: string;
  html: string;
  text_content: string | null;
  variables: string;
  active: number;
  created_at: string;
  updated_at: string | null;
}

export interface EmailTemplateInsert {
  id: string;
  key: string;
  name: string;
  subject: string;
  html: string;
  text_content?: string | null;
  variables?: string;
  created_at: string;
}

export type EmailTemplateKey =
  | 'booking_invite'
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'academy_waitlist'
  | 'academy_invite'
  | 'membership_invite';

// ------------------------------------------------------------
// Membership OTP
// ------------------------------------------------------------
export interface MembershipOtp {
  id: string;
  enquiry_id: string;
  token: string;
  created_at: string;
  used_at: string | null;
  environment: Environment;
}

// ------------------------------------------------------------
// System Config (KV-backed)
// ------------------------------------------------------------
export interface SystemConfig {
  weeks_ahead_booking: string;
  site_name: string;
  site_url: string;
  email_from: string;
  venue_name: string;
  venue_address: string;
  admin_email: string;
  academy_max_age: string;
  capacity_per_slot: string;
}

export type SystemConfigKey = keyof SystemConfig;

// ------------------------------------------------------------
// Shared
// ------------------------------------------------------------
export type Environment = 'development' | 'staging' | 'production';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  RESEND_API_KEY: string;
  ADMIN_TOKEN: string;
  ADMIN_EMAIL: string;
  EMAIL_FROM: string;
  CRON_SECRET: string;
  APP_ENV: Environment;
  NODE_ENV?: string;
}

export interface BookingConfirmation {
  enquiry: Enquiry;
  booking: Booking;
  ageGroupLabel: string;
  venueName: string;
  calendarUrl: string;
}

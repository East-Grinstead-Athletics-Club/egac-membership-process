// ============================================================
// EGAC Platform — Database Schema Types
// src/lib/db/schema.ts
//
// These interfaces mirror the D1 tables exactly.
// All date fields are ISO 8601 strings (SQLite has no native date type).
// Boolean fields are 0 | 1 integers in D1; typed as number here so
// TypeScript consumers can use standard truthiness checks.
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
  interest: 'junior_athletics' | 'academy' | 'general' | null;
  training_days: string;       // JSON array string: '["Tuesday"]'
  dob: string | null;          // YYYY-MM-DD
  source: string;
  processed: number;           // 0 | 1
  note: string | null;
  raw_payload: string | null;  // JSON string
  events: string;              // JSON array of EnquiryEvent
  invite_id: string | null;
  environment: Environment;
}

export interface EnquiryInsert {
  id: string;
  created_at: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  interest?: Enquiry['interest'];
  training_days?: string;
  dob?: string | null;
  source?: string;
  processed?: number;
  note?: string | null;
  raw_payload?: string | null;
  events?: string;
  invite_id?: string | null;
  environment: Environment;
}

export interface EnquiryEvent {
  type: EnquiryEventType;
  timestamp: string;           // ISO datetime
  [key: string]: unknown;      // Additional event-specific data
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
  search?: string;             // matches email or name
  limit?: number;
  offset?: number;
  environment?: Environment;
}

// ------------------------------------------------------------
// Invite
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

export interface InviteInsert {
  id: string;
  token: string;
  enquiry_id: string;
  created_at: string;
  environment: Environment;
}

// ------------------------------------------------------------
// Booking
// ------------------------------------------------------------
export interface Booking {
  id: string;
  enquiry_id: string;
  invite_id: string | null;
  session_date: string;        // YYYY-MM-DD
  slot: SlotCode;
  session_time: string | null; // HH:MM
  status: BookingStatus;
  attendance_note: string | null;
  created_at: string;
  updated_at: string | null;
  environment: Environment;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'attended' | 'no_show';
export type SlotCode = 'u13' | 'u15plus';

export interface BookingInsert {
  id: string;
  enquiry_id: string;
  invite_id?: string | null;
  session_date: string;
  slot: SlotCode;
  session_time?: string | null;
  created_at: string;
  environment: Environment;
}

// ------------------------------------------------------------
// Academy Invitation
// ------------------------------------------------------------
export interface AcademyInvitation {
  id: string;
  enquiry_id: string;
  token: string;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  response: 'yes' | 'no' | null;
  status: AcademyInvitationStatus;
  environment: Environment;
}

export type AcademyInvitationStatus = 'pending' | 'sent' | 'responded' | 'failed';

// ------------------------------------------------------------
// Age Group
// ------------------------------------------------------------
export interface AgeGroup {
  id: string;
  code: SlotCode;
  label: string;
  min_age: number;
  max_age: number | null;
  session_day: string | null;
  session_time: string | null;  // HH:MM
  capacity_per_session: number;
  active: number;               // 0 | 1
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}

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
  variables: string;            // JSON array of string variable names
  active: number;               // 0 | 1
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
// System Config (KV-backed, not a D1 table)
// ------------------------------------------------------------
export interface SystemConfig {
  academy_max_age: string;        // default "10"
  weeks_ahead_booking: string;    // default "8"
  capacity_per_slot: string;      // default "2"
  site_name: string;              // default "EGAC"
  site_url: string;               // e.g. "https://egac.pages.dev"
  email_from: string;             // e.g. "noreply@egac.co.uk"
  venue_name: string;
  venue_address: string;
  admin_email: string;
}

export type SystemConfigKey = keyof SystemConfig;

// ------------------------------------------------------------
// Shared
// ------------------------------------------------------------
export type Environment = 'development' | 'staging' | 'production';

// Cloudflare Worker Env bindings — extend as needed
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

// Booking confirmation shape passed to email
export interface BookingConfirmation {
  enquiry: Enquiry;
  booking: Booking;
  slotLabel: string;
  venueName: string;
  calendarUrl: string;
}

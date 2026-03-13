// ============================================================
// EGAC Platform — Enquiry Business Logic
// src/lib/business/enquiry.ts
//
// Pure functions for building, validating, and routing enquiries.
// No database access — all I/O happens in the repository layer.
// ============================================================

import {
  isAcademyEligible,
  ACADEMY_INTAKE_DATE,
  DEFAULT_ACADEMY_MAX_AGE,
} from './age.js';
import type { EnquiryInsert } from '../db/schema.js';
import { generateId, now } from '../db/client.js';

// ------------------------------------------------------------
// Enquiry input shape — what arrives from the public form
// ------------------------------------------------------------
export interface EnquiryFormData {
  contact_name: string;
  contact_email: string;
  phone?: string;
  dob?: string;                          // YYYY-MM-DD
  interest?: 'junior_athletics' | 'academy' | 'general';
  training_days?: string[];
  source?: string;
}

// ------------------------------------------------------------
// validateEnquiryData
// Throws a descriptive Error for any validation failure.
// Called before any database write.
// ------------------------------------------------------------
export function validateEnquiryData(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be a JSON object');
  }

  const d = data as Record<string, unknown>;

  // Required fields
  if (!d.contact_name || typeof d.contact_name !== 'string' || !d.contact_name.trim()) {
    throw new Error('contact_name is required');
  }

  if (!d.contact_email || typeof d.contact_email !== 'string' || !d.contact_email.trim()) {
    throw new Error('contact_email is required');
  }

  // Email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(d.contact_email as string)) {
    throw new Error('contact_email must be a valid email address');
  }

  // DOB — optional but validated if present
  if (d.dob !== undefined && d.dob !== null && d.dob !== '') {
    if (typeof d.dob !== 'string') {
      throw new Error('dob must be a string in YYYY-MM-DD format');
    }
    const date = new Date(d.dob as string);
    if (isNaN(date.getTime())) {
      throw new Error('dob must be a valid date in YYYY-MM-DD format');
    }

    // Sanity check: age between 4 and 100
    const today = new Date();
    const age = today.getFullYear() - date.getFullYear();
    if (age < 4 || age > 100) {
      throw new Error('dob does not represent a plausible age (must be between 4 and 100 years ago)');
    }
  }

  // interest — optional but must be one of the allowed values if present
  const allowedInterests = ['junior_athletics', 'academy', 'general'];
  if (d.interest !== undefined && d.interest !== null && d.interest !== '') {
    if (!allowedInterests.includes(d.interest as string)) {
      throw new Error(`interest must be one of: ${allowedInterests.join(', ')}`);
    }
  }

  // training_days — optional array
  if (d.training_days !== undefined) {
    if (!Array.isArray(d.training_days)) {
      throw new Error('training_days must be an array');
    }
  }

  // Phone — optional, no format enforcement (international numbers vary too much)
  if (d.phone !== undefined && d.phone !== null && typeof d.phone !== 'string') {
    throw new Error('phone must be a string');
  }
}

// ------------------------------------------------------------
// buildEnquiryPayload
// Converts validated form data into a DB-ready EnquiryInsert.
// Sanitises strings, sets defaults, generates ID and timestamp.
// ------------------------------------------------------------
export function buildEnquiryPayload(
  data: EnquiryFormData,
  environment: 'development' | 'staging' | 'production' = 'production'
): EnquiryInsert {
  return {
    id: generateId('enq'),
    created_at: now(),
    name: data.contact_name.trim(),
    email: data.contact_email.trim().toLowerCase(),
    phone: data.phone?.trim() || null,
    interest: data.interest || null,
    training_days: JSON.stringify(data.training_days ?? []),
    dob: data.dob?.trim() || null,
    source: data.source || 'website',
    processed: 0,
    note: null,
    raw_payload: null,   // caller can set this after building
    events: '[]',
    invite_id: null,
    environment,
  };
}

// ------------------------------------------------------------
// routeEnquiry
// Determines whether an enquiry goes to the academy waiting
// list or the regular booking flow.
//
// Rule: if athlete will be <= academyMaxAge on intakeDate → 'academy'
//       otherwise → 'booking'
// Returns 'booking' when no DOB is provided (can't route to academy
// without knowing the child's age).
// ------------------------------------------------------------
export function routeEnquiry(
  dob: string | null | undefined,
  options: {
    intakeDate?: string;
    academyMaxAge?: number;
  } = {}
): 'academy' | 'booking' {
  const intakeDate = options.intakeDate ?? ACADEMY_INTAKE_DATE;
  const maxAge = options.academyMaxAge ?? DEFAULT_ACADEMY_MAX_AGE;

  if (!dob) return 'booking';

  return isAcademyEligible(dob, intakeDate, maxAge) ? 'academy' : 'booking';
}

// ------------------------------------------------------------
// sanitiseString
// Trims and normalises whitespace. Used for display values.
// ------------------------------------------------------------
export function sanitiseString(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().replace(/\s+/g, ' ');
}

// ------------------------------------------------------------
// formatEnquiryForEmail
// Extracts display-friendly values for use in email templates.
// ------------------------------------------------------------
export function formatEnquiryForEmail(enquiry: {
  name: string | null;
  email: string;
  dob: string | null;
}): {
  contact_name: string;
  parent_name: string;
  child_name: string;
} {
  const name = sanitiseString(enquiry.name) || 'there';

  return {
    contact_name: name,
    // For academy emails we address the parent — use the same name
    // until we have separate parent/child name fields
    parent_name: name,
    child_name: name,
  };
}

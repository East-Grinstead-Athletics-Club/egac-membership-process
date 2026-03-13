// ============================================================
// EGAC Platform — Enquiry Business Logic
// src/lib/business/enquiry.ts
// ============================================================

import type { AgeGroupConfig } from './age.js';

export interface EnquiryFormData {
  contact_name: string;
  contact_email: string;
  phone?: string;
  dob?: string;
  source?: string;
}

// ------------------------------------------------------------
// validateEnquiryData
// Throws a descriptive Error on any validation failure.
// ------------------------------------------------------------
export function validateEnquiryData(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be a JSON object');
  }

  const d = data as Record<string, unknown>;

  if (!d.contact_name || typeof d.contact_name !== 'string' || !d.contact_name.trim()) {
    throw new Error('contact_name is required');
  }

  if (!d.contact_email || typeof d.contact_email !== 'string' || !d.contact_email.trim()) {
    throw new Error('contact_email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(d.contact_email as string)) {
    throw new Error('contact_email must be a valid email address');
  }

  if (d.dob !== undefined && d.dob !== null && d.dob !== '') {
    if (typeof d.dob !== 'string') {
      throw new Error('dob must be a string in YYYY-MM-DD format');
    }
    const date = new Date(d.dob as string);
    if (isNaN(date.getTime())) {
      throw new Error('dob must be a valid date in YYYY-MM-DD format');
    }
    const today = new Date();
    const age = today.getFullYear() - date.getFullYear();
    if (age < 4 || age > 100) {
      throw new Error(
        'dob does not represent a plausible age (must be between 4 and 100 years ago)'
      );
    }
  }

  if (d.phone !== undefined && d.phone !== null && typeof d.phone !== 'string') {
    throw new Error('phone must be a string');
  }
}

// ------------------------------------------------------------
// routeEnquiry
// Given the resolved age group (from D1), returns the path.
// 'waitlist' age groups go to the Academy waitlist.
// 'taster' age groups get a booking invite.
// No age group (null DOB or out of range) defaults to 'taster'.
// ------------------------------------------------------------
export function routeEnquiry(ageGroup: AgeGroupConfig | null): 'taster' | 'waitlist' {
  if (!ageGroup) return 'taster';
  return ageGroup.booking_type;
}

export function sanitiseString(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function formatEnquiryForEmail(enquiry: {
  name: string | null;
  email: string;
  dob: string | null;
}): { contact_name: string; parent_name: string; child_name: string } {
  const name = sanitiseString(enquiry.name) || 'there';
  return { contact_name: name, parent_name: name, child_name: name };
}

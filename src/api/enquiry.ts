// ============================================================
// EGAC Platform — POST /api/enquiry
// src/api/enquiry.ts
// ============================================================

import { ok, err, corsPreflightResponse, parseBody } from './helpers.js';
import { validateEnquiryData, routeEnquiry } from '../lib/business/enquiry.js';
import { getNextNTuesdayDates } from '../lib/business/age.js';
import {
  insertEnquiry,
  appendEnquiryEvent,
  updateEnquiry,
} from '../lib/repositories/enquiries.js';
import { createInviteForEnquiry, markInviteSent } from '../lib/repositories/invites.js';
import { addToWaitlist, markWaitlistInviteSent } from '../lib/repositories/academy.js';
import { sendBookingInvite, sendAcademyWaitlist } from '../lib/email/templates.js';
import { getConfig } from '../lib/config.js';
import { generateId } from '../lib/db/client.js';
import { listAgeGroups } from '../lib/repositories/age-groups.js';
import { resolveAgeGroup } from '../lib/business/age.js';
import type { Env } from '../lib/db/schema.js';

interface PublicEnquiryBody {
  enquiry_for?: 'self' | 'other';
  enquirer_name?: string;
  enquirer_email?: string;
  enquirer_phone?: string;
  athlete_name?: string;
  athlete_dob?: string;
  name?: string;
  email?: string;
  phone?: string;
  dob?: string;
  interest?: string;
  training_days?: string[];
  source?: string;
}

async function parsePublicEnquiryBody(request: Request): Promise<PublicEnquiryBody | null> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/json') || !contentType) {
    return parseBody<PublicEnquiryBody>(request);
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const form = await request.formData();
      const getString = (key: string): string | undefined => {
        const value = form.get(key);
        return typeof value === 'string' ? value : undefined;
      };

      const trainingDays = form
        .getAll('training_days')
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        enquiry_for: getString('enquiry_for') as 'self' | 'other' | undefined,
        enquirer_name: getString('enquirer_name'),
        enquirer_email: getString('enquirer_email'),
        enquirer_phone: getString('enquirer_phone'),
        athlete_name: getString('athlete_name'),
        athlete_dob: getString('athlete_dob'),
        name: getString('name'),
        email: getString('email'),
        phone: getString('phone'),
        dob: getString('dob'),
        interest: getString('interest'),
        training_days: trainingDays.length > 0 ? trainingDays : undefined,
        source: getString('source'),
      };
    } catch {
      return null;
    }
  }

  return parseBody<PublicEnquiryBody>(request);
}

export async function handleEnquiry(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return corsPreflightResponse();
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parsePublicEnquiryBody(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const enquiryFor = body.enquiry_for === 'other' ? 'other' : 'self';
  const enquirerName = String(body.enquirer_name ?? body.name ?? '').trim();
  const enquirerEmail = String(body.enquirer_email ?? body.email ?? '')
    .toLowerCase()
    .trim();
  const enquirerPhone = String(body.enquirer_phone ?? body.phone ?? '').trim();
  const athleteName = String(
    body.athlete_name ?? (enquiryFor === 'self' ? enquirerName : '')
  ).trim();
  const athleteDob = String(body.athlete_dob ?? body.dob ?? '').trim();

  if (!athleteDob) {
    return err('athlete_dob is required', 422, 'VALIDATION_ERROR', true);
  }

  if (enquiryFor === 'other' && !athleteName) {
    return err('athlete_name is required', 422, 'VALIDATION_ERROR', true);
  }

  // Normalise to the field names validateEnquiryData expects
  try {
    validateEnquiryData({
      contact_name: enquirerName,
      contact_email: enquirerEmail,
      dob: athleteDob,
      interest: body.interest,
      training_days: body.training_days,
      phone: enquirerPhone,
    });
  } catch (validationErr) {
    const message = validationErr instanceof Error ? validationErr.message : 'Validation error';
    return err(message, 422, 'VALIDATION_ERROR', true);
  }

  const config = await getConfig(env);
  const environment = env.APP_ENV ?? 'development';
  const email = enquirerEmail;

  const enquiry = await insertEnquiry(
    {
      id: generateId('enq'),
      created_at: new Date().toISOString(),
      name: enquirerName || null,
      email,
      phone: enquirerPhone || null,
      dob: athleteDob || null,
      source: body.source ? String(body.source) : 'website',
      note: enquiryFor === 'other' ? `Enquiring about: ${athleteName}` : null,
      raw_payload: JSON.stringify({
        ...body,
        enquiry_for: enquiryFor,
        enquirer_name: enquirerName,
        enquirer_email: enquirerEmail,
        enquirer_phone: enquirerPhone || null,
        athlete_name: athleteName || null,
        athlete_dob: athleteDob,
      }),
      events: '[]',
      processed: 0,
      environment,
    },
    env
  );

  // Resolve the athlete's age group from D1
  const allGroups = await listAgeGroups(env);
  const ageGroup = resolveAgeGroup(enquiry.dob, new Date().toISOString().split('T')[0], allGroups);

  // Store resolved age group on the enquiry
  if (ageGroup) {
    await updateEnquiry(enquiry.id, { age_group_id: ageGroup.id }, env);
  }

  const path = routeEnquiry(ageGroup);

  try {
    if (path === 'waitlist') {
      const invitation = await addToWaitlist(enquiry.id, env);
      const result = await sendAcademyWaitlist(enquiry, invitation, env);

      if (result.success) {
        await markWaitlistInviteSent(invitation.id, env);
        await appendEnquiryEvent(enquiry.id, { type: 'academy_waitlist_added' }, env);
      } else {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'academy_email_failed',
            enquiry_id: enquiry.id,
            error: result.error,
          })
        );
      }

      await updateEnquiry(enquiry.id, { processed: 1 }, env);
    } else {
      const weeksAhead = parseInt(config.weeks_ahead_booking ?? '8', 10);
      const availableDates = getNextNTuesdayDates(weeksAhead);
      const invite = await createInviteForEnquiry(enquiry.id, env);
      const result = await sendBookingInvite(enquiry, invite, availableDates, env);

      if (result.success) {
        await markInviteSent(invite.id, env);
        await appendEnquiryEvent(enquiry.id, { type: 'booking_invite_sent' }, env);
        await updateEnquiry(enquiry.id, { invite_id: invite.id, processed: 1 }, env);
      } else {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'invite_email_failed',
            enquiry_id: enquiry.id,
            invite_id: invite.id,
            error: result.error,
          })
        );
        await updateEnquiry(enquiry.id, { invite_id: invite.id }, env);
      }
    }
  } catch (sendError) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'enquiry_post_processing_failed',
        enquiry_id: enquiry.id,
        error: sendError instanceof Error ? sendError.message : String(sendError),
      })
    );
  }

  return ok({ message: 'Enquiry received' }, 201, true);
}

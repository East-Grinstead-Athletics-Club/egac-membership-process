// ============================================================
// EGAC Platform — POST /api/enquiry
// src/api/enquiry.ts
// ============================================================

import { ok, err, corsPreflightResponse, parseBody } from './helpers.js';
import { validateEnquiryData, routeEnquiry } from '../lib/business/enquiry.js';
import { getNextNTuesdayDates } from '../lib/business/age.js';
import {
  insertEnquiry,
  getEnquiryByEmail,
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
  name?: string;
  email?: string;
  phone?: string;
  dob?: string;
  interest?: string;
  training_days?: string[];
  source?: string;
}

export async function handleEnquiry(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return corsPreflightResponse();
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<PublicEnquiryBody>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  // Normalise to the field names validateEnquiryData expects
  try {
    validateEnquiryData({
      contact_name: body.name,
      contact_email: body.email,
      dob: body.dob,
      interest: body.interest,
      training_days: body.training_days,
      phone: body.phone,
    });
  } catch (validationErr) {
    const message = validationErr instanceof Error ? validationErr.message : 'Validation error';
    return err(message, 422, 'VALIDATION_ERROR', true);
  }

  const config = await getConfig(env);
  const environment = env.APP_ENV ?? 'development';
  const email = String(body.email ?? '')
    .toLowerCase()
    .trim();

  // Duplicate check
  const existing = await getEnquiryByEmail(email, env);
  if (existing && existing.processed === 1) {
    return ok({ message: 'Enquiry received' }, 200, true);
  }

  const enquiry = await insertEnquiry(
    {
      id: generateId('enq'),
      created_at: new Date().toISOString(),
      name: body.name ? String(body.name).trim() : null,
      email,
      phone: body.phone ? String(body.phone) : null,
      dob: body.dob ? String(body.dob) : null,
      source: body.source ? String(body.source) : 'website',
      raw_payload: JSON.stringify(body),
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

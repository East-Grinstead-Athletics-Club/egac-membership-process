// ============================================================
// EGAC Platform — POST /api/academy/respond
// src/api/academy.ts
//
// Records a parent's yes/no response to an academy invitation.
// Called when a parent clicks the link in their waitlist email.
//
// Flow:
//   1. Validate token exists and hasn't been used
//   2. Record the response (yes | no)
//   3. Append event to the enquiry log
//   4. Return confirmation
// ============================================================

import { ok, err, parseBody } from './helpers.js';
import {
  getAcademyInvitationByToken,
  processAcademyResponse,
} from '../lib/repositories/academy.js';
import { appendEnquiryEvent } from '../lib/repositories/enquiries.js';
import type { Env } from '../lib/db/schema.js';

// ------------------------------------------------------------
// handleAcademyRespond
// ------------------------------------------------------------
export async function handleAcademyRespond(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const body = await parseBody<{ token: string; response: string }>(request);
  if (!body) return err('Request body is required', 400, 'INVALID_JSON');

  const { token, response } = body;

  if (!token) return err('Token is required', 422, 'MISSING_TOKEN');
  if (!response) return err('Response is required', 422, 'MISSING_RESPONSE');
  if (response !== 'yes' && response !== 'no') {
    return err('Response must be yes or no', 422, 'INVALID_RESPONSE');
  }

  // Look up invitation
  const invitation = await getAcademyInvitationByToken(token, env);
  if (!invitation) return err('Invitation not found', 404, 'INVITATION_NOT_FOUND');

  // Idempotency — already responded
  if (invitation.status === 'responded') {
    return ok({
      message: `Your response (${invitation.response}) has already been recorded. Thank you.`,
      already_responded: true,
    });
  }

  // Record the response
  await processAcademyResponse(token, response, env);

  // Log to enquiry event trail
  await appendEnquiryEvent(
    invitation.enquiry_id,
    { type: 'academy_response_received', response },
    env
  );

  const message =
    response === 'yes'
      ? "Thank you — we've noted your interest. We'll be in touch when a place becomes available."
      : "Thank you for letting us know. We've removed you from the waiting list.";

  return ok({ message, response });
}

# Snagging List

## Workflow

- Add each new update under a new heading: `## Phase n`
- Keep issue numbering local to each phase (start at 1 each phase)
- For each issue, include:
	- Problem summary
	- Expected outcome
	- Current status (`Open`, `In Progress`, `Fixed`, `Verified`)
	- Notes (optional)
- When fixes are completed, keep the issue in place and update status (do not delete history)

### Phase Template

## Phase n

1. [Open] Issue title
	 - Expected:
	 - Notes:

## Phase 1

1. [In Progress] Site and venue
        - Expected: To be able to update and save changes
        - Notes: Settings save flow exists and has been expanded; needs live user verification after deploy.

2.  [Fixed] Age groups
        - Expected: to be an admin function that these can be adjusted / updated and and would update age groups across the site
        Notes: Added editable Age groups admin section in Settings with save handling to `age_groups` table.

3. [Fixed] Attendance
         - Expected: When someone is marked as attended and a membership form is sent, they remain listed in the calendar and the enquiry dashboad updated
        - Notes: Updated upcoming booking query to include `attended` and `no_show`; enquiry dashboard now shows latest booking status.

4. [Fixed] Non-attendence
        - Expected: They remain listed in the calendar and the enquiry board updated
        - Notes: No-show status now remains visible in bookings calendar; enquiry list reflects no-show/attended/confirmed.

5. [Open] Membership form
         - Expected:  When someone receives an invitation to join the club an email is not sent with a link to a non-existent page. A form pre-filled with info already submitted will be sent, and they will be invited to complete the membership form
         Notes: 

Membership Joining Form
Consent *

Athlete details
Title *
First Name *
Last Name *
Date of birth *

Sex at birth *
Address line 1 *
Address line 2 *
Address line 3
Address line 4
Post Code *
Mobile phone number *
Join club WhatsApp? * (Yes/No)
Please select if you wish to join the club WhatsApp community for club communications. This is our main source to keep you up to date with last minute changes.
Email Address *
Home phone number
Consent * (Yes/No) cannot proceed if Yes is not selected
The member is aware that their data is being passed to the Athletics Governing Bodies and will be processed in accordance with the privacy statement

Medical information
Medication
Illness & injuries
Allergies
Emergency contact details
Emergency contact name *
Emergency contact mobile number *
Relationship to athlete *
Emergency contact details (2nd person)
Emergency contact number (2nd person)
Relationship to athlete (2nd person)

Is there an existing family member in the club? *
Is there an existing family member in the club?
I/we have read and agree to abide by the Club policies and codes of conduct * (Yes/No) - cannot proceed if Yes is no selected

Yes, I as a parent/carer and/or athlete agree with the clubs policies and the codes of conduct for both the club and England Athletics.

6. [Open] - Academy waiting list
        Expected: If you are considered U11, you are added to the Academy waiting list and a notification email is sent out saying "We run an Academy for U11 children and operate a waiting list for thos interested. Once space becomes available, you will be contacted and offered a place." - this needs to be included in the list of editable email templates.
        Notes: 
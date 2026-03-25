This is an Astro project deployed on Cloudflare Workers via Wrangler. The DB layer is in `db/`. 
Here are the specific files likely involved:

src/api/admin/bookings.ts
src/api/admin/reports.ts
src/api/academy.ts
src/api/booking.ts
src/api/enquiry.ts
src/api/cron/send-reminders.ts
src/workers/coach-app.js
src/lib/email/templates.ts
src/lib/repositories/age-groups.ts
src/lib/repositories/academy.ts
src/lib/repositories/enquiries.ts
src/lib/repositories/bookings.ts
src/lib/business/age.ts
src/lib/business/booking.ts
src/lib/business/templates.ts
src/lib/business/enquiry.ts
src/lib/db/schema.ts
src/lib/config.ts
tests/unit/api.test.ts
tests/unit/admin.test.ts
tests/unit/email.test.ts
tests/unit/business.test.ts
tests/unit/cron.test.ts
tests/unit/repositories.test.ts
tests/unit/db.test.ts

Please make the following changes:

Age groups — rename U11→U12 (Academy, school years 5–6), U13→U14 (years 7–8), U15→U16 (years 9–10), U17→U18 (years 11–12). Update all labels, database seeds/enums, and any display strings.
Admin portal — add a "Training Location" setting that can be configured per training day (Tuesday, Thursday, Saturday). Store it so admins can update each day's location independently.
Academy joining logic — when a new application comes in, calculate the applicant's school year from their DOB. If year 5 or 6: add to Academy waiting list, do NOT send the taster session invitation email. If below year 5: send a rejection email explaining the club accepts from year 5 upwards and invites them to reapply then. (Current behaviour wrongly sends a taster invite to year 5/6 — suppress that.)

Also update or add tests covering: (a) year 5/6 applicants go to waiting list with no taster email, (b) below year 5 applicants get the rejection email, (c) the taster email is not sent to year 5/6.
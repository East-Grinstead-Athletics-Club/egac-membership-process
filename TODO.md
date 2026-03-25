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

## Phase 2

1. The venue details are not showing a changed after being saved.
2. The varied location only show data can be added, they don't indicate the data has been saved.
3. If a child is calculated by DoB as being in year 4 or less, then the email sent back to them must be templated and thank them for their interest but state we are sorry and only able to register children from year 5 onwards
4. If a child is calculated as being in year 5 or 6, they need to show on the "Academy" page with the business logic that was built.

## Phase 3

5. When a booking session is confirmed, if it's a Tuesday, the notification must show the Training Location for Tuesday value from the Settings.
6. When a booking session is confirmed, if it's a Thursday, the notification must show the Training Location for Thursday value from the Settings.

## Phase 4

7. Replace "Thanks — check your email for a link to book your first session. It should arrive within a few minutes." after enquiry submission with "Thanks - check your email for a confirmation. It should arrive within a few minutes." Everything else remains the same.
8. This is an Astro + Cloudflare Workers project. I want to apply the design system from egac-website to the public-facing pages (enquiry, booking, acknowledgement, membership).
Copy the following from egac-website into this project:

The Tailwind config — paste contents — into tailwind.config.mjs
Create src/components/layout/Nav.astro using the Nav below, but replace the nav links with ones appropriate for the public egac site (Join, Book a Taster, Contact)
Create src/components/layout/Footer.astro using the Footer below, but remove the Directus dependency — use static fallback values only (tagline, email, social links hardcoded)
Create src/layouts/PublicLayout.astro matching the BaseLayout below, without the Directus site_settings fetch — just Nav, Footer, fonts, dark mode
Wrap these pages in PublicLayout: [list your public page files]

Nav source: [paste Nav.astro]
Footer source: [paste Footer.astro]
BaseLayout source: [paste BaseLayout.astro]

## Phase 5

9. The font is incorrect and it looks awful compared to egac-website
10. The "logo" in the top left should point to https://eastgrinsteadac.co.uk
11. Dark mode should be an icon, not the words
12. Book a taster isn't needed on the top of the page as this comes from the email sent out.
13. The look and feel isn't working properly on the acknowledgement page after the enquiry submission.
14. The look and feel isn't working properly on the booking taster session page when clicking on the link in the email.
15. Pages should all by default open on light mode.
16. Once booked in, the confirmation page is not looking at the Training Locations value in Settings on the Admin pages.
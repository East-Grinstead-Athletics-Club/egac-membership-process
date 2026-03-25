I need you to audit two projects and apply the egac-website design system to the public-facing pages of the egac project.

## Step 1 — Audit egac-website
Extract the complete design system:
- Colour palette (all CSS custom properties / Tailwind config values)
- Typography (font families, sizes, weights, line heights)
- Spacing scale
- Button styles (all variants)
- Form input styles (text fields, selects, textareas, checkboxes, radio buttons, error states)
- Navigation/header styles
- Card/container styles
- Any reusable component patterns (badges, alerts, dividers, etc.)
- Animations or transitions

## Step 2 — Audit egac (public-facing pages only)
Identify every public-facing page and component — specifically:
- Enquiry form
- Calendar booking pages/components
- Any other outside-facing pages (home, about, contact, etc.)
- Shared layout files (header, footer, nav) used by public pages
- Existing CSS/style files for these pages

DO NOT touch any admin pages, admin routes, admin components, or admin stylesheets.

## Step 3 — Apply the design system
For each public-facing file identified in Step 2:
- Replace colours, fonts, spacing, and component styles to match egac-website exactly
- Apply egac-website button styles to all buttons
- Apply egac-website form styles to all form inputs, labels, and error states
- Apply egac-website nav/header styles to the public layout
- Ensure the calendar booking UI feels visually identical to egac-website pages
- Preserve all existing functionality — only change styles, not logic

## Step 4 — Create a shared stylesheet (if one doesn't exist)
If the egac project doesn't already have a shared public stylesheet, create one (e.g. public.css or similar) that imports/defines the design tokens from egac-website, so future public pages automatically inherit the correct styles.

## Rules
- Do not modify any admin routes, admin components, or admin-only stylesheets
- Do not break any existing functionality
- If a framework mismatch makes direct copy-paste impossible, adapt the styles faithfully
- Summarise every file changed and why at the end
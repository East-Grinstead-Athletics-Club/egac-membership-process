### Colour Tokens (Tailwind config — do not modify)

```js
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-primary-container": "#cdddff",
        "on-tertiary": "#ffffff",
        "primary-fixed": "#d7e3ff",
        "on-primary-fixed-variant": "#00458f",
        "on-secondary-fixed": "#211b00",
        "surface-dim": "#d9dadb",
        "outline": "#727783",
        "tertiary": "#7a3500",
        "on-secondary": "#ffffff",
        "on-tertiary-container": "#ffd3bd",
        "primary-container": "#145fba",
        "secondary-fixed": "#fddc31",
        "secondary-container": "#fddc31",
        "surface-tint": "#0e5cb7",
        "background": "#f8f9fa",
        "inverse-primary": "#abc7ff",
        "on-tertiary-fixed-variant": "#763300",
        "tertiary-fixed-dim": "#ffb68e",
        "on-primary": "#ffffff",
        "surface-container-highest": "#e1e3e4",
        "on-secondary-fixed-variant": "#534600",
        "on-error-container": "#93000a",
        "on-background": "#191c1d",
        "outline-variant": "#c2c6d4",
        "on-primary-fixed": "#001b3f",
        "tertiary-fixed": "#ffdbc9",
        "error": "#ba1a1a",
        "surface-variant": "#e1e3e4",
        "surface": "#f8f9fa",
        "surface-container-lowest": "#ffffff",
        "surface-bright": "#f8f9fa",
        "primary": "#004793",
        "on-surface": "#191c1d",
        "inverse-surface": "#2e3132",
        "on-secondary-container": "#716000",
        "on-error": "#ffffff",
        "secondary": "#6e5e00",
        "inverse-on-surface": "#f0f1f2",
        "tertiary-container": "#9f4700",
        "on-surface-variant": "#424752",
        "error-container": "#ffdad6",
        "surface-container-low": "#f3f4f5",
        "surface-container-high": "#e7e8e9",
        "on-tertiary-fixed": "#331200",
        "primary-fixed-dim": "#abc7ff",
        "secondary-fixed-dim": "#e5c511",
        "surface-container": "#edeeef",
      },
      fontFamily: {
        "headline": ["Space Grotesk"],
        "body": ["Plus Jakarta Sans"],
        "label": ["Plus Jakarta Sans"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
}
```

### Typography

Load from Google Fonts (in `<head>`):

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

- **Headlines:** `font-family: 'Space Grotesk'` — used for all `h1`–`h3`, nav links, stat bars
- **Body:** `font-family: 'Plus Jakarta Sans'` — paragraphs, card content, labels
- **Footer/utility:** `font-family: 'DM Sans'`
- **Icons:** Material Symbols Outlined (ligature-based, not SVG)

### Key Visual Details to Preserve

- Sticky nav with `bg-white/80 backdrop-blur-xl shadow-sm` (glassmorphism)
- Hero uses `bg-primary` with a photo overlay at `opacity-40` + a `bg-gradient-to-r from-primary via-primary/60 to-transparent` over it
- CTA buttons use `bg-[#ebcb1b] text-on-secondary-fixed` (the yellow accent — this hex must be preserved)
- Secondary CTA: `border-2 border-white/30 text-white backdrop-blur-sm`
- Cards: `bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-xl transition-all`
- Glass quote cards: `background: rgba(255,255,255,0.8); backdrop-filter: blur(24px)`
- Training section: `bg-primary text-white` with a `bg-primary-container opacity-20 -skew-x-12` decorative panel
- Footer: `bg-slate-50 rounded-t-[2rem]`
- Dark mode support throughout using `dark:` variants

---
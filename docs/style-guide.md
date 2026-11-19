# Verilo style guide

Verilo should read like a premium newspaper, not a software template. The tokens live in
`apps/web/app/globals.css`; tests check the contrast (`tests/unit/contrast.test.ts`) and the rules
below (`tests/unit/design-rules.test.ts`).

## Type

| Role | Font | Notes |
|---|---|---|
| Headlines, wordmark | Newsreader (variable, optical sizes) | Weight 600, letter spacing -0.012em, balanced wrapping |
| Body and interface | Public Sans (variable) | 17px, line height 1.55, lines kept to about 68 characters (`max-w-prose`) |
| Kicker | Public Sans, 13px, 700, uppercase, +0.09em, accent colour | The label above a headline (`.kicker`) |
| Metadata | Public Sans, 13px, muted, tabular figures | Outlets, ages, counts (`.meta`) |

Both fonts come through `next/font` and are served from the site itself.

Scale (ratio 1.25): `text-xs` 13, `text-sm` 15, `text-base` 17, `text-lg` 21, `text-xl` 26,
`text-2xl` 33, `text-3xl` 41, `text-4xl` 51 px.

## Colour

One accent. Everything else is ink on paper.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#faf8f3` | `#121110` | Page background |
| `paper-raised` | `#ffffff` | `#1a1917` | Form fields |
| `ink` | `#151413` | `#ece8e0` | Text, solid buttons, the masthead rule |
| `ink-muted` | `#5e5b55` | `#a39e94` | Secondary text, field borders |
| `rule` | `#dcd6ca` | `#2e2b27` | Hairlines between stories (decorative only) |
| `accent` | `#a6261c` | `#e2645a` | Kickers, "updated" markers, link hover, focus, errors |
| `on-accent` | `#ffffff` | `#121110` | Text on the accent |

Contrast: body text at least 7:1, secondary text and the accent at least 4.5:1, field borders at
least 3:1, in both themes.

Dark mode follows the system until the reader uses the day / night button in the masthead (a
thin moon on the light page, a sun on the dark one, cross-fading with a quarter turn). The choice
is kept in `localStorage` and applied by a small script in `<head>` before the first paint
(`lib/theme.ts`), so a dark page never flashes light.

## Layout

- 12-column grid, 1200px wide at most, 24px gutters; 16px side margins on phones.
- Front page: a lead story across 8 columns with a 4-column side column, then rows of three.
  One column on phones.
- Stories are separated by 1px rules and space, never by cards. The masthead ends in a double rule.
- No horizontal scrolling at any width (checked in the browser tests).

## Components

- Buttons: solid ink with paper text, or outlined; 2px corners; at least 44px tall.
- Fields: raised paper, muted border, 2px corners, label above, error below in the accent with
  `aria-invalid`.
- Focus: a 2px accent outline offset by 2px, on everything.
- Icons (when needed): Lucide outlines at 1.5px stroke. Outlet logos small and greyscale.

## Never

Gradients, glass or blur effects, drop shadows, corners rounder than 2px, emoji in the interface,
colours outside the tokens (no hex values or arbitrary colour classes in components), Tailwind's
default palette or shadcn defaults (the palette, type scale, radii and shadows are cleared in
`globals.css`, so they don't exist), endless scrolling, autoplay.

## Behaviour

- AI text is always marked "AI summary", and each point links to the sources it came from.
- The feed ends with "You're caught up".
- Motion is minimal and turned off under `prefers-reduced-motion`.

## Performance budget

Lighthouse 95+ in every category and 100 for accessibility, mobile and desktop
(`npm run lighthouse`); Largest Contentful Paint under 1.8 s on the mobile setting; pages render on
the server, with client JavaScript only where a page needs interaction.

# ZenRoutine — Shell identity v1

The selected direction: a tortoise shell with a Z-shaped opening. Its grounded dome suggests patience and continuity; the open path suggests a routine that can change. The tortoise story is about trusting your pace. We do not turn it into a race or a promise of winning.

**Brand line:** A pace you can return to.

**Supporting line:** Plan gently. Make room for what matters.

This kit establishes the visual direction. It does not modify the app. The vector mark is a clean reconstruction of the approved bitmap study in `source/approved-shell-study.png`; the supplied SVG paths are the production master.

## Logo

Use the shell alone for app icons, favicons, compact navigation and loading states. Use the horizontal lockup for headers and the stacked lockup for welcome/marketing compositions. The casing is always **ZenRoutine**. Supplied wordmarks are outlined paths and require no installed font.

- Light surfaces: `marks/shell-colour.svg`; dark surfaces: `marks/shell-dark.svg`.
- Lockups: `logos/horizontal-{light,dark}.svg` and `logos/stacked-{light,dark}.svg`. PNG copies and transparent variants are supplied.
- One-colour applications: `marks/shell-ink.svg` or `marks/shell-white.svg`.
- Clear space: at least one quarter of the visible shell height around the mark or lockup. Supplied canvases do not always include that much space; add layout padding.
- Preferred minimum visible mark width: 24 px. Use the dedicated favicon at 16 px. Preferred horizontal lockup width: 180 px; stacked: 160 px.
- Keep the dome, flat curved base and negative-space Z intact. Do not rotate, stretch, add outlines, add a head/feet/face, or rebuild it with text. No gradients or drop shadows on the mark.
- The rounded corners on the preview board simulate OS masking. Actual app-icon exports are opaque, square and have no baked-in corner mask.

## Colour

| Colour | Hex | Role |
|---|---|---|
| Ink | `#173F3A` | Primary mark, light-theme text |
| Jade | `#59AA89` | Secondary mark, decorative accents |
| Paper | `#F3EEDC` | Light background, dark text |
| Evergreen | `#216653` | Light-theme actions and focus |
| Mint | `#8AC8AA` | Dark-theme actions and secondary mark |
| Night | `#132B27` | Dark background |
| Cream | `#FFFCF4` | Light cards |

`tokens.json` is the canonical UI specification; `tokens.css` supplies web colour variables. Dark cards use `#1D3832`. Primary button labels use `onPrimary`: Paper on Evergreen in light mode, Night on Mint in dark mode. Never assume white text on every accent.

All 38 declared text/control contrast pairs pass their numerical targets in `contrast-report.json`: 4.5:1 for normal text and 3:1 for tested focus/border pairs. This is a palette check, not a full accessibility audit of the application. Jade on Paper is only about 2.4:1; it is decorative, not a small-text or essential-control colour. `borderLight` is a decorative divider, not an essential control boundary.

Activity swatches remain distinct but more earthy. Work `#B95142`, Side Project `#A76320`, Fitness `#28735B`, Personal Development `#8B741A`. The full eleven-category set is in `tokens.json`. These swatches are chart/ribbon fills, not guaranteed text/background pairs. Place readable labels outside fills, provide a legend and non-colour cues, and add contrast-tested boundaries on dark charts. Never communicate planned versus actual only through colour; use explicit labels, solid versus outlined shapes or patterns. Preserve existing user-selected/persisted activity colours.

## Type and layout

Use **DM Sans**, bundled locally under the SIL Open Font License. The exact wordmark uses Semibold with tightened spacing; use the outlined logo instead of reconstructing it in UI text. Source: https://fonts.google.com/specimen/DM+Sans and https://github.com/google/fonts/tree/main/ofl/dmsans.

| Role | Size / line height | Weight |
|---|---|---|
| Main heading | 32 / 40 | 600 |
| Section heading | 24 / 32 | 600 |
| Small heading | 20 / 28 | 600 |
| Body | 16 / 24 | 400 |
| Small body / label | 14 / 20 | 400 / 500 |
| Caption | 12 / 16 | 400 |

The font directory contains variable and static 400/500/600/700 TTFs plus `OFL.txt`. Native integration should load each static face explicitly, use its registered family name and avoid synthetic weight overrides. Web can declare local `@font-face` weights. Keep system fallback, dynamic text scaling and comfortable wrapping. No runtime font CDN dependency.

Spacing uses 4, 8, 16, 24, 32 and 48. Corners use 6, 10, 16 and 24; reserve full pills for small chips and controls. Let empty space create calm. Give primary actions clear contrast, not extra size everywhere. Preserve the useful day ribbon and weekly charts; the brand should frame the planning, not hide it.

## Motion, tone and splash

Use short 160–240 ms fades and gentle state changes. Honour reduced motion. Do not repeatedly pulse or bounce the shell. Use reassuring, factual language: “Your forecast has updated”, “Make room for this next week”, “Your plan can change”. Avoid guilt, streak-loss pressure, race imagery and congratulating users for being busy.

The splash concept is an ivory or night field with a small shell and restrained wordmark. `splash/concept-*.png` are composition references. Native launch assets are the transparent `splash/splash-mark-*.png`; use contain sizing around 200 logical pixels and match the corresponding background. If the platform splash constraints exclude the wordmark, keep only the shell. Do not delay launch for branding or add a slogan to every loading state.

## Asset map

| Use | File |
|---|---|
| Main iOS / Expo icon, opaque 1024 square | `icons/app-icon.png` |
| Optional dark icon, opaque 1024 square | `icons/app-icon-dark.png` |
| Android adaptive foreground, transparent 1024 square | `icons/adaptive-foreground.png` |
| Adaptive background | Paper `#F3EEDC` |
| Browser favicon | `icons/favicon.svg`, `icons/favicon.ico`, or `icons/icon-32.png` |
| Apple touch icon | `icons/icon-180.png` |
| Web manifest sizes | `icons/icon-192.png`, `icons/icon-512.png` |
| Native splash images | `splash/splash-mark-light.png`, `splash/splash-mark-dark.png` |
| Social sharing, exact 1200 × 630 | `social/social-1200x630.png` |
| Visual overview | `preview/brand-board.png`, `preview/index.html` |
| Implementation instructions | `IMPLEMENTATION-PROMPT.md` |

All SVGs are self-contained paths without linked raster images or external fonts. PNG logo/mark exports preserve transparency where named; app icons and social exports are opaque. Choose an appropriate resolution and contain sizing; never stretch the shell.

## Build and verification

Python `fonttools` is required for `source/build_brand.py`; Node `sharp` for `source/render_assets.cjs`. The latter accepts `SHARP_MODULE` for a local installation. The Python script also looks for fonttools in the temporary `zenroutine-brand-fonttools` directory used to produce this kit. Both scripts write only into this kit. Fonts are instantiated at optical size 14. Existing generated assets can be used without running either script.

Verified: SVG/PNG exports, icon dimensions and opacity, social dimensions, local fonts and licence, and declared contrast pairs. App/device integration, adaptive OS masking, assistive technology and responsive screen behaviour must be verified during implementation.

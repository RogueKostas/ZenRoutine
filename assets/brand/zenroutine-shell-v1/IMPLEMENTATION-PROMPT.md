# Implement the approved ZenRoutine shell brand

The user has selected the shell-only identity. Implement the supplied brand kit in the existing ZenRoutine application. The authoritative directory is `C:/RogueKostas/ZenRoutine/assets/brand/zenroutine-shell-v1/` (repository-relative: `assets/brand/zenroutine-shell-v1/`). Read `BRAND-GUIDE.md`, `tokens.json` and `contrast-report.json`; view `preview/brand-board.png` and the splash references. Use the supplied assets, not older concepts in `output/brand-exploration-*`.

## Why

ZenRoutine should feel calm, clear and quietly encouraging. The selected shell has a negative-space Z and communicates steady, adaptable progress. Retain the existing goals → routine → actual time → forecast loop. Branding must not change domain behaviour or make the app feel like a race, meditation service or gamified streak tracker.

## Deliver

1. Read the repository AGENTS.md, `docs/REVIVAL_PLAN.md` and the repository `revival-loop` skill. Inspect git status and preserve existing work. Follow the skill's bounded implementation/review process. The kit itself is already built; do not redesign the logo.
2. Integrate `tokens.json` into the existing theme modules (`src/theme/colors.ts`, `typography.ts`, `spacing.ts` and related theme consumers). Keep light/dark/system support in `ThemeContext.tsx`. Add/use semantic `onPrimary` rather than hardcoded white button labels; light accent is Evergreen, dark accent is Mint. Preserve navigation theme shape and routes. Avoid a second unrelated theme system.
3. Bundle the supplied static DM Sans fonts locally. Use the installed Expo SDK's compatible font-loading approach (install `expo-font` through Expo if needed), retain `OFL.txt`, and map the actual registered font families for Regular, Medium, SemiBold and Bold. Avoid synthetic fontWeight when using explicit per-weight family names. Support offline launch, fallback, text scaling and font-load failure. Keep navigation labels and native/web rendering consistent.
4. Update `app.json` asset references: `expo.icon` → `./assets/brand/zenroutine-shell-v1/icons/app-icon.png`; Android adaptive foreground → `./assets/brand/zenroutine-shell-v1/icons/adaptive-foreground.png`, background `#F3EEDC`; `expo.web.favicon` → `./assets/brand/zenroutine-shell-v1/icons/icon-32.png`. Preserve bundle identifiers, package identifiers, existing plugins and other unrelated configuration. Integrate optional dark app icon only if supported by the current installed configuration; do not invent config keys.
5. Configure the existing `expo-splash-screen` plugin using `splash/splash-mark-light.png` on `#F3EEDC`, imageWidth about 200 and contain sizing, with the corresponding dark image on `#132B27` using the installed plugin's supported dark configuration. Concept images are references, not full-screen splash textures. Coordinate splash hiding with existing hydration/font readiness and errors; no artificial delay or permanent blank screen.
6. Apply the brand across the existing onboarding, navigation, cards, forms, primary/secondary actions, dialogs, loading/empty/error/quarantine states and charts. Audit `App.tsx`, `src/navigation/TabNavigator.tsx` and shared components as well as screens. Keep the app's information hierarchy and working interactions. Prefer supplied transparent PNG marks/lockups in native views unless an SVG renderer already exists. Use horizontal lockup sparingly; shell-only works in compact places. Do not add heavy decoration to dense planning views.
7. Keep activity identity meaningful. Suggested palette is in the kit, but preserve persisted/custom activity colours. Do not silently recolour user data. For existing colour values, ensure labels and chart boundaries remain legible in both themes. Any deliberate future change to new-user seeded defaults is a separate, tested decision; never perform an unrequested migration.
8. Use the supplied `social/social-1200x630.png` for web social metadata if the existing web setup has a supported integration point. Stage/copy it into a public served location and verify its URL in the exported web build. Do not invent a deployed domain or publish anything. Keep social metadata configuration documented if deployment information is unavailable.

## Gates

- Run `npm run typecheck` for TypeScript changes and `npm run verify` before completion (it includes core/store tests and web build). Add meaningful regression tests if behaviour or persistence is touched, not tests that merely repeat colour constants.
- Inspect representative screens in both themes and at narrow phone, tablet and web widths; check text scaling, focus visibility and keyboard access. Verify startup with persisted data and offline fonts. Record anything unavailable to verify.
- Check full app icon at 60 px and favicons at 16/32 px, adaptive mask safe area, native splash and light/dark transition where device tooling is available. Build-time native asset changes require a rebuilt native app; do not claim Expo Go alone validates them.
- Declared text pairs meet 4.5:1; essential control/focus boundaries meet 3:1. Jade is decorative. Do not use `borderLight` as the sole input boundary or rely on colour alone for planned/actual states. Check actual rendered combinations, including opacity and overlays.
- Report changed files, checks run, remaining platform limitations and screenshots/previews of the result. Do not commit, push, deploy or create external services unless asked.

## Do not

Do not add turtle heads, feet, eyes, smiles, mascots, lotus symbols, gradients or a replacement logo. Do not use prior branding explorations. Do not modify forecasting calculations, priority ordering, storage schemas or core feature scope as part of the visual refresh. Do not overwrite user activity colours or remove existing data. Avoid font-network dependencies and branding-induced loading delays.

## Done means

The approved shell identity is consistently integrated into app and web assets and UI, both themes remain legible, local fonts work offline, existing features and user data are preserved, required checks pass, and unverified device behaviours are explicitly recorded.

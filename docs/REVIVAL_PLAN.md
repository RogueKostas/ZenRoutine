# ZenRoutine revival plan

Last reviewed: 2026-09-03

## Current assessment

ZenRoutine has a coherent MVP concept and a sensible high-level separation between domain calculations, Zustand persistence, navigation, and React Native UI. A clean lockfile install typechecks successfully. The project is viable to continue; a rewrite is not justified.

The engineering direction is clear enough to stabilize the application. Product direction is not yet specific enough for a long feature roadmap: the repository does not define its primary user, the behavior that should make ZenRoutine distinct from a calendar or time tracker, success metrics, or whether sync and accounts are part of the intended product.

## Evidence from the audit

- The repository was created and built out rapidly in February 2026, then received no further commits before this review.
- Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7, TypeScript, AsyncStorage, and Zustand 5 are structurally appropriate for this application.
- The locked dependencies install cleanly and TypeScript passes after npm ci.
- Web was advertised but its required Expo dependencies were missing; they were restored during this review.
- The R0 baseline now has representative core/store tests and a GitHub Actions verification workflow. Linting, EAS configuration, and a release pipeline are not established yet.
- Several screens and the single Zustand store are large enough that future changes will become harder to review.
- Existing any and @ts-ignore escapes weaken the strict-TypeScript claim.
- Export/import and license content are visible stubs.
- The prediction model is intentionally simple and needs product validation before it should be presented as a trustworthy forecast.
- The dependency audit currently reports advisories, mostly through the older Expo/tooling tree. Do not force-fix them; address them through the staged Expo upgrade and reassess after each SDK step.

## Product decisions needed

Before a broad feature phase, write short answers to these questions:

1. Who is the first user: a routine planner, a goal-focused time tracker, or someone trying to rebalance life categories?
2. What is the main repeatable action and payoff within the first week?
3. Is the prediction the headline feature, or supporting feedback?
4. Is local-only privacy a deliberate product promise, or should accounts and multi-device sync be planned?
5. Is web a supported product surface or primarily a development and demo target?

## Milestones

### R0 — Reproducible baseline (local/web complete; native smoke deferred)

Acceptance:

- npm ci, npm run typecheck, and npm run build:web pass from a clean checkout.
- Repository guidance and the Codex revival loop are checked in.
- CI runs the same non-interactive verification gate.
- A minimal automated test setup covers representative core and store behavior.
- The app receives a manual smoke pass on at least one mobile platform.

Evidence recorded 2026-09-03:

- A clean `npm ci` and `EXPO_NO_TELEMETRY=1 npm run verify` pass locally on Node 24.13.0: strict typecheck, 11 Vitest core/store tests, and a successful web export.
- `npx expo install --check` reports compatible SDK 54 dependencies and Expo Doctor passes all 18 checks after aligning Expo 54.0.37, React Native Gesture Handler 2.28.0, and React Native Screens 4.16.0.
- GitHub Actions runs the same `npm run verify` gate on pinned Node 22.13.0. Runs 33737190359 and 33737967627 passed on the personal `RogueKostas/ZenRoutine` repository.
- A browser interaction smoke passed onboarding, goal creation, goal-linked routine planning, timer start/stop, and persisted state after reload. This is useful supplementary evidence but is not a substitute for the required physical-device smoke.
- Codex cloud is deliberately deferred because this ChatGPT account is actively connected to the separate `HyperKostas` work identity and currently offers no second GitHub-user connection. Do not replace or modify that connection while the work account remains active.
- No Android emulator, iOS simulator, or attached physical device is available on this Windows host. The Expo Go server started successfully on the LAN, but physical-device behavior remains explicitly unverified and is still required before a distributable build or release claim.

### R1 — Data correctness and safety

Acceptance:

- Persistence hydration is explicit and first launch cannot overwrite or flash stale state.
- Store migrations and reset/import/export behavior have tests.
- Date and time behavior is verified across local time zones, midnight, and overnight routine blocks.
- Goal progress and tracking-entry updates have regression coverage.

### R2 — Core loop quality

Acceptance:

- A user can plan, start, stop, and review time with a short, consistent flow.
- Accessibility labels, focus behavior, touch targets, and empty/error states are reviewed.
- Oversized screens and store responsibilities are split only where doing so improves active work.
- Visible placeholder actions are implemented or removed.

### R3 — Forecast credibility

Acceptance:

- The allocation model handles multiple goals sharing an activity type without double-counting all available time.
- Forecast assumptions and confidence are understandable to users.
- Deterministic tests cover zero allocation, completed goals, sparse history, schedule changes, and competing goals.

### R4 — Beta and learning loop

Acceptance:

- EAS development/preview builds and versioning are configured.
- A small beta cohort can install the app and submit structured feedback.
- Privacy and local-data behavior are documented.
- The next roadmap is driven by observed retention and usability evidence.

### R5 — Optional connected product

Only start this milestone after the product decision. If accounts, sync, collaboration, or server-owned notifications are required, define data ownership and conflict behavior before selecting backend services.

## Upgrade path

Keep the current architecture. Upgrade Expo incrementally from SDK 54 to 55, then 56, then 57, following Expo's compatibility checks and verifying typecheck, web export, and a mobile smoke test at each step. Avoid mixing the framework upgrade with product feature work.

## Cloud environment recipe

The repository needs no secrets for its current offline-first feature set.

- Repository: RogueKostas/ZenRoutine
- Runtime: Node.js 22.13 or a compatible Node 22 release
- Setup: npm ci
- Agent internet access: off unless a task explicitly requires dependency or documentation access
- Verification: npm run verify

Cloud setup is optional and deferred while this ChatGPT account remains connected to the active `HyperKostas` work identity. Do not reconnect or replace that identity for ZenRoutine. If a separate personal ChatGPT identity or independently scoped workspace becomes available, create the environment there. Cloud tasks should work on branches and return reviewable diffs; deployment and merging remain explicit user actions.

## Next ready slice

Upgrade Expo from SDK 54 to 55 as an isolated dependency/configuration slice. Run a clean install, Expo compatibility checks, the full verification gate, and browser smoke; keep native-device behavior explicitly deferred until a device or emulator is available.

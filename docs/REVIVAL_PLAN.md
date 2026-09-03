# ZenRoutine revival plan

Last reviewed: 2026-09-02

## Current assessment

ZenRoutine has a coherent MVP concept and a sensible high-level separation between domain calculations, Zustand persistence, navigation, and React Native UI. A clean lockfile install typechecks successfully. The project is viable to continue; a rewrite is not justified.

The engineering direction is clear enough to stabilize the application. Product direction is not yet specific enough for a long feature roadmap: the repository does not define its primary user, the behavior that should make ZenRoutine distinct from a calendar or time tracker, success metrics, or whether sync and accounts are part of the intended product.

## Evidence from the audit

- The repository was created and built out rapidly in February 2026, then received no further commits before this review.
- Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7, TypeScript, AsyncStorage, and Zustand 5 are structurally appropriate for this application.
- The locked dependencies install cleanly and TypeScript passes after npm ci.
- Web was advertised but its required Expo dependencies were missing; they were restored during this review.
- There is no automated test suite, lint script, CI workflow, EAS configuration, or release pipeline.
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

### R0 — Reproducible baseline (in progress)

Acceptance:

- npm ci, npm run typecheck, and npm run build:web pass from a clean checkout.
- Repository guidance and the Codex revival loop are checked in.
- CI runs the same non-interactive verification gate.
- A minimal automated test setup covers representative core and store behavior.
- The app receives a manual smoke pass on at least one mobile platform.

Evidence recorded 2026-09-03:

- A clean `npm ci` and `EXPO_NO_TELEMETRY=1 npm run verify` pass locally on Node 24.13.0: strict typecheck, 11 Vitest core/store tests, and a 695-module web export.
- The repository now defines the same `npm run verify` gate for GitHub Actions on pinned Node 22.13.0; the first remote run is still pending.
- Personal Codex cloud canary and physical-device Expo Go smoke evidence are still pending and must not be inferred from the web build.

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

Create the environment in Codex cloud after the GitHub repository is connected. Cloud tasks should work on branches and return reviewable diffs; deployment and merging remain explicit user actions.

## Next ready slice

Finish R0: make the web build green, add the first automated tests and CI gate, then perform a mobile smoke test before starting the Expo SDK upgrade.

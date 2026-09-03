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
- Export/import are now functional through validated portable JSON; fake notification and license placeholders were removed during R2.
- The prediction model now preserves shared-capacity constraints and explains its assumptions, but its priority weights and confidence thresholds still need product validation before release.
- The dependency audit currently reports advisories, mostly through the older Expo/tooling tree. Do not force-fix them; address them through the staged Expo upgrade and reassess after each SDK step.

## Product decisions needed

Before a broad feature phase, write short answers to these questions:

1. Who is the first user: a routine planner, a goal-focused time tracker, or someone trying to rebalance life categories?
2. What is the main repeatable action and payoff within the first week?
3. Is the prediction the headline feature, or supporting feedback?
4. Is local-only privacy a deliberate product promise, or should accounts and multi-device sync be planned?
5. Is web a supported product surface or primarily a development and demo target?

## Milestones

### R0 — Reproducible baseline (local/web and CI complete; native smoke deferred)

Acceptance:

- npm ci, npm run typecheck, and npm run build:web pass from a clean checkout.
- Repository guidance and the Codex revival loop are checked in.
- CI runs the same non-interactive verification gate.
- A minimal automated test setup covers representative core and store behavior.
- The app receives a manual smoke pass on at least one mobile platform.

Evidence recorded 2026-09-03:

- A clean `npm ci` and `EXPO_NO_TELEMETRY=1 npm run verify` pass locally on Node 24.13.0: strict typecheck, 11 Vitest core/store tests, and a successful web export.
- `npx expo install --check` reports compatible SDK 54 dependencies and Expo Doctor passes all 18 checks after aligning Expo 54.0.37, React Native Gesture Handler 2.28.0, and React Native Screens 4.16.0.
- GitHub Actions runs the same `npm run verify` gate on pinned Node 22.13.0. The final branch run 33742467275 and post-merge `main` run 33742594656 passed on the personal `RogueKostas/ZenRoutine` repository.
- A browser interaction smoke passed onboarding, goal creation, goal-linked routine planning, timer start/stop, and persisted state after reload. This is useful supplementary evidence but is not a substitute for the required physical-device smoke.
- Codex cloud is deliberately deferred because this ChatGPT account is actively connected to the separate `HyperKostas` work identity and currently offers no second GitHub-user connection. Do not replace or modify that connection while the work account remains active.
- No Android emulator, iOS simulator, or attached physical device is available on this Windows host. The Expo Go server started successfully on the LAN, but physical-device behavior remains explicitly unverified and is still required before a distributable build or release claim.

### R1 — Data correctness and safety (local/web complete; native error-path smoke deferred)

Acceptance:

- Persistence hydration is explicit and first launch cannot overwrite or flash stale state.
- Store migrations and reset/import/export behavior have tests.
- Date and time behavior is verified across local time zones, midnight, and overnight routine blocks.
- Goal progress and tracking-entry updates have regression coverage.

Evidence recorded 2026-09-03:

- Startup now uses explicit, externally observable Zustand hydration with rendering gated until storage is ready. A read or migration failure preserves the existing device data, presents retry/reset recovery, and cannot silently write defaults over it; first-launch defaults are durably persisted before the app is declared ready.
- Persisted state is schema 4. Strict current-schema validation rejects malformed or relationally inconsistent data, while backward-compatible migrations repair legacy icons, priority/onboarding fields, invalid numeric values, dangling goal/routine-block references, timer pointers, and multiple open timers. Duplicate identifiers and invalid activity links are rejected.
- Reset and backup import use durable-write-first semantics so a storage failure leaves the live state unchanged. The versioned Unicode-safe backup codec, migration path, failure recovery, and reset behavior have regression coverage; a visible user-facing import/export flow remains an R2 task.
- Local calendar keys, week boundaries, half-open analytics clipping, overnight routine blocks, and DST weeks are covered deterministically. The suite also passes with the process timezone forced to `America/Los_Angeles` (54/54 tests).
- Tracking creation, edits, reassignment, deletion, routine-block unlinking, and goal progress are reconciled atomically. Completion is idempotent, corrected progress can reopen an automatically completed goal, and linked activity relationships cannot be invalidated through public actions.
- `npm run verify` passes on the SDK 57 stack: strict typecheck, 54 Vitest tests across six files, and production web export. A browser migration smoke loaded data created under SDK 54–57, wrote a schema-4 marker, reloaded it successfully, and produced no runtime errors.
- Native AsyncStorage read/write failure behavior, storage pressure, suspend/resume, runtime timezone changes, and screen-reader behavior remain manually unverified because no native target is available. These are release gates, not blockers for the local R1 checkpoint.

### R2 — Core loop quality (local/web complete; native accessibility smoke deferred)

Acceptance:

- A user can plan, start, stop, and review time with a short, consistent flow.
- Accessibility labels, focus behavior, touch targets, and empty/error states are reviewed.
- Oversized screens and store responsibilities are split only where doing so improves active work.
- Visible placeholder actions are implemented or removed.

Evidence recorded 2026-09-03:

- Home now connects the plan directly to execution: current and upcoming scheduled blocks start tracking with their activity, goal, routine-block ID, and scheduled source intact. Previous-day overnight carryover is included after midnight and overnight occurrences are classified independently from same-day blocks.
- Stopping a timer immediately surfaces the most recent saved session with activity, duration, linked goal, and a `Review week` handoff. Analytics opens on the planned-versus-tracked comparison so the loop has a visible payoff.
- Quick Start remains available for unplanned work and now offers goal selection on Home. Timer/goal creation failures stay visible, invalid goal estimates are rejected without closing the form, and start/stop state changes have polite/assertive announcements where appropriate.
- The active Home, Routine, Goals, Analytics, Settings, and shared-button paths now expose explicit roles, labels, selected/disabled/busy states, and 44-point minimum targets for the reviewed controls. Modal headings, initial text-input focus, Escape/back dismissal, and import error announcements are present; the per-second timer is intentionally not a live region.
- Settings backup export/import now uses the R1 codec and durable import action. Users can share or copy JSON, paste a backup for validation, and see read/write/format errors before any live data is replaced. Fake notification switches and the license placeholder were removed; the inert routine dropdown and goal-card touch wrapper were also removed.
- Browser interaction verified goal-linked start, stop, the recent-session review handoff, comparison analytics, populated export JSON, invalid-import rejection, and Escape dismissal. The accessibility tree exposed meaningful labels for the tested controls and no runtime errors occurred.
- Independent post-change review returned GO after verifying the planned/overnight linkage, in-modal errors, touch targets, and semantics. Native VoiceOver/TalkBack ordering, Dynamic Type, physical targets, share sheet/paste keyboard, timer background/resume, and modal focus restoration remain release-time manual checks.

### R3 — Forecast credibility (local/web complete; product calibration remains)

Acceptance:

- The allocation model handles multiple goals sharing an activity type without double-counting all available time.
- Forecast assumptions and confidence are understandable to users.
- Deterministic tests cover zero allocation, completed goals, sparse history, schedule changes, and competing goals.

Evidence recorded 2026-09-03:

- Forecasts now group active goals by activity so scheduled capacity is never counted in full for every goal. Goal-linked blocks remain dedicated; only unlinked activity time enters the shared pool, and capacity linked to inactive or other goals stays reserved.
- The shared pool is allocated by the existing five priority levels (weights 5 through 1). An event-based deterministic forecast redistributes only shared capacity as goals finish, while dedicated blocks remain reserved for their linked goal.
- Each result exposes total activity capacity, the goal's initial weekly allocation, dedicated and shared portions, capacity linked elsewhere, competition count, remaining work, completion horizon/date, distinct evidence days, confidence level, and a plain-language confidence reason.
- Confidence describes evidence quality rather than probability. Only positive completed tracking on distinct days since the active routine's latest update counts; zero-allocation goals are always low confidence with no date, even when another goal has rich history.
- Goals explains the model globally and per goal: current routine/priorities are assumed to continue, goal-linked time stays dedicated, and unlinked time is shared/reallocated. The UI distinguishes no schedule, reserved capacity, and genuine competition instead of presenting an unexplained date.
- Eight focused forecast tests cover priority competition without double-counting, reallocation, equal priorities, completed/paused exclusion, dedicated and inactive-linked reservations, zero capacity, schedule changes, sparse/stale evidence, offset timestamps, and input-order stability. Together with existing engine coverage, the focused R3 gate passes 16/16 tests.
- Browser smoke rendered the assumption panel, allocated/total weekly capacity, dedicated-versus-reserved explanations, no-capacity states, dates, and confidence reasons against migrated schema-4 data without runtime errors. Independent review returned GO after two correction rounds.
- The weighting and confidence thresholds are explicit prototype assumptions, not validated behavioral science. R4 beta evidence should determine whether users expect priority weights, whether inactive-linked time should be lendable, and how much recent adherence is enough to raise confidence.

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

### SDK 55 — local/web complete; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 55.0.31, React Native 0.83.10, and React 19.2.0. Removed the obsolete `newArchEnabled` and `android.edgeToEdgeEnabled` configuration flags; SDK 55 is New Architecture-only and Android edge-to-edge is mandatory.
- A clean `npm ci`, `npx expo install --check`, `npx expo-doctor@latest`, `npx expo config --type public`, and `EXPO_NO_TELEMETRY=1 npm run verify` all pass. Expo Doctor reports 20/20 checks, and the verification gate passes strict typecheck, all 11 core/store tests, and the production web export.
- The browser smoke preserved the SDK 54 goal and linked weekly routine block, created a new SDK 55 goal, started/stopped a timer, rendered analytics, and preserved the new goal after reload. Metro produced no runtime error output during the interaction.
- The dependency audit now reports 25 advisories (1 low, 17 moderate, 6 high, 1 critical), down from 32 on SDK 54. Continue resolving these through staged SDK upgrades; do not force-fix the dependency graph.
- Native behavior remains unverified because this Windows host has no attached phone or available emulator. Before a distributable build, verify Android edge-to-edge tab-bar insets, native stack/modal transitions, drag interactions, and dark-theme system-bar contrast. SDK 55 retains Android 7+ and iOS 15.1+ minimum OS support and requires Xcode 26.2+ for iOS builds.
- Independent review found no source-level SDK 55 blocker. It identified the existing asynchronous Zustand hydration/startup ordering risk as the first R1 fix and a static responsive-width issue in onboarding as an R2 candidate.

### SDK 56 — local/web complete as a bridge checkpoint; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 56.0.21, React Native 0.85.3, React 19.2.3, and TypeScript 6.0.3. The SDK 56 compatibility fixer aligned native dependencies and added the `expo-status-bar` config plugin.
- Migrated the removed legacy `expo.splash` field to the `expo-splash-screen` config plugin, removed the obsolete custom Babel/import-meta workaround, and replaced React Native 0.85's removed `StyleSheet.absoluteFillObject` API.
- A clean `npm ci`, `npx expo install --check`, `npx expo config --type public`, and `EXPO_NO_TELEMETRY=1 npm run verify` pass. The gate passes strict TypeScript 6 typecheck, all 11 core/store tests, and the production web export.
- Expo Doctor passes 21/22 checks. Its only failure is the official SDK 56 Hermes V1 memory-regression warning, whose prescribed current resolution is the already-planned upgrade to Expo 57.0.17+ and React Native 0.86.3+; therefore SDK 56 is a verified bridge checkpoint, not a release target.
- Browser smoke preserved the SDK 54 and SDK 55 data, created an SDK 56 goal, started/stopped a timer, rendered analytics, and preserved the new goal after reload. It also surfaced and verified a fix for an empty-string conditional rendered as a raw text node in the goal modal under the newer runtime.
- Development logs retain non-blocking web deprecation warnings for legacy shadow props and `pointerEvents`; address those during R2 UI/accessibility work. The dependency audit reports 24 advisories (1 low, 19 moderate, 3 high, 1 critical); continue through SDK 57 without a forced audit rewrite.
- SDK 56 raises the iOS minimum to 16.4 and requires Xcode 26.4+. Native compilation, splash appearance, safe-area/tab-bar behavior, navigation transitions, gestures, animations, and suspend/resume remain deferred until an appropriate device or build host is available.

### SDK 57 — local/web complete; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 57.0.19 and React Native 0.86.3, exceeding the Expo 57.0.17 floor that includes both SDK 56 Hermes regression fixes. React and React DOM remain 19.2.3, TypeScript remains 6.0.3, and Node 22.13 remains the supported repository runtime.
- A clean `npm ci`, `npx expo install --check`, `npx expo-doctor@latest`, `npx expo config --type public`, `npm ls --depth=0`, and `EXPO_NO_TELEMETRY=1 npm run verify` all pass. Expo Doctor reports 21/21 checks, and the verification gate passes strict typecheck, all 11 core/store tests, and the production web export.
- Browser smoke preserved data created under SDK 54, 55, and 56; created an SDK 57 goal; started/stopped a timer; rendered analytics; and preserved the new goal after reload. Development logs showed the already-recorded web deprecation warnings but no runtime errors.
- The dependency audit reports 23 advisories (1 low, 19 moderate, 2 high, 1 critical), down from 32 at the start of the upgrade path. Do not force-fix the remaining transitive tooling advisories; review them individually before release and continue removing them through supported dependency updates.
- Independent compatibility scanning found no React Native 0.86 source blocker. Native-device checks are still required for tab-bar and bottom-sheet safe-area insets, status-bar/theme consistency, splash appearance, navigation/modal transitions, gestures, animations, keyboard behavior, persistence, and timer suspend/resume.
- SDK 57 retains Android 7+/API 36 and iOS 16.4+/Xcode 26.4 native requirements. The SDK 54→57 stack upgrade is complete locally; SDK 57 is the maintained target for R1–R3 work.

## Cloud environment recipe

The repository needs no secrets for its current offline-first feature set.

- Repository: RogueKostas/ZenRoutine
- Runtime: Node.js 22.13 or a compatible Node 22 release
- Setup: npm ci
- Agent internet access: off unless a task explicitly requires dependency or documentation access
- Verification: npm run verify

Cloud setup is optional and deferred while this ChatGPT account remains connected to the active `HyperKostas` work identity. Do not reconnect or replace that identity for ZenRoutine. If a separate personal ChatGPT identity or independently scoped workspace becomes available, create the environment there. Cloud tasks should work on branches and return reviewable diffs; deployment and merging remain explicit user actions.

## Next ready slice

Review the local R1–R3 prototype and its documented native-device deferrals. If the direction is approved, authorize a local commit (and separately any push), then begin R4 with Android/iOS device smoke, EAS preview-build configuration, privacy documentation, and a small structured beta-learning loop. Use beta evidence to calibrate the forecast assumptions before expanding the product surface.

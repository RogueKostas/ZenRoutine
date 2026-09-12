# ZenRoutine revival plan

Last reviewed: 2026-09-03. Documentation-truth pass 2026-09-12 (issue #10).

This plan is an append-only record, not a snapshot. Corrections made on 2026-09-12 are marked inline
as **Corrected 2026-09-12 (#10)**; no earlier claim has been deleted, and every correction names what
replaced it and the run behind the replacement. Every number below is either followed by the commit
it was measured at, or explicitly labelled unverified.

## Current assessment

ZenRoutine has a coherent MVP concept and a sensible high-level separation between domain calculations, Zustand persistence, navigation, and React Native UI. A clean lockfile install typechecks successfully. The project is viable to continue; a rewrite is not justified.

The engineering direction is clear enough to stabilize the application. Product direction is not yet specific enough for a long feature roadmap: the repository does not define its primary user, the behavior that should make ZenRoutine distinct from a calendar or time tracker, success metrics, or whether sync and accounts are part of the intended product.

> **Corrected 2026-09-12 (#10):** the paragraph above is no longer true and is kept only as the
> record of what was assessed on 2026-09-03. The director answered all five questions on 2026-09-11
> and they are recorded in [`docs/PRODUCT.md`](PRODUCT.md) as decisions D1–D8 (commit `899f570`).
> The primary user, the distinguishing behaviour, the tracking model, and the accounts/sync question
> are all now defined. What remains genuinely open is narrower and listed under "Still open" in that
> document: whether the timer's interruption motivates or stresses, how much of the game layer to
> build, and which AI capabilities justify the subscription. See "Product decisions" below.

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

### Measurement corrections — recorded 2026-09-12 (#10)

Measured on this Windows host in worktree `C:/CoworkBridge/lanes/docs-truth` at commit `9cca4f2`
(= `origin/main` at the time of writing), portable Node v22.23.2, npm 10.9.8, Vitest 4.1.11:

```
npm ci        -> exit 0
npm test      -> exit 0   Test Files  7 passed (7)
                          Tests      79 passed (79)
npm run typecheck  -> exit 0
npm run build:web  -> exit 0   web bundle 1.3MB, exported to dist
```

Per file at `9cca4f2`, from `npx vitest run --reporter=verbose`: `persistence` 19,
`hydrationAndBackup` 14, `prediction` 11, `dateTimeAndValidation` 10, `goalTracking` 9,
`engine` 8, `useAppStore` 8. Total 79.

Three separate claims in this document were wrong or stale. Each is corrected in place below; this
table is the summary.

| Claim, as written | Where | Status | What replaced it |
|---|---|---|---|
| "11 Vitest core/store tests" | R0 evidence | **Accurate when recorded, now stale** | 79 at `9cca4f2` |
| "all 11 core/store tests" | SDK 55, 56, 57 evidence | **Accurate when recorded, now stale** | 79 at `9cca4f2` |
| "54 Vitest tests across six files", "54/54 tests" | R1 evidence | **Wrong when recorded** | 62 at the same tree; 79 at `9cca4f2` |

- The **11** was not an invented number. At `f228fd1` (SDK 55) and `a192181` (SDK 57) the suite was
  two files — `tests/core/engine.test.ts` (8) and `tests/store/useAppStore.test.ts` (3) — and
  `git log eb357c3..a192181 -- tests` is empty, so no test changed anywhere across the SDK 54→57
  path. The three SDK sections each re-recorded a figure that was true at their own commit. The
  defect is that they read in the present tense, so a later reader takes 11 for the size of the
  suite. They are now dated rather than deleted.
- The **54 was wrong at the commit that claims it.** At `d5b1e87` the suite is seven test files, not
  six, and a static count of `it(` declarations gives exactly 54 — which is how the figure was
  reached. The runtime count at that tree is **62**, because `tests/store/persistence.test.ts` uses
  two `it.each` blocks (lines 117 and 263 today) that expand to eight more cases than are written.
  `git log d5b1e87..1fa3f45 -- tests` is empty, and the orchestrator measured 62 on that tree at
  `1fa3f45` on 2026-09-11. A declaration count is not a run; the same +8 gap holds today (71
  declarations, 79 cases).
- The suite grew after the merge, and those numbers are measured, not projected: **62** at `261c592`
  (orchestrator, 2026-09-11), **72** at `370fcac` after issue #3, **79** at `9cca4f2` after issue #7.
  The intermediate per-lane figures in the two fix commits (`1c132dc` says 72, `54d71ed` says 69) are
  each correct for the branch they were run on; 79 is the merged total.

### Findings from the independent adversarial review — F1–F7

Two non-author reviewers read the `codex/r1-data-safety` branch statically on 2026-09-11 before it
was merged. Recorded here so the next reader does not rediscover them. Issue numbers for F1–F6 are
attested by the merge commits and `.orchestrator/ORCHESTRATOR-STATE.md`; F7's is inferred from the
sequence and is marked as such.

| # | Issue | Severity | Finding | State |
|---|---|---|---|---|
| F1 | #3 | P1 confirmed | `stopTracking` did not validate `endTime >= startTime`. A backwards clock mid-timer persisted `endTime < startTime`; the strict migration path then threw on every launch and hydration failed permanently, with data wipe as the only offered recovery. | **Fixed**, `1c132dc`, merged as PR #17 |
| F2 | #4 | P1 confirmed | Legacy (<schema 4) migration force-closes secondary open timers with `endTime = startTime`, silently discarding their duration. `tests/store/persistence.test.ts` asserts this as intended. | Open |
| F3 | #5 | P2 confirmed | Dangling `activityTypeId` throws unconditionally with no version gate, unlike the sibling `goalId`/`routineBlockId` checks which repair legacy data. Same destructive-reset lockout as F1. | Open |
| F4 | #6 | P1 confirmed | `getForecastEvidence` filters tracking history by `activityTypeId` only, never by `goalId`, so a goal with no tracking of its own inherits another goal's evidence and is shown high confidence. | Open |
| F5 | #7 | P1 confirmed | Confidence was measured against the whole routine's `updatedAt`, so editing any unrelated block collapsed every goal's confidence. Fired constantly in normal use. | **Fixed**, `54d71ed`, merged as PR #22 |
| F6 | #8 | P1 plausible | `babel.config.js` was deleted with its `unstable_transformImportMeta` fix for Zustand's `import.meta` under Hermes, with no replacement config. | **Closed as NOT A DEFECT** — see SDK 56 below |
| F7 | #9 (inferred) | P2 confirmed | `tests/core/prediction.test.ts` had no per-goal evidence isolation test. The arithmetic tests were independently re-derived and are sound. | Open, tied to F4/#6 |

One review claim was **refuted by measurement**: the reviewers flagged `typescript: ~6.0.3` as
plausibly a nonexistent version pin that would break `npm ci`. The orchestrator ran it on the host on
2026-09-11 — 584 packages resolved, `tsc` ran clean. The check was named by the reviewer and then
actually run; recorded so it is not re-raised.

### Known remainders and follow-ups

The two merged fixes were deliberately narrow and each recorded what it did **not** address. These
are carried here from the commit messages, which are the citable source:

- No physical-device run has ever happened on this project (issue #15). Everything claimed for
  R1–R3 on native is unverified; the Node/Vitest AsyncStorage mock and the web export are the only
  evidence.
- The App.tsx quarantine banner from #3 has **no automated coverage** — not rendered in any test.
- The #3 side-car key is written but never read back: quarantined records are retained, not
  recoverable in-app, and there is no UI for them.
- Duplicate tracking-entry ids still abort hydration; quarantine does not cover that corruption class.
- ~~`updateRoutine` (rename, activate) still bumps `updatedAt` without stamping `capacityChangedAt`~~
  — closed by #24, which also found the same defect in `setActiveRoutine` and `duplicateRoutine`.
  The general rule, now enforced at all three: **any writer that bumps `routine.updatedAt` must also
  seed `capacityChangedAt` via `withCapacityChangedAt`**, because un-seeded activity types read
  `updatedAt` through `getCapacityChangedAt`'s fallback and a bare bump collapses their evidence.
  `updateRoutine` can no longer activate at all — `isActive` was removed from its signature, since
  its companion `activeRoutineId` (the field `useActiveRoutine` actually resolves) is maintained
  only by `setActiveRoutine`.
- `deleteGoal` clears `goalId` from every routine block that referenced the deleted goal. `goalId` is
  in `CAPACITY_RELEVANT_BLOCK_FIELDS` — the time moves from a goal's dedicated pool to the shared
  pool, changing every competing goal's allocation — but `deleteGoal` stamps nothing. This is the
  **opposite** polarity to #7: it cannot collapse confidence (it never bumps `updatedAt`), it
  under-reports a real capacity change. Found while enumerating writers for #24 and deliberately
  left there: it is a goal mutation, and whether deleting a goal should reset its competitors'
  evidence is a product decision, not a mechanical fix.
- The 7/14 distinct-day confidence thresholds remain the unvalidated prototype assumption R3 recorded.
- The tappable forecast date (D5) is tracked as issue #12 and is untouched by the #7 fix.
- Whether the Render blueprint should be repointed from `codex/r1-data-safety` to `main` is issue #11
  and is the director's call. See R4 below.

> **Unverified:** the brief for #10 also asked that follow-up issues **#18–#24** be folded in. `gh` is
> not authorised in this lane, so the issue tracker could not be read and the contents of #18–#24
> could not be confirmed. The remainders listed above are taken from committed sources in this
> repository and are citable; the mapping from them to issue numbers #18–#24 is **not verified here**
> and should be checked by someone with tracker access.

## Product decisions

**All five are ANSWERED as of 2026-09-11.** The decisions are recorded in
[`docs/PRODUCT.md`](PRODUCT.md), decided by Kostas Zarifis (director), committed in `899f570`. That
document is authoritative; where it and a milestone disagree, the milestone follows it.

This section was headed "Product decisions **needed**" until 2026-09-12 and opened with the
instruction *"Before a broad feature phase, write short answers to these questions:"*. That
instruction has been carried out, which is why the heading changed. The questions themselves are kept
verbatim below, each with the answer that closed it, so a cold reader can see that the gate is
cleared and does not re-ask them.

| # | Question, as originally asked | Answer | Decision |
|---|---|---|---|
| 1 | Who is the first user: a routine planner, a goal-focused time tracker, or someone trying to rebalance life categories? | **CLOSED.** The premise was wrong: the three are not alternatives but three stages of one journey — set, plan, track and learn — and the app owns all three. Do not narrow to a persona; the connection between them is the product. | D1 |
| 2 | What is the main repeatable action and payoff within the first week? | **CLOSED.** Seeing the real week against the intended week. The thesis is that people overestimate how much time they have the way they underestimate how much they eat; the first-week payoff is that food-diary eye-opener, delivered without shame. The repeatable action is tracking, in either of two first-class modes (D3), reviewed weekly (D4). | D3, D4 |
| 3 | Is the prediction the headline feature, or supporting feedback? | **CLOSED.** Headline, and it must show its working: a specific date rather than a range, tappable to break down estimate vs. trend vs. drift, each carrying a visible strength-of-prediction signal. | D5 |
| 4 | Is local-only privacy a deliberate product promise, or should accounts and multi-device sync be planned? | **CLOSED.** Accounts and multi-device sync are planned from the start, including Google sign-in. The offline-first guest core stays and signing in must never silently upload, replace or merge existing device data; the ownership, transfer and conflict rules in `docs/CLOUD_BETA_TASK.md` stand. | D6 |
| 5 | Is web a supported product surface or primarily a development and demo target? | **CLOSED.** A supported product surface. The Render web beta is a real surface users are pointed at. It stays in the verification gate (`npm run build:web`) and in the beta test matrix. | D8 |

Two decisions were recorded that no question had asked for, and they change the roadmap:

- **D2 — motivation.** Intrinsic first: the reward is achieving the goal. Streaks and quest mechanics
  are *deprioritised, not rejected*; a lightweight game layer stays on the roadmap.
- **D7 — monetisation.** The whole loop is free; the paid subscription is **AI assistance** —
  suggestions and re-planning driven by the user's own trends. This needs a workstream that no
  milestone below currently covers.

Still open per `docs/PRODUCT.md`, and needing beta evidence rather than a decision: whether the
timer's interruption motivates or stresses (D3), how much of the game layer to build and when (D2),
and which AI capabilities justify the subscription and what runs on-device (D7).

## Milestones

> **Corrected 2026-09-12 (#10):** the R1, R2 and R3 evidence below was written on 2026-09-03 while it
> described an **unmerged** branch, `codex/r1-data-safety`. That branch has since been merged: PR #2
> and PR #16 landed on 2026-09-11 giving `origin/main` = `261c592`, then PR #17 (#3) and PR #22 (#7).
> `origin/main` is `9cca4f2` at the time of writing and is where this work now lives. Read those
> sections as describing `main`, not a side branch.
>
> One thing did **not** move with it: the Render blueprint still builds the public web beta from
> `codex/r1-data-safety`, not from `main`. That is issue **#11** and is the director's call — it is
> recorded here as **open** and nothing on Render was changed by this pass.

### R0 — Reproducible baseline (local/web and CI complete; native smoke deferred)

Acceptance:

- npm ci, npm run typecheck, and npm run build:web pass from a clean checkout.
- Repository guidance and the Codex revival loop are checked in.
- CI runs the same non-interactive verification gate.
- A minimal automated test setup covers representative core and store behavior.
- The app receives a manual smoke pass on at least one mobile platform.

Evidence recorded 2026-09-03:

- A clean `npm ci` and `EXPO_NO_TELEMETRY=1 npm run verify` pass locally on Node 24.13.0: strict typecheck, 11 Vitest core/store tests, and a successful web export.
  > **Corrected 2026-09-12 (#10):** the 11 was correct for the R0 baseline commit `eb357c3`, where the
  > suite is two files — `engine.test.ts` (8) and `useAppStore.test.ts` (3). It is **not** the size of
  > the suite today: 7 files, 79 tests at `9cca4f2` (`npm test`, exit 0). Kept as the R0 record.
  > Separately, the Node 24.13.0 in this line was never reproduced: the orchestrator recorded on
  > 2026-09-11 that the current host `helix-shed-ds` had no Node at all before it installed a portable
  > v22.23.2, so this R0 evidence was recorded on a different machine and is **unverified here**.
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
  > **Corrected 2026-09-12 (#10):** 54 is a count of `it(` declarations, not of tests run. The tree it
  > describes (`d5b1e87`, unchanged under `tests/` through `1fa3f45`) runs **62** — the two `it.each`
  > blocks in `tests/store/persistence.test.ts` expand to eight cases more than are written. The
  > forced-timezone run itself has **not** been re-done in this pass; whether it still passes at
  > `9cca4f2` is **unverified**.
- Tracking creation, edits, reassignment, deletion, routine-block unlinking, and goal progress are reconciled atomically. Completion is idempotent, corrected progress can reopen an automatically completed goal, and linked activity relationships cannot be invalidated through public actions.
- `npm run verify` passes on the SDK 57 stack: strict typecheck, 54 Vitest tests across six files, and production web export. A browser migration smoke loaded data created under SDK 54–57, wrote a schema-4 marker, reloaded it successfully, and produced no runtime errors.
  > **Corrected 2026-09-12 (#10):** both numbers in this line were wrong when written. The tree is
  > **seven** test files, not six (`dateTimeAndValidation`, `engine`, `prediction`, `goalTracking`,
  > `hydrationAndBackup`, `persistence`, `useAppStore`), and it runs **62** tests, not 54 — see
  > "Measurement corrections" above. Replaced by 7 files / 79 tests at `9cca4f2`, measured
  > 2026-09-12. The typecheck and web-export halves of the claim still hold: both exit 0 at `9cca4f2`.
- Native AsyncStorage read/write failure behavior, storage pressure, suspend/resume, runtime timezone changes, and screen-reader behavior remain manually unverified because no native target is available. These are release gates, not blockers for the local R1 checkpoint.

### R2 — Core loop quality (local/web complete; native accessibility smoke deferred)

Acceptance:

- A user can plan, start, stop, and review time with a short, consistent flow.
- Accessibility labels, focus behavior, touch targets, and empty/error states are reviewed.
- Oversized screens and store responsibilities are split only where doing so improves active work.
- Visible placeholder actions are implemented or removed.

Added 2026-09-12 (#10) from `docs/PRODUCT.md` D3 and D4. These are **not yet built** and no evidence
below covers them; the 2026-09-03 evidence predates the decisions:

- **Two tracking modes, measured separately (D3).** Realtime (Pomodoro-style timer started at the
  moment, high data quality) and Retroactive (end-of-day from-memory logging, loose). Both are
  first-class. Adherence is tracked **separately for each**, so the app can show the user that more
  disciplined tracking correlates with more goal completion, while still treating loose logging as
  better than nothing. Open risk to test in beta, not to assume: a timer that announces "it is time
  now" may feel stressful or guilt-inducing.
- **The weekly review is a first-class ritual (D4).** A notification invites a "review and re-adjust
  the week" session. The review **is itself timeboxed with a timer** so it cannot become
  perfectionist planning. The app proposes adjustments from observed data rather than nagging — *"You
  have not met your Tuesday fitness slot for three weeks. Shall we drop it?"* — and frames a removed
  slot as a realistic correction, placed next to what the user **is** achieving, not as a failure.

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

Added 2026-09-12 (#10) from `docs/PRODUCT.md` D5. **Not yet built** — tracked as issue #12 and
explicitly untouched by the #7 fix:

- **The forecast date is a specific date, and it is tappable.** Show "17 Apr", not a range, labelled
  as an estimate built from the user's own estimates. Tapping it breaks down what produced it: how
  much comes from the original estimate, how much from the actual completion trend, and how much from
  **drift** — scheduled hours versus hours actually done, where 5h planned and 5h done is zero drift.
- Each date carries a visible strength-of-prediction signal so a well-evidenced date is
  distinguishable from a guess. The existing confidence level is the nearest thing built today; D5
  does not say the current three-level wording satisfies it.

Evidence recorded 2026-09-03:

- Forecasts now group active goals by activity so scheduled capacity is never counted in full for every goal. Goal-linked blocks remain dedicated; only unlinked activity time enters the shared pool, and capacity linked to inactive or other goals stays reserved.
- The shared pool is allocated by the existing five priority levels (weights 5 through 1). An event-based deterministic forecast redistributes only shared capacity as goals finish, while dedicated blocks remain reserved for their linked goal.
- Each result exposes total activity capacity, the goal's initial weekly allocation, dedicated and shared portions, capacity linked elsewhere, competition count, remaining work, completion horizon/date, distinct evidence days, confidence level, and a plain-language confidence reason.
- Confidence describes evidence quality rather than probability. Only positive completed tracking on distinct days since the active routine's latest update counts; zero-allocation goals are always low confidence with no date, even when another goal has rich history.
- Goals explains the model globally and per goal: current routine/priorities are assumed to continue, goal-linked time stays dedicated, and unlinked time is shared/reallocated. The UI distinguishes no schedule, reserved capacity, and genuine competition instead of presenting an unexplained date.
- Eight focused forecast tests cover priority competition without double-counting, reallocation, equal priorities, completed/paused exclusion, dedicated and inactive-linked reservations, zero capacity, schedule changes, sparse/stale evidence, offset timestamps, and input-order stability. Together with existing engine coverage, the focused R3 gate passes 16/16 tests.
  > **Corrected 2026-09-12 (#10):** 16 was right for `d5b1e87` — `prediction.test.ts` 8 plus
  > `engine.test.ts` 8, neither of which uses `it.each`, so unlike the R1 figure this one matched its
  > run. It is now **19** at `9cca4f2` (prediction 11, engine 8), measured by
  > `npx vitest run --reporter=verbose`. The three added prediction tests came from the #7 fix.
- Browser smoke rendered the assumption panel, allocated/total weekly capacity, dedicated-versus-reserved explanations, no-capacity states, dates, and confidence reasons against migrated schema-4 data without runtime errors. Independent review returned GO after two correction rounds.
- The weighting and confidence thresholds are explicit prototype assumptions, not validated behavioral science. R4 beta evidence should determine whether users expect priority weights, whether inactive-linked time should be lendable, and how much recent adherence is enough to raise confidence.

Correction recorded 2026-09-11 (issue #7):

- Confidence counted evidence since the *whole routine's* `updatedAt`, so editing any block collapsed every goal's confidence — the common case for any routine with more than one activity type. Evidence is now counted since `Routine.capacityChangedAt[activityTypeId]`, an optional map the routine-block actions stamp for the activity types they actually change.
- The activity type is the correct granularity, not the block: goals sharing an activity type draw on the same unlinked pool and inherit each other's reallocations, so a change to any of that type's capacity really can move all of their dates. Across activity types the forecasts are independent, which is exactly where the old blast radius was wrong.
- Evidence window for routines saved before the field existed: `Routine.updatedAt`, unchanged from the behaviour they were written under. The block actions lazily seed the map for every activity type already present in the routine with that previous `updatedAt` before stamping the changed ones, so the first edit after migration does not collapse the untouched activity types through the fallback. A malformed persisted entry is dropped on hydration and falls back the same way rather than failing hydration.
- Known remainder, not fixed here: `updateRoutine` (rename, activate) also bumps `updatedAt`, so a pre-migration routine that is renamed before any block is edited still collapses through the fallback. Once the map exists, routine-level edits no longer touch confidence.

### R4 — Beta and learning loop

Acceptance:

- EAS development/preview builds and versioning are configured.
- A small beta cohort can install the app and submit structured feedback.
- Privacy and local-data behavior are documented.
- The next roadmap is driven by observed retention and usability evidence.

Evidence recorded 2026-09-03:

- A new Render Blueprint named `zenroutine-beta` manages exactly one new static resource, `zenroutine-web`, sourced from `RogueKostas/ZenRoutine` on the isolated `codex/r1-data-safety` branch. Existing Render projects and services were not modified.
  > **Still true, and now a problem — recorded 2026-09-12 (#10):** the blueprint is still pointed at
  > `codex/r1-data-safety`. That branch was the only place the work lived when this was written; since
  > the 2026-09-11 merges it is `main` that carries R1–R3 plus the #3 and #7 fixes, so **the public
  > beta is serving a build that is missing both merged fixes**. Repointing it is issue **#11** and is
  > the director's call. Nothing on Render was inspected or changed by this pass; the running
  > deployment's actual commit is **unverified here**. The orchestrator separately recorded the
  > service at ~USD 17/month and flagged that what the spend buys has not been established.
- The Expo single-page web export is live over HTTPS at https://zenroutine-web.onrender.com. The first deployment built commit `235649f` successfully in 47 seconds.
- The deployed-browser smoke passed onboarding, goal creation, goal-linked timer start/stop, recent-session review, and persisted state in a second browser tab. A direct request returned HTTP 200 with the configured content-type, referrer-policy, and frame-protection headers.
- EAS development, internal-preview, and production profiles are checked in; `expo-dev-client`, iOS bundle identifier `com.roguekostas.zenroutine`, and matching Android application ID are configured. The repository still needs to be linked to the correct personal Expo account before the first cloud build.
- The connected-beta contract defines guest ownership, explicit first-sign-in transfer, optimistic revision conflicts, active-timer conflict behavior, deletion, privacy, and two-device acceptance evidence. Authentication and remote persistence are not implemented yet.

### R5 — Connected product

Only start this milestone after the product decision. If accounts, sync, collaboration, or server-owned notifications are required, define data ownership and conflict behavior before selecting backend services.

> **Corrected 2026-09-12 (#10):** this milestone was titled "Optional connected product" and gated on
> a decision that has now been made. **The decision came back yes** (`docs/PRODUCT.md` D6): plan
> authentication, including Google sign-in, and cross-device persistence **now, not later** —
> multi-device is needed for development and testing, never mind the product. R5 is therefore
> **planned work, not an option**, and the "only start after the product decision" sentence above is
> spent. It is kept because it records the gate that was cleared.
>
> The condition it set was also already met: data ownership and conflict behaviour were defined
> before backend selection, in `docs/CLOUD_BETA_TASK.md`, and D6 confirms those rules stand. The
> constraint that survives is that the offline-first guest core stays — the app must work signed out,
> and signing in must **never** silently upload, replace or merge existing device data.
>
> Acceptance for R5 is **not yet written**, and nothing here is built: the R4 evidence below records
> that authentication and remote persistence are not implemented.

### R6 — AI assistance and the subscription boundary

Added 2026-09-12 (#10) from `docs/PRODUCT.md` D7, which introduced a workstream that no milestone
covered. **Nothing here is planned in detail, scoped, or built** — this section exists so the
decision is not lost between the product document and the roadmap.

Everything in the set/plan/track loop stays free. The paid subscription is **AI assistance**:
suggestions and re-planning driven by the user's own trends and goals. D7's own open question is
which AI capabilities justify a subscription and what runs on-device versus server-side; that is
unanswered, and it interacts with the privacy promise in D6. D2's lightweight game layer is also
unscheduled and belongs to whoever plans this phase.

## Upgrade path

Keep the current architecture. Upgrade Expo incrementally from SDK 54 to 55, then 56, then 57, following Expo's compatibility checks and verifying typecheck, web export, and a mobile smoke test at each step. Avoid mixing the framework upgrade with product feature work.

### SDK 55 — local/web complete; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 55.0.31, React Native 0.83.10, and React 19.2.0. Removed the obsolete `newArchEnabled` and `android.edgeToEdgeEnabled` configuration flags; SDK 55 is New Architecture-only and Android edge-to-edge is mandatory.
- A clean `npm ci`, `npx expo install --check`, `npx expo-doctor@latest`, `npx expo config --type public`, and `EXPO_NO_TELEMETRY=1 npm run verify` all pass. Expo Doctor reports 20/20 checks, and the verification gate passes strict typecheck, all 11 core/store tests, and the production web export.
  > **Corrected 2026-09-12 (#10):** "all 11" was accurate at this step's commit `f228fd1`, where the
  > suite is `engine.test.ts` (8) plus `useAppStore.test.ts` (3), verified by reading those files at
  > that commit. It reads as a present-tense description of the suite and is not one: 7 files, 79
  > tests at `9cca4f2`. `git log eb357c3..a192181 -- tests` is empty, so 11 was the true figure at
  > every step of the SDK 54→57 path.
- The browser smoke preserved the SDK 54 goal and linked weekly routine block, created a new SDK 55 goal, started/stopped a timer, rendered analytics, and preserved the new goal after reload. Metro produced no runtime error output during the interaction.
- The dependency audit now reports 25 advisories (1 low, 17 moderate, 6 high, 1 critical), down from 32 on SDK 54. Continue resolving these through staged SDK upgrades; do not force-fix the dependency graph.
- Native behavior remains unverified because this Windows host has no attached phone or available emulator. Before a distributable build, verify Android edge-to-edge tab-bar insets, native stack/modal transitions, drag interactions, and dark-theme system-bar contrast. SDK 55 retains Android 7+ and iOS 15.1+ minimum OS support and requires Xcode 26.2+ for iOS builds.
- Independent review found no source-level SDK 55 blocker. It identified the existing asynchronous Zustand hydration/startup ordering risk as the first R1 fix and a static responsive-width issue in onboarding as an R2 candidate.

### SDK 56 — local/web complete as a bridge checkpoint; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 56.0.21, React Native 0.85.3, React 19.2.3, and TypeScript 6.0.3. The SDK 56 compatibility fixer aligned native dependencies and added the `expo-status-bar` config plugin.
- Migrated the removed legacy `expo.splash` field to the `expo-splash-screen` config plugin, removed the obsolete custom Babel/import-meta workaround, and replaced React Native 0.85's removed `StyleSheet.absoluteFillObject` API.
  > **Evidence added 2026-09-12 (#10) — the claim stands, for a reason it did not state.** Calling the
  > workaround "obsolete" was asserted here with nothing behind it, and the independent review
  > rightly flagged the deletion as **F6 / issue #8, P1 plausible**: `babel.config.js` was removed
  > along with the `unstable_transformImportMeta: true` that its own comment said SDK 54/55 needed,
  > or Zustand's ESM middleware would leave `import.meta` in the bundle under Hermes — with no
  > replacement config.
  >
  > **#8 is closed as NOT A DEFECT.** `babel-preset-expo` **56.0.0** (2026-05-05) shipped "BREAKING:
  > Enable `import.meta` transform by default and rename option to `transformImportMeta`". The
  > transform became default-on in the *same SDK step that deleted the config file*, so the deletion
  > removed a setting that had become the default rather than removing the protection. Verified
  > directly in the installed tree at `9cca4f2`: `babel-preset-expo` is **57.0.10**, and
  > `node_modules/babel-preset-expo/build/configs/expo.js:92` reads
  > `const polyfillImportMeta = options.transformImportMeta !== false` — opt-out, not opt-in.
  >
  > Two further corrections the #8 lane made, both accepted. `babel-preset-expo` was **not** dropped
  > from the dependency tree: `expo@57.0.19` declares it as a direct dependency
  > (`package-lock.json:2923-2926,3731`), so only the project config file and the explicit flag are
  > gone. And the file was deleted at the **SDK 56** step (`4a10b53`, confirmed by
  > `git log --diff-filter=D -- babel.config.js`), not SDK 57 as the issue text had it.
  >
  > **Still unverified:** no native run. The web bundle is measured, Hermes startup on a device is
  > not — see issue #15.
- A clean `npm ci`, `npx expo install --check`, `npx expo config --type public`, and `EXPO_NO_TELEMETRY=1 npm run verify` pass. The gate passes strict TypeScript 6 typecheck, all 11 core/store tests, and the production web export.
  > **Corrected 2026-09-12 (#10):** accurate at this step's commit `4a10b53` for the same reason as
  > SDK 55 above — no test file changed anywhere across the upgrade path. Superseded by 7 files, 79
  > tests at `9cca4f2`.
- Expo Doctor passes 21/22 checks. Its only failure is the official SDK 56 Hermes V1 memory-regression warning, whose prescribed current resolution is the already-planned upgrade to Expo 57.0.17+ and React Native 0.86.3+; therefore SDK 56 is a verified bridge checkpoint, not a release target.
- Browser smoke preserved the SDK 54 and SDK 55 data, created an SDK 56 goal, started/stopped a timer, rendered analytics, and preserved the new goal after reload. It also surfaced and verified a fix for an empty-string conditional rendered as a raw text node in the goal modal under the newer runtime.
- Development logs retain non-blocking web deprecation warnings for legacy shadow props and `pointerEvents`; address those during R2 UI/accessibility work. The dependency audit reports 24 advisories (1 low, 19 moderate, 3 high, 1 critical); continue through SDK 57 without a forced audit rewrite.
- SDK 56 raises the iOS minimum to 16.4 and requires Xcode 26.4+. Native compilation, splash appearance, safe-area/tab-bar behavior, navigation transitions, gestures, animations, and suspend/resume remain deferred until an appropriate device or build host is available.

### SDK 57 — local/web complete; native smoke deferred

Evidence recorded 2026-09-03:

- Upgraded through Expo's supported installer to Expo 57.0.19 and React Native 0.86.3, exceeding the Expo 57.0.17 floor that includes both SDK 56 Hermes regression fixes. React and React DOM remain 19.2.3, TypeScript remains 6.0.3, and Node 22.13 remains the supported repository runtime.
- A clean `npm ci`, `npx expo install --check`, `npx expo-doctor@latest`, `npx expo config --type public`, `npm ls --depth=0`, and `EXPO_NO_TELEMETRY=1 npm run verify` all pass. Expo Doctor reports 21/21 checks, and the verification gate passes strict typecheck, all 11 core/store tests, and the production web export.
  > **Corrected 2026-09-12 (#10):** accurate at this step's commit `a192181`, where the suite is still
  > `engine.test.ts` (8) plus `useAppStore.test.ts` (3). Superseded by 7 files, 79 tests at `9cca4f2`.
  > The R1–R3 test growth arrived in the next commit, `d5b1e87`, after the upgrade path closed.
- Browser smoke preserved data created under SDK 54, 55, and 56; created an SDK 57 goal; started/stopped a timer; rendered analytics; and preserved the new goal after reload. Development logs showed the already-recorded web deprecation warnings but no runtime errors.
- The dependency audit reports 23 advisories (1 low, 19 moderate, 2 high, 1 critical), down from 32 at the start of the upgrade path. Do not force-fix the remaining transitive tooling advisories; review them individually before release and continue removing them through supported dependency updates.
- Independent compatibility scanning found no React Native 0.86 source blocker. Native-device checks are still required for tab-bar and bottom-sheet safe-area insets, status-bar/theme consistency, splash appearance, navigation/modal transitions, gestures, animations, keyboard behavior, persistence, and timer suspend/resume.
- SDK 57 retains Android 7+/API 36 and iOS 16.4+/Xcode 26.4 native requirements. The SDK 54→57 stack upgrade is complete locally; SDK 57 is the maintained target for R1–R3 work.

## Cloud environment recipe

The repository needs no secrets for its current offline-first feature set. Render hosts the web beta; it does not replace Expo/EAS for native builds.

- Repository: RogueKostas/ZenRoutine
- Runtime: Node.js 22.13 or a compatible Node 22 release
- Setup: npm ci
- Agent internet access: off unless a task explicitly requires dependency or documentation access
- Verification: npm run verify
- Web beta: https://zenroutine-web.onrender.com
- Render Blueprint: `zenroutine-beta`, scoped to the `zenroutine-web` static site only — **still built
  from `codex/r1-data-safety`, not `main`; see issue #11**

Toolchain actually measured on the current host `helix-shed-ds` on 2026-09-12, for the run cited
throughout this document: portable Node **v22.23.2**, npm **10.9.8**, Vitest **4.1.11**. This
satisfies the "Node 22.13 or a compatible Node 22 release" line above. The host had no Node, npm, gh
or Claude CLI at all before the orchestrator installed portable copies under `C:\CoworkBridge\tools`
on 2026-09-11, so no evidence in this document dated 2026-09-03 was produced on this machine.

Codex cloud remains deferred while this ChatGPT account is connected to the active `HyperKostas` work identity. Do not reconnect or replace that identity for ZenRoutine. This is separate from Render, whose GitHub integration exposes the `RogueKostas/ZenRoutine` repository and is now used for the web beta. Cloud tasks should work on branches and return reviewable diffs; deployment and merging remain explicit user actions.

## Next ready slice

Review the R1–R3 prototype at https://zenroutine-web.onrender.com and complete a phone/tablet web smoke. Next, link the repository to the correct personal Expo account, create an EAS preview build, and close the documented native-device deferrals. In parallel, add privacy and structured beta-feedback surfaces. Start authenticated cloud persistence only as the separate feature-flagged slice defined in `docs/CLOUD_BETA_TASK.md`; use beta evidence to calibrate the forecast assumptions before expanding the product surface.

> **Updated 2026-09-12 (#10).** The slice above still holds with two changes and one warning.
>
> The warning first: **reviewing the Render URL no longer reviews this plan's code.** The blueprint
> still builds from `codex/r1-data-safety`, so the deployed beta predates both merged fixes. Resolve
> issue #11 before asking anyone to review the hosted build, or the review will describe bugs that
> are already fixed on `main`.
>
> Changed by the product decisions: authenticated cloud persistence is **no longer conditional**
> (D6), so "start it only as a separate feature-flagged slice" now describes *how* to build it, not
> *whether* to. And the forecast work waiting on beta evidence is narrower than it was — D5 settled
> the presentation (exact tappable date, estimate/trend/drift breakdown, #12); what still needs
> evidence is the calibration underneath it, the priority weights and the 7/14 distinct-day
> confidence thresholds.
>
> Ahead of all of it in the fix queue: **F2/#4, F3/#5, F4/#6 and F7/#9 are still open**, and F2, F3
> and F4 are data-loss or wrong-output defects on `main`.

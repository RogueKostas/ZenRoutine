# Lane: linkage-quarantine — a linkage failure on a well-formed entry still bricks hydration (#5)

## Lanes running beside you — stay out of their files

- `routine-writers` is in `src/store/useAppStore.ts` on #24. **Do not touch that file.** If a change
  there turns out to be genuinely required, say so in your report and stop rather than editing it.
- `notice-scope` is in `App.tsx` on #21.

Your file is `src/store/persistence.ts` plus its tests. Two PRs landed there in the last two hours —
#17 (the quarantine sink) and #28 (the blame-gated pointer clear). Read both, and read the whole of
`persistence.ts`, before writing anything.

## Also fold in: a pre-existing widening found by the #20 lane

`pendingQuarantine` is shared across the `migrate` and `merge` stages of a single hydration run and
is reset only in `onRehydrateStorage` (`src/store/useAppStore.ts` — read it, do not edit it). So on a
legacy blob, the blame check evaluated during `merge` can be satisfied by a record dropped during
`migrate`. That is still far narrower than the gate it replaced, but it is not per-stage.

Decide whether it should be per-stage, do it if it belongs in this file, and if the only correct fix
is in `useAppStore.ts`, say so and leave it — that file belongs to another lane right now.

## And a warning from the #19 probe, which will otherwise cost you a wasted test

`parseTrackingEntry` is called as `parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)`, so
on a **pre-v4 blob `repairLegacyValues` is `true`** and malformations like `endTime < startTime` are
*repaired*, not quarantined. A regression test built on that malformation against a v3 envelope
**passes vacuously**. Use a malformation that throws regardless of leniency: an invalid `source`, a
non-string `id`, an unparseable date, or a non-object row.

## Why
`src/store/persistence.ts:342-352` throws on a dangling `activityTypeId` with no `version < CURRENT_SCHEMA_VERSION` gate — unlike the `goalId` linkage check (`persistence.ts:367-388`) and the `routineBlockId` linkage check (`persistence.ts:401-413`), which repair legacy data by clearing the dangling id and only throw at current-version steady state.

The pre-PR store did no structural validation at all (blind `persistedState as AppState`), so any inconsistency already on a real device — a partial write, a hand-edited or restored backup, any path that ever detached an activity type — turns a repairable migration into the same destructive-reset lockout as F1.

Found by independent adversarial review before PR #2 was merged. Severity P2, CONFIRMED.

## Deliver
1. Make the `activityTypeId` check consistent with its two siblings: repair for legacy versions, throw only at current-version steady state.
2. A test for each of the three linkage checks proving legacy data is repaired and current-version corruption is still rejected.

## Gates
- `npm ci` from the tracked lockfile first — a fresh worktree has no dependencies.
- `npm run typecheck` — exit 0, no new `any`, `@ts-ignore` or `@ts-nocheck`.
- `npm test` — exit 0, and the suite count must not go down.
- `npm run build:web` — exit 0.
- Add a **negative control** for every new test: make it fail deliberately once, record that it went red, then restore it. A check that cannot go red is not a check.

## Do not
- Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build` or any Render command.
- Do not touch files outside the scope above — other lanes are working in this repo.
- Do not regenerate `package-lock.json`; it is tracked, reviewed truth.
- Corrections to this brief are welcome and expected. If the framing here is wrong, say so in your report.

## Report must include
Files or behaviours examined, command output as evidence, actionable findings, and a **Not done / unverified** section.

## Done means
The three linkage checks behave identically with respect to version, and a legacy store with a dangling activity type hydrates with the reference cleared.


---

## Scope widened — this is now the larger half of the issue

**Scope widened by the orchestrator, after the non-author review of PR #17.**

This issue was originally only about making the dangling `activityTypeId` check version-consistent
with its two siblings. The review of PR #17 found that the linkage checks are a **second live route
to the same permanent brick that #3 was filed for**, and that is now part of this issue.

`src/store/persistence.ts:485-508` and `:513-533`: `hasInvalidEntryGoal` and
`hasInvalidEntryRoutineBlock` are computed with `.some()` over all `trackingEntries` and throw
unconditionally on the current-version path — entirely outside the quarantine-catching `flatMap` that
PR #17 added at `:427-441`.

Failure scenario: a tracking entry parses perfectly — valid dates, valid `activityTypeId`, valid
`source` — but its `goalId` no longer matches any goal in `goals`, because a goal record vanished
from the blob (a torn AsyncStorage write during `deleteGoal`, a hand-edited blob, a buggy restore).
`merge()` then throws `Invalid tracking entry goal: goal is missing or uses another activity type`
on **every** future launch, and the only recovery the UI offers wipes all local data. That is issue
#3's failure mode for a different corruption shape.

This is not a defect in PR #17 — its brief explicitly reserved the linkage checks for this issue and
#4, and the lane flagged the gap in its own report. It is the right place to fix it.

**So this issue now covers both:**

1. Make the `activityTypeId` check version-consistent with the `goalId` and `routineBlockId` checks —
   repair for legacy versions, throw only at current-version steady state (the original scope).
2. Route linkage failures through the **same quarantine sink** PR #17 added, so an entry whose
   references have gone stale is set aside with the rest rather than bricking hydration. A record
   quarantined this way must reach the side-car exactly as a parse failure does.

Acceptance, in addition to the original: a store containing one well-formed tracking entry with a
dangling `goalId`, and another with a dangling `routineBlockId`, hydrates with those entries
quarantined and every other goal, routine and entry intact — proven by tests that fail without the
fix.

Read PR #17 and `src/store/persistence.ts` in full before starting; the quarantine mechanism you are
extending landed there.


## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck -> test -> build:web. Run the individual scripts.
- A fresh worktree has **no** `node_modules`. `npm ci` first.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **88 tests at `44a8916`**, measured by the orchestrator. Re-measure at your own tree
  and cite it; do not copy that number forward without running it.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] **A negative control per new test**: make it fail deliberately, paste RED, restore, paste
      GREEN. `MISSING` — no output — is its own outcome and it FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at, especially anything only a device can settle —
**#15 is open: no physical-device smoke has ever been run on this project.**

**Corrections to this brief are welcome and expected.** Follow the measurement over the brief and say
so at the TOP of your report. Six lanes have now corrected my briefs and all six were right.

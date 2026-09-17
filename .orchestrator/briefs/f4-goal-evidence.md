# Lane: f4-goal-evidence — forecast confidence is scoped to activity type, not to the goal (#6)

## Why

`src/core/engine/prediction.ts` — `getForecastEvidence` filters tracking history by
`activityTypeId` only. It never checks `entry.goalId`. The resulting `confidenceLevel` and
`confidenceReason` are shown per goal in `GoalsScreen.tsx`.

Failure scenario: two active goals share the activity type "study". Every tracking entry in history
belongs to goal A. Goal B, which the user has never worked on, counts all of A's distinct evidence
days and is shown a high-confidence completion date.

The existing test (`tests/core/prediction.test.ts`) does not expose this only because the competitor
goal's allocation is zero, which short-circuits before evidence is counted. Give it any allocation
and the bug surfaces. Severity P1, CONFIRMED by independent review before PR #2 was merged.

**Line numbers deliberately omitted.** Two PRs have landed in this file since the finding was
written (#17 and #22). Locate the code yourself and report if the described behaviour has changed.

## What landed in this file just before you, and must not be undone

PR #22 (issue #7) changed *when the evidence clock starts*: evidence is now counted from
`Routine.capacityChangedAt[activityTypeId]` via `getCapacityChangedAt(routine, activityTypeId)`,
not from `routine.updatedAt`. That fix is orthogonal to yours — it decided **when**, you are
deciding **whose** — and its tests must keep passing untouched. The lane that did it kept
`getForecastEvidence`'s goal-vs-activity filtering byte-for-byte unchanged specifically so that you
could change it cleanly. Do not revert or re-plumb `capacityChangedAt`.

`docs/PRODUCT.md` D5 is the director's decision that the forecast shows an exact date with a visible
strength-of-prediction signal, and that the date becomes tappable to show its working (issue #12,
a later lane). A confidence signal attributed to the wrong goal makes that feature actively
misleading, which is why this is p0.

## Deliver

1. **Scope evidence to the goal.** Decide explicitly how entries with **no `goalId`** are treated —
   they are genuinely ambiguous, and whichever way you go, the decision needs to be written in a
   comment next to the code rather than inferred from behaviour. Consider that unlinked time feeds
   the shared pool, so unlinked tracking may be legitimate evidence for *any* goal drawing on that
   pool; that is an argument, not a conclusion. Make the call and defend it.
2. Keep the stated semantics: confidence describes **evidence quality, not probability**, and only
   positive completed tracking on distinct days counts. See the R3 section of
   `docs/REVIVAL_PLAN.md`.
3. Tests: two active co-allocated goals of the same activity type with different histories report
   different confidence; a goal with no tracking of its own never inherits a sibling's evidence.
   This also closes the coverage gap recorded as **#9 (F7)** — if your tests cover it, say so and
   I will close #9 against your PR.

## Scope

`src/core/engine/prediction.ts`, `tests/core/prediction.test.ts`, and `src/screens/GoalsScreen.tsx`
only if the confidence copy has to change.

**Do NOT touch** `src/store/useAppStore.ts` or `src/components/routine/BlockEditor.tsx` — a lane is
working there on #23 right now. Do NOT touch `src/store/persistence.ts` or the quarantine/hydration
paths. Do NOT touch `docs/REVIVAL_PLAN.md` — a lane is editing it on #10.

Do NOT publish, release, merge, push, or move shared pins. Forbidden here: `git push`, `gh auth`,
`git stash`, `--force`, `--skip-`, `npm publish`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. The orchestrator
lands this work.

## Read first

1. `AGENTS.md` — the binding working agreement.
2. `src/core/engine/prediction.ts` in full. The model groups active goals by activity so capacity is
   not double-counted, keeps goal-linked blocks dedicated, shares only unlinked time, and allocates
   the shared pool by five priority weights. Understand it before changing anything.
3. `docs/REVIVAL_PLAN.md`, the R3 section — the intended confidence semantics.
4. `tests/core/prediction.test.ts` — the allocation arithmetic there was independently re-derived
   during review and is sound. Do not weaken it.

## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck → test → build:web. Run the individual scripts so you can see
  which failed; read `package.json` first.
- A fresh worktree has **no** `node_modules`. `npm ci` first.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite is **79** at `origin/main` (measured by the
      orchestrator at the merge of PR #22); it must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] **A negative control per new test**: make it fail deliberately, paste RED, restore, paste
      GREEN. A check that cannot go red is not a check. `MISSING` — no output — is its own outcome
      and it FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed on this lane's branch, message stating what is NOT OBSERVED.

## Report

Say plainly what a human still has to look at, especially anything only a device can settle (#15 is
open: no physical-device smoke has ever been run on this project). State your decision on unlinked
entries prominently — it is the judgement call in this lane, and the orchestrator will review it as
such.

**Corrections to this brief are welcome and expected.** If a measurement disagrees with the brief,
follow the measurement and say so at the TOP of your report.

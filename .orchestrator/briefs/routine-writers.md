# Lane: routine-writers — setActiveRoutine and updateRoutine bump updatedAt without stamping (#24)

## Lanes running beside you — stay out of their files

- `quarantine-blame` is in `src/store/persistence.ts` on #20. **Do not touch that file.**
- `zustand-probe` is measuring on #19 and edits nothing.
- `render-branch` is in `render.yaml` on #11.

Your file is `src/store/useAppStore.ts` (routine-level mutations only) plus its tests. Two PRs
landed in that file within the last hour — #22 (`withCapacityChangedAt`) and #26 (the no-op guard
and `CAPACITY_RELEVANT_BLOCK_FIELDS`). Read both before you write anything; the mechanism you are
extending is theirs.

## Why

Found in the non-author review of PR #22 (F5). **P1 as a code defect, narrow reachability today.**

`src/store/useAppStore.ts:610-620`, unchanged by that PR:

```js
routines: state.routines.map((r) => ({ ...r, isActive: r.id === id, updatedAt: new Date().toISOString() })),
```

`setActiveRoutine` maps over **every** routine and stamps `updatedAt: now` on each one, whether or not
that routine's `isActive` actually changed.

Any routine whose `capacityChangedAt` map is not yet seeded for every activity type it schedules — a
routine created before the fix and not yet block-edited, or one created through any path other than
the four block mutations — falls back to `routine.updatedAt` in `getCapacityChangedAt`. That value has
just been reset to now, so its forecast evidence collapses: issue #7's failure mode with no block
touched.

`docs/REVIVAL_PLAN.md:117` says *"Once the map exists, routine-level edits no longer touch
confidence"* and names only `updateRoutine` as the remainder. This is a second instance of the same
class, and the plan should say so.

Reachability today is narrow: the routine switcher in `src/components/debug/DebugPanel.tsx:304` is
`__DEV__`-gated, but `src/screens/RoutineScreen.tsx:166-167` reaches it in production — delete the
active routine, then create one — which stamps every *other* routine's `updatedAt` and primes the
problem for any routine reactivated later. The `Routine` type's own doc comment mentions Vacation
Mode, so multi-routine switching is intended near-term functionality.

## Deliver

1. Fix `setActiveRoutine` to touch only the routines whose `isActive` actually changes, and to stamp
   the map rather than only `updatedAt` where a real capacity change is implied. Activating a
   different routine genuinely does change which capacity applies — decide what that means for
   evidence and write the decision down.
2. Do the same audit for `updateRoutine` (the remainder the plan already names): a rename or an
   activate must not touch confidence.
3. **Enumerate every writer of `routine.updatedAt` and of `routine.blocks` in the store and state
   the verdict for each in your report.** Two were missed by inspection already; a list is the only
   way to know the third does not exist.
4. Tests for `setActiveRoutine` and `updateRoutine`, which the capacity-timestamp suite currently
   never calls at all.
5. Add coverage for `duplicateRoutine` carrying `capacityChangedAt`. It is correct today — the spread
   carries it and nothing mutates it in place — but has **zero** tests on any branch, so a later
   field-by-field refactor would drop it silently.
6. Tighten `updateRoutine`'s signature so `capacityChangedAt` cannot be passed in and clobber the
   map. No current call site does this; the type should make it impossible anyway.

## Gates

`npm ci` from the tracked lock first, then `npm run typecheck`, `npm test`, `npm run build:web`, each
in its own process. A negative control per new test: RED before, GREEN after, both pasted. Suite was
**79** at the merge of PR #22; it must not go down.

## Do not

Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command. Corrections to this issue are welcome and
expected.

## Done means

A written list of every `updatedAt`/`blocks` writer with a verdict for each, no writer that can
collapse confidence without a capacity change, and tests covering the three routine-level mutations
that currently have none.


## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck -> test -> build:web. Run the individual scripts so you can see
  which one failed; read `package.json` before running any aggregate.
- A fresh worktree has **no** `node_modules`. `npm ci` first, from the tracked lock.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **86 tests at `1fbc197`**, measured by the orchestrator. Re-measure at your own tree
  and cite it; do not copy that number forward without running it.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] **A negative control per new test**: make it fail deliberately, paste RED, restore, paste
      GREEN. A check that cannot go red is not a check. `MISSING` — no output — is its own outcome
      and it FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed on this lane's branch, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at, especially anything only a device can settle —
**#15 is open: no physical-device smoke has ever been run on this project.**

**Corrections to this brief are welcome and expected.** If a measurement disagrees with the brief,
follow the measurement and say so at the TOP of your report. Three lanes have now corrected my
briefs and all three were right.

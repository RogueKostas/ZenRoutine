# Lane: no-op-save - a no-op block save still collapses that activity type's confidence (#23)

## Why

Found in the non-author review of PR #22 (F5). **P1, CONFIRMED. This is the dominant real-world
trigger of issue #7, and it survived the fix for it.**

`src/store/useAppStore.ts:689-725`: `updateRoutineBlock` builds
`updatedBlock = { ...block, ...data }` and then calls
`withCapacityChangedAt(routine, [block.activityTypeId, updatedBlock.activityTypeId], now)`
**unconditionally**. Nothing checks whether `updatedBlock` differs from `block`.

`src/components/routine/BlockEditor.tsx:113-121` has no dirty check either: when `isEditing`, Save
always calls `updateRoutineBlock(routineId, block.id, { startMinutes, endMinutes, activityTypeId,
goalId })` with whatever is currently on screen.

Failure scenario: a user opens an existing "Fitness" block to look at it — or only to relink its goal,
leaving the activity type and times alone — and taps Save. `capacityChangedAt['fitness']` is stamped
to `now`. Every Fitness goal drops from "high confidence, tracked across 20 days" to
"low confidence — No completed tracking days since this routine changed". No capacity changed.

PR #22 was still a strict improvement — before it, that same tap collapsed *every* activity type —
which is why it landed. But this path is reachable on **every** block edit, so the #7 headline is not
actually delivered until this is fixed.

## Deliver

1. Stamp only when capacity actually changed. The capacity-relevant fields are the activity type, the
   day, the start and end minutes, and the goal link (a goal link moves time between the dedicated
   and shared pools, so it counts). A change to anything else — or to nothing — must not stamp.
   Write the list of capacity-relevant fields down in the code; the next reader should not have to
   infer it.
2. Consider whether `BlockEditor` should avoid calling the store at all on an unchanged save. Fix the
   store regardless — the store must be correct whatever the UI does — and say in your report whether
   the UI change is also worth making.
3. Tests: a no-op save leaves `capacityChangedAt` untouched; a goal-only relink DOES stamp; a time
   change stamps; an activity-type change stamps both the old and the new type (this already works —
   do not break it).

## Gates

`npm ci` from the tracked lock first (a fresh worktree has none), then `npm run typecheck`,
`npm test`, `npm run build:web`, each in its own process. A negative control per new test: RED
before, GREEN after, both pasted. Suite was **79** at the merge of PR #22; it must not go down.

## Scope

`src/store/useAppStore.ts` (the block mutations only) and `src/components/routine/BlockEditor.tsx`,
plus tests. **Do not touch** `src/core/engine/prediction.ts` or `tests/core/prediction.test.ts` — a
lane is working there on #6. Do not touch the quarantine or hydration paths in
`src/store/persistence.ts`.

## Do not

Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command. Do not regenerate `package-lock.json`.
Corrections to this issue are welcome and expected.

## Done means

Opening a block and tapping Save without changing anything leaves every goal's confidence and
evidence-day count exactly as it was — proven by a test that fails without the fix.


## Read first

1. `AGENTS.md` — the binding working agreement.
2. PR #22 and `withCapacityChangedAt` in `src/store/useAppStore.ts` — the mechanism you are
   refining landed there minutes ago.
3. `src/components/routine/BlockEditor.tsx` — the Save path.
4. `docs/PRODUCT.md` D5 — why confidence has to be trustworthy.

## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate. Confirm with `git ls-files --error-unmatch`.
- `npm run verify` chains typecheck -> test -> build:web; run them individually.
- A fresh worktree has no `node_modules`. `npm ci` first.
- Expo SDK 57 / RN 0.86 / TypeScript 6. Do not upgrade anything.
- Another lane is in `src/core/engine/prediction.ts` on #6 and another in `docs/REVIVAL_PLAN.md` on
  #10. Stay out of both.

## Acceptance

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted.
- [ ] `npm test` exit 0, tail pasted. **79** at `origin/main`; must not go down.
- [ ] `npm run build:web` exit 0, own process.
- [ ] A negative control per new test: RED then GREEN, both pasted. `MISSING` FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, message stating what is NOT OBSERVED.

**Corrections to this brief are welcome and expected.** Follow the measurement over the brief and say
so at the top of your report.

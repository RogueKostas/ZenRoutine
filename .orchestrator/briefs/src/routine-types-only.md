# Lane: routine-types-only — remove `RoutineBlock.goalId`: the routine is made of activity types only (#60, and #48 folded in)

Run `gh issue view 60 --comments` and `gh issue view 48`. Read `docs/DESIGN-2019.md` §3 (decision 1) and §4.2 ("Activity edit box", pp. 17–22: the design's edit box has **only** an Activity Type field).

## The decision (director, 14 Sep, in writing on #60)
> "yes routine is only made up of activity types"

- `RoutineBlock.goalId` comes out of the type, and the Block Editor's "Link to Goal" section comes out of the UI.
- **Any persisted `goalId` on a block is dropped on migration, not honoured.**
- The forecast engine (`src/core/engine/prediction.ts`) loses its dedicated-capacity branch. Every block contributes its minutes to its activity type's pool.
- The Goals screen's "Goal-linked blocks stay dedicated" explainer is now false and must be rewritten.
- **Not removed:** a *tracking entry* still links to a goal (`TrackingEntry.goalId`). Only the *plan* stops naming goals.

## #48, folded in by the orchestrator (say so on #48 in your report)
#48 asked for a way to create a goal from the Block Editor's Link to Goal dead end. With that section gone, replace it with a small **"Goals for this activity type"** section: a read-only list of that type's active goals in the current goal order, plus a one-line quick-add field that creates a goal of this type. **Keep it simple:** name only. Wave B is making the estimate optional (#50); until then use the store's existing default or 60 minutes, and flag which you did. It must not attach the goal to the block.

## Deliver
1. **Type + migration.** Remove `goalId` from `RoutineBlock` (`src/core/types/RoutineBlock.ts`). In `src/store/persistence.ts`, bump the schema version and drop `goalId` from every stored block. Add a test that loads a real **pre-change** blob with goal-linked blocks and asserts:
   - the blocks survive without `goalId`;
   - goals and tracking entries (including `TrackingEntry.goalId`) are untouched;
   - backup import of an old file works the same way.

   Read the persistence comments first; the quarantine and repair invariants (#4, #18, #19, #32, #36, #38) must hold.

   **Schema v5 landed an hour ago (#73), with a subtlety you must keep.** `STRICT_SCHEMA_VERSION = 4` gates the lenient legacy repairs; `CURRENT_SCHEMA_VERSION` is now 5 and gates nothing but itself. Your bump to 6 must **not** move the repair gate. Drop `goalId` in an explicit v5→v6 step. Note that the existing strict-path checks (`blockGoalIsInvalid`, `entryRoutineBlockIsInvalid`) reference `block.goalId`; with the field gone, those checks change meaning, so reason about each one and say what you did.

   **Test-timezone trap (cost a red `main` today):** CI runs in UTC. Never build `Date`s at module load in a test file that sets `process.env.TZ` in `beforeAll`. Run the suite once with `TZ=UTC` before reporting.
2. **Engine.** Remove the dedicated branch in `prediction.ts`: every same-type block now feeds the shared pool. Update its tests to the new contract; don't delete coverage, rewrite it. Also check `getCapacityChangedAt` and the confidence-evidence logic (#6, #23, #24): anything keyed on `block.goalId` must go.
3. **Every other reader** (measured with grep on `main` today): `ActivityCalendar.tsx` (~369), `DraggableBlockList.tsx` (~157, ~196–209), `Timeline.tsx` (~82), `HomeScreen.tsx` (~73: starting a scheduled block passes `block.goalId`; it now passes none), `BlockEditor.tsx` (the Link to Goal section and `selectedGoalId`), `src/store/sampleData.ts` and `useAppStore.ts` (block add/update actions, validation), `src/core/engine/validation.ts`, and `DebugPanel.tsx`. Re-grep yourself. `TrackingEntry.goalId` readers stay.
4. **Copy.**
   - Rewrite the Goals screen's forecast explainer so it no longer says goal-linked blocks are dedicated. Describe the pool: a type's blocks feed its goals in order.
   - Onboarding slide 3 says "Link activities to goals"; change it to match (e.g. "Build a weekly routine from activity types. Your goals share that time in priority order."). Keep it short.
   - Search for any other copy that promises block→goal linking.
5. **Tests:** the migration test above, the engine contract, and a test that no `RoutineBlock` value in `src/` ever carries `goalId`. Type-level coverage is enough if `tsc` enforces it; say which.

## Scope
Everything listed above. Keep screen changes to the minimum each needs. **Do NOT:**
- touch `src/core/engine/forecast.ts` (new, from the `forecast-engine` lane; it already ignores `goalId`);
- restructure `GoalsScreen.tsx` beyond the explainer copy (Wave B's `goals-list` lane rewrites it next);
- change goal priority (#49 is the next lane).

## Click-through the orchestrator will run on web
Load example data → open a block → no "Link to Goal"; a "Goals for this activity type" list shows that type's goals → quick-add "Test goal" → it appears in Goals under that type, and the block is unchanged → Home → start a scheduled block → it tracks with no goal → Goals explainer copy no longer mentions dedicated blocks → an old backup with goal-linked blocks imports cleanly (the orchestrator will use your test fixture's JSON if you save it under `tests/fixtures/`).

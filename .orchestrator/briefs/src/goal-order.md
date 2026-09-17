# Lane: goal-order — goal priority becomes list order: model, migration, store and forecast (#49, model half)

Run `gh issue view 49`. Read `docs/DESIGN-2019.md` §3 (decision 2) and §4.4 (Goals), and look at `docs/design-2019/p51.jpg`, `p60.jpg` and `p65.jpg`.

## The decision
Priority is the goal's **position in the goals list**. There is no priority field, column or chip (director, 26:17: "we're not even showing the priority here… we're just ordering goals"). The design annotates it: "Drag and move rows around to reprioritise" (p65–66, red). `CLAUDE.md` lists this as settled.

## One list, not one per type (orchestrator's reading, stated)
#49 suggests an order "scoped per activity type". The design's goals screen is **one list of goals of every type** (pp. 50–58); filtering by type shows a subset of that list (p60–64). So implement **one global order** over all goals. It gives every activity type a total order of its own goals, which is all the forecast needs. Reordering inside a filtered view moves a goal relative to its visible neighbours. If you find the design contradicts this, stop and report.

## Split with the next lane
**This lane:** model, migration, store actions, selectors, the forecast consuming the order, and **removing** priority from the UI (the chip group on New Goal, the priority badge on cards, anything else that shows it). **The next lane (`goals-list`, #50 and #51)** rewrites `GoalsScreen.tsx` into the design's list and builds **drag-to-reorder** on top of your store action. So don't build drag UI, and keep your `GoalsScreen.tsx` edits to removing priority.

## Deliver
1. **Model:** remove `priority` / `GoalPriority` / `PRIORITY_LABELS` / `PRIORITY_COLORS` from `src/core/types/Goal.ts`. Add a total order. Pick one and justify it: an integer `order`, or a fractional/lexicographic rank that avoids renumbering on every move. Say what happens to a new goal: **the design adds new goals at the bottom** (p49–p57: an empty ruled line under the list).
2. **Migration**, schema 6 → 7, in `src/store/persistence.ts`:
   - Convert the enum into a starting order: highest priority first, ties broken by `createdAt`, then `id` for determinism.
   - Keep `STRICT_SCHEMA_VERSION` at 4, and do the step in an explicit, version-gated function, the way v5 and v6 did (read both first).
   - Backups: an old backup with `priority` imports with the same derived order.
   - Test with a real pre-change v6 blob fixture, saved under `tests/fixtures/`. Assert every goal survives, the order is as derived, and nothing else changes.
3. **Store:**
   - `moveGoal(goalId, toIndex)` or `moveGoal(goalId, { before | after: goalId })`, whichever serves drag within a filtered view best. Explain the choice.
   - An ordered selector (`useOrderedGoals`, or have `useGoals` return list order; say which).
   - `addGoal` appends to the end.
   - Deleting a goal leaves the others' relative order intact.
   - Export and import keep the order.
   - Reordering is a **capacity/forecast-relevant change**. Check how the confidence-evidence logic (#6, #23, #24, `getCapacityChangedAt`) treated priority changes, and keep the equivalent behaviour for order changes. Say what you did.
4. **Forecast consumes the order** (#49's "done when"). `src/core/engine/prediction.ts` still splits a type's pool by priority **weight**. Replace that with the list order. The cleanest route is to take the completion date from `forecastGoals` (`src/core/engine/forecast.ts`, merged in #75: fill-forward, strictly in list order) and keep `prediction.ts`'s confidence and evidence logic around it. Keep `PredictionResult`'s shape if you can, so screens don't churn.
   - Update the Goals screen's forecast explainer copy (#60's lane left it describing "share the pool by priority") to: goals of a type are worked in list order, and the top one gets that type's time first.
   - Update the per-goal line the same way (e.g. "Next in line after N goals of this type").
   - `src/components/routine/blockGoals.ts` (#60) sorts the Block Editor's goal list by priority; switch it to list order.
5. **Copy:** onboarding slide 2 mentions "priorities" (`src/screens/onboardingPaging.ts`). Reword it: goals are ordered, and the top of the list is worked first.
6. **Sample data** (`src/store/sampleData.ts`) sets priorities; give it a sensible order instead. Keep its "one confident, one low-confidence" property (it has tests).
7. **Tests:** migration and order derivation; `moveGoal` edge cases (to top, to bottom, onto itself, within a filtered subset); `addGoal` appends; the forecast changes when order changes (reuse the director's example from `tests/core/forecast.test.ts` through the prediction path); a source scan that no `priority` field or chip remains in `src/`. Run once with `TZ=UTC`.

## Scope
`src/core/types/Goal.ts`, `src/store/persistence.ts`, `src/store/useAppStore.ts`, `src/store/index.ts`, `src/store/sampleData.ts`, `src/core/engine/prediction.ts` (not `forecast.ts`, except to import from it), `src/components/routine/blockGoals.ts`, `src/screens/onboardingPaging.ts`, `src/screens/GoalsScreen.tsx` (**priority removal and forecast copy only**), `DebugPanel.tsx` if it references priority, and tests.

**Do NOT touch:** `src/components/ribbon/*` or the ribbon insertion near the top of `src/screens/HomeScreen.tsx` (the `day-ribbon` lane is landing now). Also leave the routine and calendar components alone.

## Click-through the orchestrator will run on web
A reload over an existing v6 store keeps every goal, in the derived order. New Goal has no priority chips; goal cards have no priority badge. A new goal appears at the bottom of the list. Goals → "How forecasts work" describes list order. Block Editor → "Goals for this activity type" is in list order. Onboarding slide 2 doesn't mention priorities.

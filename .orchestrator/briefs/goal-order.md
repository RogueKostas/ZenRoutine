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

---

## Standing rules for every Iteration 1 lane (read all of it)

**Context.** Iteration 1 re-converges this app on its 2019 design. Read `docs/ITERATION-1-PLAN.md` (the goal and the invariants) and the section of `docs/REVIEW-2026-09-14.md` your issue cites. `docs/DESIGN-2019.md` (on `main` since #70) is authoritative for anything user-visible; its page images are in `docs/design-2019/pNN.jpg` — Read the image when the text is ambiguous. **If your brief and the design disagree, stop and report — do not choose.**

**Other lanes are running in this repo right now.** Stay inside your Scope. If the fix genuinely needs a file outside it, make the smallest change possible and flag it at the TOP of your report.

**Web is the only surface anyone uses.** Every UI change must work on react-native-web at ~400px wide and at 1920px. `Alert.alert` is a no-op on web: never add a call to it. If `src/components/common/Dialog*` (or a similar cross-platform dialog from #39) exists on your base, use it.

**You have no browser.** The test stack is vitest in a Node environment with no React renderer (see `vitest.config.mts`, `tests/setup.ts`). So:
- put the behaviour you change into **pure, exported functions** (layout maths, formatting, state transitions, selectors) and unit-test those;
- do not add a rendering library or any other dependency — `package-lock.json` is tracked and a new dependency needs the director's approval. If you believe one is unavoidable, stop and say so;
- end your report with a **"Click-through for the orchestrator"** list: the exact steps and what should be seen on the web build. The orchestrator checks them in a real browser before merging, so be precise.

**Gates — each in its own process, tails pasted:**
1. `npm ci` from the tracked lock first (a fresh worktree has no `node_modules`).
2. `npm run typecheck` exit 0 — no new `any`, `@ts-ignore` or `@ts-nocheck`.
3. `npm test` exit 0 — re-measure the suite on your base before changing anything and cite it (it was 304 on `main` @ 7526c29, 17 Sep 16:50); it must not go down. **Also run it once with `TZ=UTC`** (CI is UTC; a host-timezone-dependent test turned `main` red on 17 Sep — never build `Date`s at module load in a file that sets `process.env.TZ` in `beforeAll`).
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

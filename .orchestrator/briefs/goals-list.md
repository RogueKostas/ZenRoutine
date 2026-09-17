# Lane: goals-list — the Goals tab becomes the design's list: optional type and estimate, filter box, inline add, drag to reorder (#50, #51, #49 UI, #45 New Goal half)

Run `gh issue view 50`, `51`, `49` and `45`. Read `docs/DESIGN-2019.md` §4.4 (Goals, pp. 44–67) end to end, and **look at** `docs/design-2019/p44.jpg`, `p49.jpg`–`p58.jpg`, `p60.jpg`, `p61.jpg`, `p64.jpg`, `p65.jpg` and `p67.jpg`.

## The design, in brief (read §4.4 for the real thing)
- A text list, one row per goal: `[done checkbox] [name] [type icon, or "?" when unset] [estimate, "1hr" by default]` (p50–58).
- **"Activity Type and Estimation are optional"**: the app can be used as a simple to-do list (p51, orange).
- Adding: tap the empty ruled line under the list, type a name, press Enter (p49, p57). Tap `?` to pick a type from an icon list (p52–53); tap the estimate to type a number (p55–57; a bare number means hours, and "10" reads back "10hrs").
- **Filter box** top-right (p60–64): pick one activity type and only its goals show; the rows then drop the type column. **"Adding Goals in filtered lists automatically gives the goal the activity type of the filter"** (p67).
- **"Drag and move rows around to reprioritise"** (p65–66, red). Priority is list order.
- Director (review 16:05): "We don't need the whole page — I was expecting little pop-ups and things."

## What exists now (on `main` @ 9558403)
- `Goal.order` and `moveGoal(goalId, { before | after: goalId })` (#78). `useGoals()` returns list order. No drag UI yet.
- `parseDuration` (#71: `12h`, `90m`, `1h30`, a bare number = hours) and `formatDuration`.
- The forecast (`predictAllGoals` → `forecastGoals`) already reports goals without a type or estimate as `unscheduled` with a reason (#75); check this end to end.
- `GoalsScreen.tsx` is a large screen with status chips, type chips (#71 fixed their height), a full-page New Goal modal, cards with progress and forecasts, and a forecast explainer.
- App dialogs (`useDialog`) exist; `Alert.alert` is banned.

## Deliver
1. **Model: type and estimate become optional (#50).**
   - `Goal.activityTypeId?` and `Goal.estimatedMinutes?`, or a sentinel. Choose, and justify against the design's "1hr default": is 1hr a *display default for an unset estimate* or a *stored value*? The design shows new rows reading "1hr" before the user touches them. Pick the reading that keeps the to-do-list case honest (a to-do item shouldn't claim an hour of forecastable work), and say which you chose.
   - This changes stored shape and validation, so bump the schema (7 → 8), with an explicit version-gated step. `STRICT_SCHEMA_VERSION` stays 4.
   - Add a pre-change v7 fixture test, written by the unchanged store's own actions, as #78 did.
   - Every consumer must tolerate the missing fields: the store (`addGoal`, `updateGoal`, progress accounting, `contributionDelta`), `prediction.ts`/`forecast.ts` (no forecast and no error for them), `blockGoals.ts`, `QuickStart.tsx` (Link to Goal lists only goals of the tracked type, so untyped goals are simply absent there), `HomeScreen.tsx`'s Active Goals, `sampleData.ts`, backup import and export, and `DebugPanel.tsx`.
   - **A tracking entry may link to a goal only if the goal's type matches the entry's.** An untyped goal therefore can't receive tracked time until it gets a type; say so in the UI where relevant.
   - Setting a type on a goal later must be allowed.
2. **The Goals screen becomes the list (target: much smaller than today; the plan says Wave B must leave `GoalsScreen.tsx` smaller than it started).**
   - Rows as the design describes: checkbox, name, type icon or `?`, estimate or a muted `1hr` placeholder.
   - A compact progress hint and forecast date per row are fine, but secondary: small text under the name, not a card.
   - Tapping `?` or the icon opens a **small popover** of types (with "No type").
   - Tapping the estimate makes it **inline-editable** (uses `parseDuration`, echoes `= 12h`, error inline).
   - Tapping the name renames inline.
   - Status: done via the checkbox. Keep paused and archived reachable some other way (a row overflow menu or long-press), but not as a chip row.
3. **Inline add (#45 New Goal half):** an empty row at the bottom with the placeholder "Add a goal…"; Enter creates it, and focus stays for the next one. **No full-page modal.** A description field isn't in the design; drop it from creation (keep it viewable and editable if goals already have one, or say why not).
4. **Filter box (#51):**
   - A small control top-right showing the current filter's icon (or "All").
   - Tapping it opens a popover of types plus "All".
   - While filtered: only that type's goals, no type column, and **a goal added here gets that type**.
   - Under "All", new goals have no type.
   - Unit-test the inheritance rule as a pure function.
5. **Drag to reorder (#49 UI):**
   - Rows can be dragged up and down with mouse and touch on web (react-native-gesture-handler is installed; a PanResponder-based approach is acceptable). This must work on **react-native-web with a mouse**.
   - While filtered, moves use `moveGoal` relative to the visible neighbours.
   - Provide a keyboard- and screen-reader-accessible alternative (e.g. "Move up" / "Move down" actions on the row menu).
   - Put the drop-index maths in a pure function and test it.
6. **Keep and simplify the forecast explainer** ("How forecasts work"). It can live behind a small info button.
7. **Close #45 and #49** with this PR (say so in the report), since the remaining halves land here.
8. **Tests:** migration (v7 → v8) with a real fixture; a goal with only a name flows through the store, forecast, Home selector and backup without error; filter inheritance; drop-index maths; the list-order rendering data. Run once with `TZ=UTC`.

## Scope
`src/core/types/Goal.ts`, `src/store/*` (goal parts and the migration), `src/core/engine/prediction.ts` and `forecast.ts` (tolerance only), `src/screens/GoalsScreen.tsx` (rewrite), new goal-row components under `src/components/goals/` (`GoalCard.tsx` is unused; delete it if nothing needs it), `src/components/routine/blockGoals.ts` and `src/components/tracking/QuickStart.tsx` (tolerance only), `DebugPanel.tsx`, and tests.

**Other lanes are running:**
- `routine-surface` is in `src/screens/RoutineScreen.tsx`, `src/components/routine/*` (except `blockGoals.ts`) and `src/components/ribbon/*`. Don't touch those.
- `home-today` is rewriting `src/screens/HomeScreen.tsx`. If Home needs a tolerance change for untyped goals, make the **minimal** edit and flag it at the top of your report.
- `forecast-calendar` is in `AnalyticsScreen.tsx` and `src/components/calendar/*`. Don't touch those.

## Click-through the orchestrator will run (rendered at 500px and 1920px, example data)
- The Goals tab is a plain list: checkbox · name · type icon · estimate.
- Type "Buy milk" in the add row → Enter → it appears at the bottom with `?` and a muted `1hr`; nothing errors.
- Filter to Work → only Work goals, no type column → add "Draft slides" → it's a Work goal.
- Drag "Draft slides" to the top → Home and the forecast change accordingly; the Block Editor list reflects the order.
- Tap an estimate → type `12h` → `= 12h` → saved.
- Tick a goal's checkbox → marked done.
- Reload: everything persists.

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
3. `npm test` exit 0 — re-measure the suite on your base before changing anything and cite it (it was 395 on `main` @ 9558403, 17 Sep 17:35); it must not go down. **Also run it once with `TZ=UTC`** (CI is UTC; a host-timezone-dependent test turned `main` red on 17 Sep — never build `Date`s at module load in a file that sets `process.env.TZ` in `beforeAll`).
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

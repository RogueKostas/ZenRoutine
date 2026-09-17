# Lane: calendar-home — put the tracking calendar inside Analytics, reachable without a hidden button (#47)

Run `gh issue view 47` and read it, then read `docs/ITERATION-1-PLAN.md` § "Screen map", Analytics row.

## Why, and a reconciliation you must follow
`src/screens/CalendarScreen.tsx` (tracking history) is registered on the root stack and reachable only through a `📅 Calendar` button in `src/screens/AnalyticsScreen.tsx` (around line 162), behind the repo's only `@ts-ignore`. On 14 Sep the director went through the whole app and never found it.

**The issue says "reachable without going through Analytics". The later Iteration 1 plan supersedes that:** the Analytics tab gets a **segmented control** at the top, and the calendar lives there as a segment. Wave C will add a *forecast* calendar segment alongside it, so don't add a sixth tab. Follow the plan. Exit criterion 7: the director finds the calendar without being told where it is.

## Deliver
1. A segmented control at the top of Analytics: **Breakdown | History** (reads well at 400px). Breakdown is today's Analytics content, unchanged. History renders the tracking calendar inline. Make the segment list a small typed array so a later lane can add a **Forecast** segment in one line; don't build the forecast.
2. Turn the calendar into a component, e.g. move the body of `CalendarScreen.tsx` into `src/components/calendar/TrackingCalendar.tsx`, and render it in the History segment. Title or subtitle: **"Tracking history"**, so it's clearly not the forecast.
3. **Remove the `@ts-ignore`** and the hidden button. If the root-stack `Calendar` route has no remaining callers, remove it from `RootNavigator.tsx` and `navigation/types.ts`, and say so. Deleting `CalendarScreen.tsx` is allowed if its content moved (your `D` line is expected; name it).
4. Add a test that fails if `@ts-ignore` or `@ts-nocheck` appears anywhere in `src/` (the plan's invariant 5). Its negative control is re-adding one.
5. Test the segment state as a pure function if there's any logic; don't invent logic to test.

## Scope
`src/screens/AnalyticsScreen.tsx`, `src/screens/CalendarScreen.tsx`, a new `src/components/calendar/`, `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`, and tests.

**Leave the calendar's week-start and day-name arrays alone:** another lane makes the week Monday-first next, in these files, and wants a clean move, not a rewrite. **Do NOT touch:** `SettingsScreen.tsx`, `HomeScreen.tsx`, `OnboardingScreen.tsx`, `ActiveTimer.tsx`, `QuickStart.tsx`, `useAppStore.ts`, `BlockEditor.tsx`, `RoutineScreen.tsx`.

## Click-through the orchestrator will run on web (400px and 1920px)
Analytics tab → segmented control visible without scrolling → History shows the tracking calendar titled "Tracking history", with example data showing tracked days → month navigation works → Breakdown still shows today's content. No stray Calendar button.

---

## Standing rules for every Iteration 1 lane (read all of it)

**Context.** Iteration 1 re-converges this app on its 2019 design. Read `docs/ITERATION-1-PLAN.md` (the goal and the invariants) and the section of `docs/REVIEW-2026-09-14.md` your issue cites. If `docs/DESIGN-2019.md` exists on your base, it is authoritative for anything user-visible. **If your brief and the design disagree, stop and report — do not choose.**

**Other lanes are running in this repo right now.** Stay inside your Scope. If the fix genuinely needs a file outside it, make the smallest change possible and flag it at the TOP of your report.

**Web is the only surface anyone uses.** Every UI change must work on react-native-web at ~400px wide and at 1920px. `Alert.alert` is a no-op on web: never add a call to it. If `src/components/common/Dialog*` (or a similar cross-platform dialog from #39) exists on your base, use it.

**You have no browser.** The test stack is vitest in a Node environment with no React renderer (see `vitest.config.mts`, `tests/setup.ts`). So:
- put the behaviour you change into **pure, exported functions** (layout maths, formatting, state transitions, selectors) and unit-test those;
- do not add a rendering library or any other dependency — `package-lock.json` is tracked and a new dependency needs the director's approval. If you believe one is unavoidable, stop and say so;
- end your report with a **"Click-through for the orchestrator"** list: the exact steps and what should be seen on the web build. The orchestrator checks them in a real browser before merging, so be precise.

**Gates — each in its own process, tails pasted:**
1. `npm ci` from the tracked lock first (a fresh worktree has no `node_modules`).
2. `npm run typecheck` exit 0 — no new `any`, `@ts-ignore` or `@ts-nocheck`.
3. `npm test` exit 0 — the suite is **129 tests on `main` @ 41a90cc** (measured 17 Sep). Re-measure on your tree and cite it; it must not go down.
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

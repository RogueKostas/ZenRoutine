# Lane: timer-units — a live timer that counts seconds, and honest goal figures in Link to Goal (#42, #41)

Run `gh issue view 42` and `gh issue view 41` and read both in full before starting.

## Why
**#42.** `src/components/tracking/ActiveTimer.tsx` keeps `elapsedMinutes` in state, ticks every second, and renders `formatDuration(elapsedMinutes)`, which shows `0m` for the first minute. A seconds-capable renderer exists lower in the same file and is unused. Recording 09:22: "this timer is just not showing seconds, which is kind of silly." Wave A exit criterion 4: a started timer counts in seconds.

**#41.** `src/components/tracking/QuickStart.tsx` (around line 193) renders `{goal.loggedMinutes} / {goal.estimatedMinutes} min this week`. It bypasses `formatDuration` (`src/core/utils/time.ts`), and those are **lifetime** totals, not weekly. Observed: `240 / 1200 min this week` where the Goals card says `4h / 20h`. Exit criterion 5: `4h / 20h`, never `240 / 1200 min this week`.

## Deliver
1. **Elapsed seconds** in the live timer, displayed `M:SS` under an hour and `H:MM:SS` from an hour up. Derive it from `startTime` and now on every tick, never by incrementing a counter, so a backgrounded tab is correct when it returns; account for any paused time if the entry model has it. Add a pure `formatElapsed(seconds)` in `src/core/utils/time.ts` with tests (0, 59, 60, 3599, 3600, 36000, negative clamps to 0). Remove the dead renderer, or make it the one in use; don't leave two.
2. **Link to Goal** shows `formatDuration(logged) / formatDuration(estimated)` with no "this week". If a goal has no estimate, show logged only. Put the label in a pure function and test it: 240/1200 → `4h / 20h`.
3. Check that no other tracking surface shows raw minutes; fix any in your two files and list any elsewhere in your report.

## Scope
`src/components/tracking/ActiveTimer.tsx`, `src/components/tracking/QuickStart.tsx`, `src/core/utils/time.ts` (add only; don't change existing exports' behaviour), and tests.

**Do NOT touch:** `TrackingControls.tsx` (another lane is replacing its dialogs), `HomeScreen.tsx`, `OnboardingScreen.tsx`, `useAppStore.ts`, `SettingsScreen.tsx`, `AnalyticsScreen.tsx`, `CalendarScreen.tsx`.

## Click-through the orchestrator will run on web
Load example data → Home → start tracking any activity → the timer reads `0:01`, `0:02`… within the first seconds → switch tabs and come back after ~10s: the value is correct. Open Link to Goal: figures read like `4h / 20h` with no "this week".

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

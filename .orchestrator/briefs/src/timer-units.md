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

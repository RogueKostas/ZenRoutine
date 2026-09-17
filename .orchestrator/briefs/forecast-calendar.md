# Lane: forecast-calendar — the design's forecast calendar: when each goal completes, month/week/day, filter, milestones (#52, part 2)

Run `gh issue view 52`. Read `docs/DESIGN-2019.md` §4.5 (pp. 68–69, 72) and §3 ("Forecast algorithm", "Calendar zoom"), and **look at** `docs/design-2019/p69.jpg`. Read `docs/REVIEW-2026-09-14.md` Part 1, "The forecast calendar". Read `docs/ITERATION-1-PLAN.md` § Wave C, exit criteria 1–3.

## Why
This is the design's centrepiece (p69): *"to show you when you are forecasted to have completed your goals… the ability to re prioritize goals or change your routine so you can hit your targets."* The review script (step 6): "Calendar — find when each goal completes. Drag a goal up in Goals, come back, and see the dates move."

## What exists (on `main` @ 9558403)
- **`forecastGoals`** (`src/core/engine/forecast.ts`, #75): completions, milestones, allocations and unscheduled reasons, filling forward in list order, with no tracking history needed. Helpers `getAllocationsForDate` and `getScheduledAllocationAt`.
- **Goals in list order** from `useGoals()` (#78). `predictAllGoals` already takes its dates from `forecastGoals`.
- **Analytics** has a segmented control, `ANALYTICS_SEGMENTS`, in `src/screens/AnalyticsScreen.tsx` (#67): Breakdown | Calendar. The comment there says a new segment is one row.
- **The existing "Activity calendar"** (`src/components/calendar/ActivityCalendar.tsx`) draws routine dots per weekday plus a "Predicted Goal Completions" list from the old prediction. The director hasn't named it yet.
- **Week order** follows `useWeekStartsOn()` (#73); use `getMonthGridDates` and `orderedWeekDays`.
- **`DayRibbon`** (#77) supports `labels='custom'` + `labelFor(block)` for the day view. A block can be split between goals, so you may need to draw allocation slices rather than blocks. Extending the ribbon's inputs is allowed only additively; `routine-surface` is also extending it. If you need a change there, prefer composing it in your own component.

## Decision for this lane (orchestrator)
Make the **forecast calendar the Calendar segment**, replacing what "Activity calendar" shows today. Keep its routine dots only if they help; the design's calendar shows goal completions, not routine dots. Name it **"Forecast"** in the segment control: the design calls it "the calendar view", and the review script calls it "Calendar". Label it `Calendar` with the heading "Forecast", and flag the naming for the director in your report. Remove the old "Predicted Goal Completions" list if the calendar now shows the same thing.

## Deliver
1. **Month view (default, p69):**
   - A grid in the week-start order.
   - Each day cell lists the goals forecast to complete that day: truncated name, a dot in the type's colour, and a tick.
   - Milestone entries show a `50%`-style badge in place of the tick when milestones are on.
   - Today is marked. Previous and next month navigation, and a "Today" button.
   - Fits at 500px: names may collapse to dots with a count, and tapping a day shows the list.
2. **Week view:** seven columns. Each day shows its slices (goal name, type colour, time range) in order.
3. **Day view (plan: "zooming to a day shows which goal occupies which block, in order"):** that day's timeline with each allocation slice labelled with its **goal name**, using or composing `DayRibbon`, plus a list below: `09:00–11:00 · Design FTUE (done)`, `11:00–13:00 · Integrate Analytics`.
4. **Zoom control:** Month | Week | Day. Tapping a day in month or week opens day view for it.
5. **Filter by activity type** (p69): all or one type.
6. **Granularity toggle** (p69): "Completions" or "Completions + milestones" (25/50/75%).
7. **Unscheduled goals:** a compact note under the calendar ("3 goals have no forecast: 1 has no type, 2 have no routine time"), expandable.
8. **Reactive:** reordering goals, editing the routine, or logging time updates the calendar without a reload. Plan exit criterion 3: "Re-ordering goals visibly moves the completion dates."
9. **Performance:** memoise the forecast (by routine, goals and tracking version); it covers up to 365 days.
10. **Tests (pure):** the month-cell data builder (completions and milestones per date, filtered by type), the week and day slice builders, zoom-to-date navigation, the unscheduled summary, and "reorder changes cell dates" (the director's example: swap the two goals and both dates move). Run once with `TZ=UTC`.

## Scope
`src/screens/AnalyticsScreen.tsx` (segment wiring only), `src/components/calendar/*` (rewrite or replace), new pure builders (e.g. `src/core/engine/forecastCalendar.ts`) and their export, and tests.

**Do NOT touch:**
- `src/store/*`, `src/core/types/*`, `prediction.ts`, `forecast.ts` (read-only for you) and `GoalsScreen.tsx`: `goals-list` is making goal type and estimate optional right now, so tolerate goals without them.
- `HomeScreen.tsx`: `home-today` is in it.
- `src/components/routine/*`, and `src/components/ribbon/*` beyond reading: `routine-surface` is in them.

## Click-through the orchestrator will run (rendered at 500px and 1920px, example data)
- Analytics → Calendar → heading "Forecast", month grid Mon-first, with goal completions as dots and names on their forecast days.
- The filter narrows to Work.
- The milestones toggle adds `%` badges.
- Tap a day → day view with goal-labelled slices.
- Week view.
- In Goals, reorder two Work goals (or, before the drag UI exists, use the store through the debug panel) → back in the calendar, both dates moved.

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

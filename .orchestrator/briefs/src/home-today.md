# Lane: home-today — Home names today's goals, greys the past, and leads with the scheduled block (#55, #56)

Run `gh issue view 55` and `gh issue view 56`. Read `docs/DESIGN-2019.md` §4.6 (Day Overview and Current Activity, pp. 73–77), and **look at** `docs/design-2019/p73.jpg` and `p74.jpg`. Read `docs/REVIEW-2026-09-14.md` Part 2, "Home".

## Why
- **#55.** Home's "Today's Schedule" names activity types ("Work"), never the goal each block advances. The design's Day Overview (p74) rows are `time-range · goal name · (hrs tracked / estimated total)`, e.g. `14.30–17.00 Integrate Analytics Framework (5/8hrs)`, and the same goal can appear twice in a day with its running total advancing. **"Past goals are grayed out while the current goal is more visible"** (p74, orange).
- **#56.** Director (07:39): "this Quick Start thing feels random. I should be already tracking the activity that's scheduled, like nine times out of ten." Also (05:44, 06:29): the greeting block wastes space, and a visible current time would help. **Done when:** opening the app during a scheduled block offers that block's goal as the primary action.

## What exists (on `main` @ 9558403)
- **The day ribbon is already on Home**, directly under the greeting, with a live now marker (`TodayRibbon`, #77). Keep it.
- **The fill-forward engine** (`src/core/engine/forecast.ts`, #75): `forecastGoals` returns `allocations` (which goal occupies which part of which block, by date). `getAllocationsForDate(allocations, dateKey)` and `getScheduledAllocationAt(allocations, at)` exist for exactly this.
  - Read the #75 report note in the forecast-engine PR: *"For Home, call forecastGoals with from = now … If Home wants to show all of today, run it from midnight and pass a remainingMinutes that adds back what was logged today, so today's work isn't counted twice."*
  - Goals are in list order (`useGoals()`, #78).
- **The routine has no goal links** (#60). Starting a scheduled block today passes no goal.
- The schedule rows already grey past blocks and badge NOW/NEXT (visible on the live build). Build on that.

## Deliver
1. **A pure selector**, e.g. `src/core/engine/dayOverview.ts`: `getDayOverview({ routine, goals, trackingEntries, now })` → today's rows in time order. Each row is `{ blockStart, blockEnd, activityTypeId, goalId | null, goalName | null, trackedMinutes, estimatedMinutes, state: 'past' | 'current' | 'upcoming' }`.
   - A block split between two goals yields two rows (the engine's slices).
   - A block whose type has no active goal yields one row with `goalId: null`; show the type name instead.
   - `trackedMinutes / estimatedMinutes` is the goal's **cumulative** progress as of the end of that slice (the design's running total). State the formula.
   - Past slices must show the goals that were planned for them, which means running the engine from the start of today with remaining minutes adjusted for today's logged time. Get this right and test it.
   - Untyped or estimate-less goals (a parallel lane is making both optional) never appear in allocations; make the selector tolerate them.
2. **Today's Schedule → Day Overview rows:** `13:00–17:30 · Ship the analytics dashboard · 45/80h`, with the type icon and colour kept small. Past rows greyed, the current row prominent (larger, accent border), upcoming rows normal. Keep the per-row Start action for current and upcoming rows.
3. **Quick Start leads with the schedule (#56):**
   - When a block is scheduled now, the top of Home shows one primary card: "Now: Ship the analytics dashboard (Work) · 13:00–17:30 · [Start]".
   - Start begins tracking **linked to that goal** (the entry's type matches the goal's type, so validation passes; check it).
   - When nothing is scheduled now, the card says what's next and when, with Start disabled or offering "start early".
   - The six-type grid moves below, collapsed under "Track something else".
3b. **Greeting:** shrink it to one line (e.g. "Thursday 17 September · 17:12") and **show the current time**, updating every minute. Remove the "Good evening" hero, or make it small.
4. **Leave the "Nothing here yet" example-data card** (#69) and the ribbon (#77) working.
5. **Tests:**
   - The selector on the director's example (4h Work block daily, goals 6h then 8h): Tuesday's block yields two rows (FTUE until 11:00, then Analytics), with the right cumulative figures and states at a given `now`.
   - Past slices stay correct after time is logged today.
   - A type with no goals.
   - Start-now links the goal.
   - Run once with `TZ=UTC`.

## Scope
`src/screens/HomeScreen.tsx`, a new `src/core/engine/dayOverview.ts` (plus its export), new Home components under `src/components/home/`, and tests. You may use, but not change, `forecast.ts`, `TodayRibbon` and the store.

**Do NOT touch:**
- `src/store/*`, `src/core/types/*`, `prediction.ts` or `GoalsScreen.tsx`: `goals-list` is making goal type and estimate optional right now.
- `src/components/routine/*` and `src/components/ribbon/*`: `routine-surface` is in them.
- `AnalyticsScreen.tsx` and `src/components/calendar/*`: `forecast-calendar` is in them.

## Click-through the orchestrator will run (rendered at 500px and 1920px, example data, Thursday ~17:00–18:00)
- The top is a compact date and time line, then the ribbon.
- The primary card names the current or next scheduled goal with Start.
- Today's rows name goals with `x/yh` progress; past rows are greyed and the current row stands out.
- Pressing Start tracks linked to that goal (the tracking card shows the goal).
- "Track something else" reveals the six types.

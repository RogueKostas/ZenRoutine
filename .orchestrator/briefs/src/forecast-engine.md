# Lane: forecast-engine — a pure fill-forward scheduler: routine × ordered goals → a dated sequence (#52, part 1 of 2)

Run `gh issue view 52` and read it. Then read `docs/DESIGN-2019.md` §4.5 (the forecast calendar, p69) and §3 ("Forecast algorithm" under later direction), and `docs/REVIEW-2026-09-14.md` Part 1, "The forecast calendar".

## Why
The forecast calendar is the design's centrepiece (p69): *"to show you when you are forecasted to have completed your goals… the ability to re prioritize goals or change your routine so you can hit your targets."* The director specified the algorithm aloud (recording 27:18):

> "every day we have just a four-hour work block. Then I would see on Monday, Design FTUE flow; then on Tuesday the first two hours would be Design FTUE flow and that goal would be done halfway through Tuesday, and then we have two hours of Integrate Analytics Framework on Tuesday, and then that leaves six hours which don't fit, so we have four hours of Integrate Analytics on Wednesday, and then Thursday we would see Integrate Analytics Framework complete."

Today's engine (`src/core/engine/prediction.ts`) computes a per-goal weekly rate and projects a date. It can't say which goal occupies which block, so it can't show the effect of reordering. **This lane builds the new engine only, as a new pure module. No UI.** Part 2 (the calendar UI) and the Home "today's goals" view will be built on it later.

## Two decisions in flight — design your inputs around them, don't implement them
- **#60 (decided, not yet built):** the routine is made of activity types only. A block never names a goal; all of a type's block minutes pool and go to that type's goals **in list order**. **Ignore `RoutineBlock.goalId` entirely** in this engine, even though the field still exists today.
- **#49 (decided, not yet built):** goal priority becomes list order. **Take goals as an already-ordered array** and never read `goal.priority`. The caller decides the order.

## Deliver
New file `src/core/engine/forecast.ts`, exported from `src/core/engine/index.ts`:

1. `forecastGoals(input): ForecastResult`, pure and deterministic, with no `Date.now()` inside:
   - `input.routine`: the active routine (blocks with `dayOfWeek`, `startMinutes`, `endMinutes`, `activityTypeId`). Overnight blocks exist (end < start); handle them by attributing minutes to the day the block starts, and say so.
   - `input.goals`: an ordered array. Use only goals that are active, have an estimate and an activity type; the rest go in an `unscheduled` list with a reason (`'no-type' | 'no-estimate' | 'completed' | 'no-capacity'`). Wave B is making type and estimate optional, so a goal may lack either.
   - `input.remainingMinutes(goal)` or equivalent: how much is left. Default is `estimatedMinutes - loggedMinutes`, floored at 0.
   - `input.from`: a local datetime to start from. **Time already past today is not available**: only the part of today's blocks after `from` counts.
   - `input.horizonDays` (default 365). A goal not finished within the horizon is `no-capacity`.
   - `input.milestones?: number[]` (e.g. `[0.25, 0.5, 0.75]`) → also emit the date each fraction of the **whole estimate** is reached, counting already-logged minutes.
2. `ForecastResult`:
   - `completions`: goal id → local date key plus exact local datetime of completion.
   - `milestones`: goal id → the list of { fraction, date }.
   - `allocations`: a list of `{ date, blockStart, blockEnd, activityTypeId, goalId, startMinutes, endMinutes }` slices, so a day view can show **which goal occupies which part of which block, in order**. A block can split across goals ("halfway through Tuesday").
   - `unscheduled`.
3. **Required test — the director's example, verbatim:** a routine with one 4-hour Work block every day (Mon–Sun); goals in order "Design FTUE flow" 6h, then "Integrate Analytics Framework" 8h; `from` = Monday 00:00. Expected:
   - Design FTUE finishes **Tuesday**, 2h into Tuesday's block.
   - Integrate Analytics gets 2h on Tuesday and 4h on Wednesday, and finishes **Thursday**.
   - The allocation slices match that exactly.
4. More tests:
   - Reordering the two goals moves both dates.
   - Two activity types don't share minutes.
   - A goal with nothing remaining completes at `from`.
   - `from` in the middle of today's block only uses the rest of it.
   - Overnight blocks.
   - A type with no blocks → `no-capacity`.
   - Milestone 50% on a 20h goal with 5h logged.
   - A 365-day horizon is fast: assert a generous bound, e.g. under 50 ms for 50 goals and a full routine, or explain why not.
   - Determinism.
5. Dates are **local** date keys, using the helpers in `src/core/utils/time.ts` (e.g. `toLocalDateKey`); don't hand-roll UTC maths. DST: a day is a day; iterate by calendar date, not by adding 86,400,000 ms.

## Scope
New `src/core/engine/forecast.ts`, one export line in `src/core/engine/index.ts`, and a new test file. **Nothing else.** Don't modify `prediction.ts` (the existing screens still use it; replacing it is later work) or any screen or store file. The `week-start` lane is in `time.ts`, `persistence.ts`, `useAppStore.ts` and several screens right now.

## Report extras
State the algorithm in five lines at the top of the report, so the calendar and Home lanes can be briefed from it. Say how you'd expose "which goal is scheduled now" for Home (#55), e.g. a helper over `allocations`, and add that helper if it's small.

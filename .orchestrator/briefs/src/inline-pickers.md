# Lane: inline-pickers — edit a block's times in place, not in a full-screen picker (#45, time-picker half)

Run `gh issue view 45` and read it in full before starting.

## Why
Picking a block's start time opens a full-screen wheel picker (`src/components/routine/TimePicker.tsx`, used by `BlockEditor.tsx` through `TimeRangePicker`). Recording 14:05: "this is a crazy widget — why is it not embedded? I should just have a little drop-down here."

**Scope split, decided by the orchestrator:** #45 also covers New Goal as a full page. That half is **not yours**; Wave B replaces the goal form with the design's inline add field. You own the time-picker half only.

**What the 2019 design shows (pp. 17–19, transcribed this week):** the activity edit box is a small modal dialog. Its top tab shows `( 7am - 8am )`, and **"All these bits are editable"** (p18, red annotation, pointing at both times). p19 shows the end time edited in place to `7.15am`. A new activity defaults to one hour. So: two compact, directly editable time fields, no picker screen.

## Deliver
1. **Inline time fields.** Replace the full-screen picker with two compact controls in the editor: start and end. Each is directly editable, with no navigation and no full-screen overlay. On web, a dropdown or `<select>`-like list of times in 15-minute steps is fine, **and** typed input must be accepted too. On phone width it must fit on one row, or wrap cleanly to two. Duration is shown beside them (the editor already shows "Duration: 3h 0m"; keep it and use `formatDuration`).
2. **Typed time parsing** as a pure function, e.g. `parseTimeOfDay(input): { minutes } | { error }` in `src/core/utils/time.ts` (add only: `goals-inputs` is adding `parseDuration` to the same file right now, so keep your addition in its own block at the end of the file). Accept `7`, `7am`, `7.15am`, `7:15`, `07:15`, `19:30`, `7:30pm`, `12am` (midnight), `12pm` (noon), `noon`. Reject `25:00`, `7:60`, `abc`, and empty input. Table-test it.
3. **Keep the model:** whatever `BlockEditor` stores today (HH:mm strings or minutes), keep it. Convert at the boundary. Keep the 15-minute step for the dropdown only; typed values may be any minute.
4. If `TimePicker` / `TimePickerModal` are left with no callers, delete them and their exports (`src/components/routine/index.ts`) and name the `D` lines in your report. `TimePicker.tsx:335` formats a duration by hand (`0h 30m`); if that code survives, use `formatDuration`.
5. Inline validation already exists in `BlockEditor` (added by #39's lane this afternoon: errors show under the Time section). Keep it working. End ≤ start must still be rejected.

## Scope
`src/components/routine/TimePicker.tsx`, `src/components/routine/BlockEditor.tsx` (the time section only), `src/components/routine/index.ts`, `src/core/utils/time.ts` (add only, at the end), and tests.

**Do NOT touch:** the Block Editor's "Link to Goal" section. Wave B removes it (#60); leave it alone, don't fix it. Also off limits: `GoalsScreen.tsx` (`goals-inputs`), `OnboardingScreen.tsx`, `HomeScreen.tsx`, `useAppStore.ts`, `persistence.ts`, `SettingsScreen.tsx`, `RoutineScreen.tsx`, `AnalyticsScreen.tsx`, `src/components/calendar/*`. A week-start lane is about to work in several of those.

## Click-through the orchestrator will run on web (400px and 1920px)
Routine → open a block → the times are two compact fields in the editor, and no full-screen picker ever appears → pick 09:15 from the start dropdown → type `5pm` into end → duration reads `7h 45m` → Save → the block card shows 09:15–17:00 → reopen, set end before start → inline error under Time and Save refused. New block (+): start and end default one hour apart.

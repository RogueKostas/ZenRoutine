# Lane: routine-surface — the Routine tab becomes the design's routine surface: week strip, tappable day ribbon, breakdown pie (#63, #58)

Run `gh issue view 63` and `gh issue view 58`. Read `docs/DESIGN-2019.md` §4.2 (routine builder, pp. 10–41) and §4.3 (breakdown pie, pp. 42–43), end to end. **Look at the page images** `docs/design-2019/p10.jpg`, `p13.jpg`–`p18.jpg`, `p24.jpg`, `p25.jpg`, `p29.jpg`, `p31.jpg`, `p36.jpg`, `p37.jpg`, `p41.jpg`, `p42.jpg` and `p43.jpg`. Then read `docs/ITERATION-1-PLAN.md` § Screen map (Routine row) and § Wave C.

## Why
The design edits a day by **tapping segments of a ribbon** ("Tap on an activity to edit", p36, red). There is no list of block cards anywhere in it (§4.2 behaviour rules). Today the Routine tab is a vertical list of block cards plus a full-screen editor sheet. The review script (step 5): "look at the week. Tap a segment on Monday's ribbon and change it. Copy Monday to Tuesday."

## What exists to build on
- **`DayRibbon`** (`src/components/ribbon/`, merged in #77): layout maths, labels, ticks, now marker, `onSegmentPress`, `compact` mode for week-strip cells, and hit-testing. **Use it; don't build a second ribbon.** You may extend it (e.g. a tap on empty time → `onEmptyPress(minutes)`), with tests.
- **`BlockEditor`** (`src/components/routine/BlockEditor.tsx`): inline time fields (#72), inline validation, app dialogs (#68), and the "Goals for this activity type" section (#60).
- **Week order** follows `useWeekStartsOn()` (#73): Monday-first by default. Use `orderedWeekDays`.
- **The analytics breakdown** (`src/core/engine/analytics.ts`, `getRoutineBreakdown`) already computes planned minutes per type.

## Deliver
1. **Week strip** at the top of the Routine tab (p10, p25, p42): seven equal cells labelled `M T W T F S S` (in the preference's order), each filled with that day's ribbon in `compact` mode as thin coloured columns. The selected day is highlighted, today is marked, and tapping a cell selects that day. It must fit at 400px.
2. **The selected day's ribbon** below the strip, large, with labels and ticks. It is the editor:
   - **Tapping a segment** opens the edit box for that block (p36 → p37).
   - **Tapping empty time** opens the edit box for a new block starting at that time (rounded to 15 minutes), one hour long by default (p13–p17: "Press and Release anywhere to add a new Activity"). Keep a visible "+ Add activity" button too; web users may not discover tap-on-empty.
   - The day's name is shown under the ribbon (p24).
3. **The edit box is a dialog, not a full-screen sheet** (p17–p19: a small modal with the time tab, the type dropdown, Cancel/OK). Rework `BlockEditor`'s container into a centred card: max ~480px wide, scrolling inside if needed, over a dimmed backdrop, with **Cancel and Save adjacent at the bottom** (#45's complaint was the far top-right Save). Keep its contents and behaviour. Keep "Delete" inside it. Also fix the theming bug: the editor currently renders **light-themed inside the dark app**. Use the theme colours.
4. **Copy day** (p27–p29): keep the existing copy-to-day behaviour and its replace confirm. Present it as a compact row or popover beside the day ribbon, not a separate section.
5. **Breakdown pie** beneath (p42–p43: "Tap this pie chart to see a breakdown of what your time is spent on during the week"): a pie of **planned weekly minutes per activity type** for the active routine, using the type colours, with a legend (type, hours, %). Tapping it switches to the ranked bars (p43), or navigates to Analytics → Breakdown; pick one and say why. No chart library: RN views are fine (e.g. a stacked ring from rotated half-discs, or a simple conic gradient on web with a fallback). If a true pie is impractical without a dependency, **stop and say so** rather than adding one.
6. **Remove the vertical block-card list** from the Routine tab (the plan: "don't ship both"). If `DraggableBlockList.tsx`, `BlockCard.tsx` or `Timeline.tsx` end up with no callers, delete them and their exports, and name the `D` lines.
7. **Accessibility:** each segment and strip cell is a button with a label ("Work, 9:00 to 12:00, Monday"). Keyboard reachable on web.
8. **Tests:** pure logic only. Week-strip cell data per the preference; tap-on-empty → default block times (rounding, clipping to the window, avoiding an overlap with the next block if you choose to, and say so); pie slice angles summing to 360 and matching `getRoutineBreakdown`. Run once with `TZ=UTC`.

## Scope
`src/screens/RoutineScreen.tsx`, `src/components/routine/*` (except `blockGoals.ts`: the `goal-order` lane is changing its sort), `src/components/ribbon/*` (extensions only, with tests), a new pie component, `src/components/index.ts` exports, and tests.

**Do NOT touch:** `src/store/*`, `src/core/types/*`, `src/core/engine/*` (the `goal-order` lane is in the store, persistence and `prediction.ts`), `GoalsScreen.tsx`, `HomeScreen.tsx`, `AnalyticsScreen.tsx`, `src/components/calendar/*`.

## Click-through the orchestrator will run (rendered, 500px and 1920px, example data)
The Routine tab shows the week strip (`M T W T F S S`, coloured stripes, today marked), the selected day's large ribbon with labels, a copy-day control, and a pie with a legend. No block cards anywhere.
- Tap Monday, then tap its Work segment → a centred dark dialog with times, type, goals section, and Cancel/Save side by side at the bottom → change the type to Fitness → Save → the segment turns green, and the strip cell updates.
- Tap empty evening time → a dialog prefilled at that time, one hour long.
- Copy Monday to Tuesday → confirm → Tuesday's ribbon matches Monday's.
- Tap the pie → the breakdown appears.

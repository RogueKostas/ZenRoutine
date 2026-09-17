# Lane: ribbon-drag — drag a segment's edges to resize it, and zoom the day ribbon (#58 remainder)

Run `gh issue view 58`. Read `docs/DESIGN-2019.md` §4.2, "Pinch zoom and extents (p31–p35)", and **look at** `docs/design-2019/p31.jpg`, `p33.jpg`, `p34.jpg` and `p35.jpg`.

## Why
#63 and #58's tap-to-edit and tap-on-empty landed in #79: the Routine tab's day ribbon is the editor. #58's "done when" also asks for the design's direct manipulation:
- p31 (red): **"Pinch Zoom"** and **"and drag activity extents around to adjust"**.
- p33–35: a zoomed evening ribbon; grabbing the boundary between two activities and dragging it moves both edges.

## What exists
- `DayRibbon` + `ribbonLayout.ts` (`src/components/ribbon/`): layout, `minutesAtFraction`, `pressLocationX` (reads `offsetX` on web), hit-testing, `onSegmentPress`, `onEmptyPress`, and a configurable `window`.
- `RoutineScreen.tsx` uses it as the editor; saving goes through the store's block update, with overlap validation (`findOverlappingBlocks`).

## Deliver
1. **Edge handles:** in edit mode (the Routine tab's large ribbon only), each segment shows grab handles at its start and end edges. Dragging one moves that edge, snapped to 15 minutes.
   - **A shared boundary** (end of A == start of B) moves both edges together, as p34–35 shows.
   - A free edge moves only its own block, clamped so it can't cross a neighbour or shrink the block below 15 minutes.
   - A live label shows the time being dragged (like the p14 caret).
   - On release, commit through the store in **one** update (both blocks for a shared boundary), respecting validation. If the store refuses, snap back and show the reason inline.
   - Must work with a **mouse on react-native-web** (PanResponder, or pointer events via react-native-gesture-handler, which is installed) and with touch.
2. **Zoom:**
   - `+` / `−` buttons, plus Ctrl/⌘+wheel on web and pinch on touch if cheap.
   - Zooming changes the ribbon's visible `window` around a focus point (the cursor, pinch centre, or the selected segment), with levels such as 16h (full day), 8h, 4h and 2h.
   - When zoomed in, the window can be panned by dragging empty track, or with ‹ › buttons.
   - Labels and ticks re-layout at the zoom (e.g. quarter-hour ticks at 2h). "Reset zoom" returns to the full day.
3. **Pure maths with tests:** drag → snapped minutes; shared-boundary detection; clamping against neighbours and the minimum length; the zoom window around a focus point (clamped to the day); pan; tick density per zoom level. Run once with `TZ=UTC`.
4. **Accessibility:** keyboard alternatives on a focused segment, e.g. `[` / `]` to move the start and `{` / `}` to move the end by 15 minutes, or visible "−15 / +15" controls in the edit box. The edit box's time fields already cover this functionally, so keep it light.

## Scope
`src/components/ribbon/*` (additive; the Home ribbon must stay read-only and unchanged), `src/screens/RoutineScreen.tsx`, and tests. The store's existing block update/batch actions may be used; **add** a batch update action only if one doesn't exist, with a test.

**Do NOT touch:** `src/store/persistence.ts`, `src/core/types/*`, `GoalsScreen.tsx` or `src/components/goals/*` (the `goals-list` lane is in the store and migrations right now); `HomeScreen.tsx` or `src/components/tracking/*` (the `current-activity` lane is next there); `src/components/calendar/*`.

## Click-through the orchestrator will run (rendered, 1280px, example data)
Routine → Thursday:
- Drag the boundary between Food (12–1) and Work (1–5:30) right to 1:30 → Food is 12–1:30 and Work is 1:30–5:30.
- Drag the free end of Side Project (9pm) to 9:15pm → 7–9:15pm.
- Try to drag it past Personal Development's start → it clamps.
- Zoom in on the evening → ticks densify, labels are readable; pan; reset.
- Reload → the changes persisted.

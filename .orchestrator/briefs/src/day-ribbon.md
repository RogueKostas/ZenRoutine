# Lane: day-ribbon — one DayRibbon component, used later in four places (Wave C foundation, for #56, #58, #63, #52 part 2 and #53)

Read `docs/ITERATION-1-PLAN.md` § Wave C ("Build the day ribbon once, as one component, and use it in four places…"). Read `docs/DESIGN-2019.md` §4.2 ("The ribbon", "Pinch zoom and extents", "Tap to edit"), §4.6 (the "Routine View" ribbon with the "you are here (in time)" marker), and §6 (glossary: Ribbon, Week strip). **Look at the page images** `docs/design-2019/p24.jpg`, `p31.jpg`, `p33.jpg`, `p36.jpg`, `p41.jpg`, `p74.jpg` and `p77.jpg` before you draw anything.

## Why
The ribbon is the one recurring visual idea in the design: a thick horizontal 7am→11pm bar of activity-coloured segments, labels above on leader lines, hour ticks below. It is the day editor (p24–p41). It sits at the bottom of every tracking screen with a green "you are here (in time)" marker (p73–p77). A squashed copy fills each cell of the week strip (p25, p42). The plan says to build it **once**; four implementations end up looking like four different things.

**This lane builds the component and its pure layout maths, and shows it in one place only: Home, read-only, with the now marker.** That is the smallest integration that makes it visible for review. The editable use (#58), the week strip (#63), the forecast day view and Current Activity are later lanes, so design the props for them now.

## Deliver
1. **Pure layout module**, e.g. `src/components/ribbon/ribbonLayout.ts`:
   - Maps a day's blocks to segments: x-offset and width as fractions of the visible window.
   - Default window 7:00–23:00, configurable (the design's onboarding sets wake and sleep times, p09).
   - Clips blocks that cross the window edges; handles overnight blocks (end < start) by showing only the part inside the window.
   - Hour tick positions and labels (`8 9 10 11 12 1 … 10`, as p24).
   - **Label placement with alternating heights so neighbouring labels don't collide** (p24). Deterministic; tested.
   - "Now" marker position, or null when outside the window.
   - Hit-testing: a fraction → which segment, for tap-to-edit later.
   - Grey "untracked" spans supplied by the caller (for #54): accept an optional list of spans with a style key, and draw them without computing them.
2. **`DayRibbon` component**, e.g. `src/components/ribbon/DayRibbon.tsx`, built with React Native views only (no SVG library, no new dependency). Props, at least:
   - `blocks`, `activityTypes`;
   - `window?`;
   - `now?: Date | null` (draws the green lollipop marker, p73–p77);
   - `labels?: 'type' | 'custom' | 'none'`, with an optional `labelFor(block)` so the forecast day view can print goal names;
   - `compact?: boolean` (the week-strip cell: no labels, no ticks, vertical-friendly later);
   - `onSegmentPress?(block)` (tap to edit, p36);
   - `overlays?` (the grey untracked spans);
   - `height?`.
   Colours come from the activity types. Must look right at 400px and 1920px: labels truncate, and ticks thin out on narrow widths (only every other hour below ~480px).
3. **Home integration:** a read-only `DayRibbon` for today's blocks from the active routine, with the live now marker, updating at least every minute. Put it near the top of Home (the director asked for "a linear progress bar of the day, with the little coloured activity slots and a little line with a time ticking from left to right", recording 06:58). Don't restructure the rest of Home; #55 and #56 will rework it.
4. **Day boundaries follow the stored `DayOfWeek` (0 = Sunday).** Use `new Date().getDay()` for today. Don't use the week-start preference here; it's only about display order.
5. **Tests:**
   - layout fractions, clipping, overnight handling;
   - label alternation with no overlaps for p24's sample Monday (take the times from DESIGN-2019.md §4.2);
   - now-marker in and out of the window;
   - hit-testing.
   Run the suite once with `TZ=UTC`.

## Scope
New `src/components/ribbon/*`, an export from `src/components/index.ts`, `src/screens/HomeScreen.tsx` (adding the ribbon near the top only), and tests.

**Do NOT touch:** `src/core/types/*`, `src/store/*`, `src/core/engine/*`, `BlockEditor.tsx`, `DraggableBlockList.tsx`, `Timeline.tsx`, `ActivityCalendar.tsx` or `RoutineScreen.tsx`. The `routine-types-only` lane (#60) is changing all of these right now, and it also edits one line of `HomeScreen.tsx` (~73, starting a scheduled block), so keep your Home change to an insertion near the top. `src/components/routine/Timeline.tsx` already exists; read it for ideas, but don't modify or delete it (#58 decides its fate).

## Click-through the orchestrator will run on web (400px and 1920px)
Load example data → Home shows a ribbon near the top with coloured segments for today's blocks → labels above the segments don't overlap → hour ticks below (thinned at 400px) → a green marker at the current time, moving within a minute → Home is otherwise unchanged.

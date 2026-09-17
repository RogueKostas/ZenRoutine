**RESUMING AN INTERRUPTED RUN.** Your previous work on this lane is committed on `agent/current-activity` and is otherwise good. Read it before you write anything. Keep what is right, but re-derive every claim rather than inheriting it. `origin/main` has been merged into your branch by the orchestrator (no conflicts); `npm ci` has been run.

# Lane: current-activity (fix) — the Current Activity view collapses at desktop width

## What I observed, rendered
I ran your branch's merged tree in headless Edge with the example data and pressed Start early on Home.

**At 500px wide: correct.** Centred pie with `24:58 / FOCUS`, then LIVE, "Tracking…", Pause and Stop buttons on the left, and `6:00 / 30hrs`, four tomatoes and "0 pomodoros this session" on the right, then the ribbon with the day name. It looks like the design.

**At 1280px wide: broken.** The pie is centred, but **both side columns have collapsed to about one character wide**, so their text wraps one letter per line down the screen:
- the left column renders `T r a c k i n g …` vertically, and the Pause and Stop buttons are squeezed to ~40px wide with their labels overlapping their icons;
- the right column renders `6 : 0 0 / 3 0 h r s` vertically, the four tomatoes stack in a column, and `0 pomodoros this session` runs off the bottom of the viewport;
- the LIVE badge is fine, and the ribbon at the bottom is fine.

The behaviour is all correct: the countdown ticked 24:58 → 24:55, Pause froze it and showed PAUSED, Resume continued, Stop wrote `pauses: [{start, end}]` with schema v9, and the grey untracked spans and three "Not tracked" row notes appear on Home.

## What to do
1. **Fix the wide layout.** Diagnose it rather than guessing — the likely cause is the three-column row: the side columns have no width basis (RN's default `flexShrink: 1` on text plus a `flex: 1` pie), so they shrink to their smallest word. Give the columns a sensible minimum (e.g. the pie a fixed size, the side columns `flexGrow: 1, flexBasis: 0, minWidth: 180`), or drop to the 500px stacked layout below some breakpoint and only use three columns when there is room for them.
2. **Add a pure test for the layout decision** (a function returning the column widths or the chosen arrangement for a given container width), with a negative control. `currentActivityView.ts` already holds this kind of logic. Cover ~360, 500, 900, 1280 and 1920px.
3. **Check the other new surfaces at wide width for the same mistake**: the tomato row, the Settings Pomodoro row, and the ribbon card in the view.
4. Keep everything else as it is. Don't rework behaviour, don't change the schema, and don't touch other screens.

## Gates
As before, and all of them again on the final tree: `npm run typecheck`, `npm test` (it was **687** on your merged tree), `TZ=UTC npm test`, `npm run build:web`. A negative control for each new test. Commit on the same branch; do not push.

## Report
Say what the actual cause was, in one line, and what the layout now does at each of the widths above. **Corrections to this brief are welcome** — if my diagnosis is wrong, follow the measurement and say so at the top.

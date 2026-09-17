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
3. `npm test` exit 0 — re-measure the suite on your base before changing anything and cite it (it was 472 on `main` @ b33d1d2, 17 Sep 17:58); it must not go down. **Also run it once with `TZ=UTC`** (CI is UTC; a host-timezone-dependent test turned `main` red on 17 Sep — never build `Date`s at module load in a file that sets `process.env.TZ` in `beforeAll`).
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

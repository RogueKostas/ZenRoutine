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
3. `npm test` exit 0 — re-measure the suite on your base before changing anything and cite it (it was 304 on `main` @ 7526c29, 17 Sep 16:50); it must not go down. **Also run it once with `TZ=UTC`** (CI is UTC; a host-timezone-dependent test turned `main` red on 17 Sep — never build `Date`s at module load in a file that sets `process.env.TZ` in `beforeAll`).
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

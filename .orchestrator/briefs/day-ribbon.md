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

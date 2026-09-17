# Lane: week-start — Monday-first everywhere, with a Settings choice (#44)

Run `gh issue view 44` and read it in full. Then read `docs/DESIGN-2019.md` §3 (decision 5) and the week strip in §4.2. **The design doc is now on `main` and authoritative;** its page images are in `docs/design-2019/`.

## Why
The week runs Sunday → Saturday throughout the app. The director (recording 12:11): "my week I would start on a Monday and end on a Sunday… it would be nice to add it to the settings." The design's week strip is `M T W T F S S` (p10, p25, p42), and its calendar is Monday-first (p69). Wave A exit criterion 3: a Monday-first week, and the review script opens the Routine week and the calendar.

**Measured on `main` today:** Routine's day tabs read `Sun Mon Tue … Sat`; Analytics → Calendar (`src/components/calendar/ActivityCalendar.tsx`, moved there this afternoon) is a Sun–Sat grid; the copy-day row is Sun-first.

## Deliver
1. **A persisted preference `weekStartsOn: 0 | 1`** (0 = Sunday, 1 = Monday), **default 1**. There is no settings object in `AppState` today (`src/core/types/AppState.ts`). Add a small `preferences` object (e.g. `preferences: { weekStartsOn: 1 }`) so Wave C can add a Pomodoro toggle beside it. This changes stored shape, so:
   - bump `CURRENT_SCHEMA_VERSION` (currently 4, `src/store/persistence.ts`) and add a migration that fills the default;
   - add a test that loads a **real pre-change v4 blob** and asserts everything survives and the preference is Monday;
   - make sure export/import (backup) carries it, and an older backup without it imports with the default;
   - keep the quarantine and repair mechanisms intact. Read `persistence.ts` and the tests around it before editing. The comments there record several hard-won invariants (issues #4, #18, #19, #32, #36, #38).
2. **Stored `DayOfWeek` numbering does NOT change** (0 = Sunday stays in the data). Only display order and week-boundary maths follow the preference. Add pure helpers in `src/core/utils/time.ts` (add only, in their own block at the end; two other lanes are adding parsers to this file): e.g. `orderedWeekDays(weekStartsOn): DayOfWeek[]`, `getWeekStart(date, weekStartsOn)`, and route the existing `getLocalWeekStartDateKey` through the preference (keep its signature compatible, or update every caller).
3. **Apply it everywhere a week is shown or bounded:** Routine day tabs and the copy-day row (`RoutineScreen.tsx`); the calendar grid and its column labels (`ActivityCalendar.tsx`); the Analytics "this week" window (`AnalyticsScreen.tsx`); any Home "this week" figure; and any prediction or engine code that assumes a Sunday week boundary (grep `getDay()`, `getLocalWeekStartDateKey`, `DAY_NAMES`/`DAY_LABELS`, `% 7`). List every site you changed and every site you checked and left.
4. **Settings row:** "Week starts on" → Monday / Sunday, using the app dialog (`useDialog().choose`, from `src/components/common`; `Alert.alert` is banned and a test enforces it). Settings has a matching Theme row to copy from.
5. **Validation copy:** `src/core/engine/validation.ts` says "between 0 (Sunday) and 6 (Saturday)"; that's still true of storage, so leave it or reword it without implying display order.
6. **Tests:** a week boundary under both settings (e.g. a Sunday date belongs to the week starting the previous Monday under 1, and starts its own week under 0); `orderedWeekDays` for both; the migration test above.

## Scope
`src/core/types/AppState.ts`, `src/store/persistence.ts` (migration only), `src/store/useAppStore.ts` (preference state + setter + defaults only), `src/core/utils/time.ts` (add at end, plus `getLocalWeekStartDateKey`), `src/screens/RoutineScreen.tsx`, `src/components/calendar/ActivityCalendar.tsx`, `src/screens/AnalyticsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/HomeScreen.tsx` (week figures only), engine files only where a week boundary is computed, and tests.

**Do NOT touch:** `src/components/routine/BlockEditor.tsx` and `TimePicker.tsx` (the `inline-pickers` lane is in them), `src/screens/GoalsScreen.tsx` (`goals-inputs` is landing), and `_addSampleData` / `src/store/sampleData.ts` beyond what the new state field strictly requires.

## Click-through the orchestrator will run on web (cleared storage, 400px and 1920px)
Onboarding → example data → Routine tabs read `Mon Tue Wed Thu Fri Sat Sun` → Analytics → Calendar grid columns Mon…Sun, with today in the right column → Settings → Week starts on → Sunday → Routine and Calendar both switch to Sun-first → reload: the choice persists → switch back to Monday.

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
3. `npm test` exit 0 — the suite is **129 tests on `main` @ 41a90cc** (measured 17 Sep). Re-measure on your tree and cite it; it must not go down.
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

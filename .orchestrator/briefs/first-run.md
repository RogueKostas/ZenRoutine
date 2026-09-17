# Lane: first-run — five working onboarding slides, and example data from the first screen (#40, #62)

Run `gh issue view 40` and `gh issue view 62` and read both in full before starting.

## Why
**#40.** On web, onboarding shows slide 1 on every step. `handleNext` in `src/screens/OnboardingScreen.tsx` calls `scrollToIndex` on a horizontal `FlatList` with no `getItemLayout`, which does not scroll on react-native-web. `SCREEN_WIDTH` is also read from `Dimensions.get('window')` at module scope. **Measured on the live build, 17 Sep, 800px-wide pane:** all five slides render squashed side by side in one viewport, with titles overlapping. So the width maths is wrong as well as the scroll.

**#62.** Seeding the 14 Sep review took an F12 console script. `_addSampleData` already exists (`src/store/useAppStore.ts`, around line 1334), but its only UI entry points are Settings and the debug panel. Wave A's exit criterion 2: a clean browser profile reaches a populated, forecastable app in two taps, with no developer tools.

## Deliver
1. **Onboarding that pages correctly on web and native.** Measure the width from the container's `onLayout`, not `Dimensions` at module scope, so a resize is followed. Each slide is exactly one container wide. Next/Back move one slide; the dots reflect the index. The simplest robust option is fine: render only the current slide, with an index in state, and drop the FlatList paging entirely if that is what works on web. Put the paging logic (index clamping, button label, offset for an index and width) in pure functions and test them. The test must go red on the old behaviour.
2. **"Try it with example data"** on the last onboarding slide, next to **Get Started**. It loads the example set and completes onboarding in one tap. Also offer it in Home's empty state (no routine and no goals), with one line saying Settings → Reset All Data removes it again. Keep Settings' existing entry; don't edit `SettingsScreen.tsx`.
3. **A sample set good enough to review with** (#62's scope): a full Monday–Friday routine, lighter weekends, at least three activity types, a handful of goals across them with different estimates, and enough tracking history that **at least one goal has a confident forecast and at least one stays low-confidence**. If `_addSampleData` already does this, prove it with a test that asserts both confidence levels via the prediction engine. If not, improve it. Moving the sample definitions into their own module (e.g. `src/store/sampleData.ts`) is welcome; keep `_addSampleData` as the entry point. Dates must be relative to "now" so the data never goes stale.
4. **Loading must not destroy real data silently.** State what `_addSampleData` does when data already exists, and test it. From onboarding and the empty state this can't come up, but say so.

## Scope
`src/screens/OnboardingScreen.tsx`, the empty-state section of `src/screens/HomeScreen.tsx`, `_addSampleData` and any new sample-data module, `App.tsx` only if onboarding completion needs wiring, and tests.

**Do NOT touch:** `SettingsScreen.tsx`, `BlockEditor.tsx`, `TrackingControls.tsx`, `RoutineScreen.tsx`, `ActivityTypesScreen.tsx` (another lane is replacing their dialogs), `ActiveTimer.tsx`, `QuickStart.tsx`, `AnalyticsScreen.tsx`, `CalendarScreen.tsx`, or `src/store/persistence.ts`. In `useAppStore.ts`, change only the sample-data code.

## Click-through the orchestrator will run on web (cleared storage, 400px and 1920px)
Five distinct slides, reached with Next; Back works; resizing mid-onboarding keeps one slide per view; "Try it with example data" lands on a populated Home; Goals shows at least one confident and one low-confidence forecast; resetting data and reloading shows the empty-state offer.

---

## Standing rules for every Iteration 1 lane (read all of it)

**Context.** Iteration 1 re-converges this app on its 2019 design. Read `docs/ITERATION-1-PLAN.md` (the goal and the invariants) and the section of `docs/REVIEW-2026-09-14.md` your issue cites. If `docs/DESIGN-2019.md` exists on your base, it is authoritative for anything user-visible. **If your brief and the design disagree, stop and report — do not choose.**

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

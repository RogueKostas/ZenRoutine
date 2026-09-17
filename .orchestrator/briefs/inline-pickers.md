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

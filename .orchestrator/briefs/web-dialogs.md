# Lane: web-dialogs — replace every `Alert.alert` with a dialog that works on web (#39)

Run `gh issue view 39` and read it in full before starting.

## Why
`Alert.alert` does nothing on react-native-web: no dialog, no console error. There are **23 call sites in `src/`** (measured 17 Sep with a grep), and on the web build — the only build anyone uses — every one is dead. Destructive actions silently do nothing, and validation failures are invisible, so forms just sit there. Wave A's exit criterion 6 says every destructive or confirming action must give a visible response.

Current sites (grep `Alert\.alert` yourself; this list may be stale):
- `src/screens/SettingsScreen.tsx` — theme picker (a **three-option chooser**, not a confirm), Load Sample Data, Reset All Data (confirm and failure), import success/errors, export errors, Privacy Policy
- `src/screens/ActivityTypesScreen.tsx` — delete confirm, name validation, "cannot delete"
- `src/screens/RoutineScreen.tsx` — "Replace existing blocks?" on copy-day, "Copied" confirmation
- `src/components/routine/BlockEditor.tsx` — activity-type validation, invalid block, time conflict, delete confirm
- `src/components/tracking/TrackingControls.tsx` — two discard confirms
- `src/components/debug/DebugPanel.tsx` — debug-only; convert as well so the ban can be enforced

## Deliver
1. **One cross-platform dialog**, e.g. `src/components/common/Dialog.tsx`, with an imperative API that reads like the old one, so call sites stay short. For example a `DialogProvider` mounted once in `App.tsx` plus `useDialog()` returning `confirm({ title, message, confirmLabel, destructive }) → Promise<boolean>`, `notify({ title, message })` and `choose({ title, options }) → Promise<value | null>`. It must render as an in-app modal (RN `Modal` or an absolutely positioned overlay) that works on web, iOS and Android, is keyboard-dismissable on web (Escape = cancel), and fits a 400px viewport. Export it from `src/components/common/index.ts`. Explain the choice in a short comment.
2. **Convert every call site.** The theme picker becomes a real `choose` with three options. Confirmations use `confirm`; success and failure messages use `notify`.
3. **Validation failures:** show them **inline** next to the offending field (BlockEditor, ActivityTypesScreen) rather than modally. Use `notify` only where there is no field to anchor to (e.g. a time conflict). Say what you did.
4. **Enforce the ban:** add a test that scans `src/` and fails if `Alert.alert` (or `Alert` imported from `react-native`) appears anywhere. Its negative control is re-adding one call.
5. Unit-test the dialog's pure part, e.g. a reducer or queue that resolves promises in order, including cancel and Escape resolving `false`/`null`.

## Scope
The files above, plus the new dialog component, its tests, `App.tsx` (mounting the provider only) and `src/components/common/index.ts`.

**Do NOT touch:** `src/screens/OnboardingScreen.tsx`, `HomeScreen.tsx`, `AnalyticsScreen.tsx`, `CalendarScreen.tsx`, `ActiveTimer.tsx`, `QuickStart.tsx`, or `useAppStore.ts` beyond reading it. Other lanes own those right now. In `SettingsScreen.tsx`, change only the dialog calls; another lane later adds settings rows there.

## Click-through the orchestrator will run on web
Settings → Privacy Policy, Theme, Load Sample Data (confirm and cancel), Reset All Data (confirm and cancel). Activity Types → delete one in use, delete one not in use, save with an empty name. Routine → copy a day onto a day that has blocks. Block Editor → save an overlapping block, delete a block. Tracking → discard. Every one must visibly respond.

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

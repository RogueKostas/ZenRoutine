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

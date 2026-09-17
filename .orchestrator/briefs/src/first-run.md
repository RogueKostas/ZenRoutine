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

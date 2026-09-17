# Lane: calendar-home — put the tracking calendar inside Analytics, reachable without a hidden button (#47)

Run `gh issue view 47` and read it, then read `docs/ITERATION-1-PLAN.md` § "Screen map", Analytics row.

## Why, and a reconciliation you must follow
`src/screens/CalendarScreen.tsx` (tracking history) is registered on the root stack and reachable only through a `📅 Calendar` button in `src/screens/AnalyticsScreen.tsx` (around line 162), behind the repo's only `@ts-ignore`. On 14 Sep the director went through the whole app and never found it.

**The issue says "reachable without going through Analytics". The later Iteration 1 plan supersedes that:** the Analytics tab gets a **segmented control** at the top, and the calendar lives there as a segment. Wave C will add a *forecast* calendar segment alongside it, so don't add a sixth tab. Follow the plan. Exit criterion 7: the director finds the calendar without being told where it is.

## Deliver
1. A segmented control at the top of Analytics: **Breakdown | History** (reads well at 400px). Breakdown is today's Analytics content, unchanged. History renders the tracking calendar inline. Make the segment list a small typed array so a later lane can add a **Forecast** segment in one line; don't build the forecast.
2. Turn the calendar into a component, e.g. move the body of `CalendarScreen.tsx` into `src/components/calendar/TrackingCalendar.tsx`, and render it in the History segment. Title or subtitle: **"Tracking history"**, so it's clearly not the forecast.
3. **Remove the `@ts-ignore`** and the hidden button. If the root-stack `Calendar` route has no remaining callers, remove it from `RootNavigator.tsx` and `navigation/types.ts`, and say so. Deleting `CalendarScreen.tsx` is allowed if its content moved (your `D` line is expected; name it).
4. Add a test that fails if `@ts-ignore` or `@ts-nocheck` appears anywhere in `src/` (the plan's invariant 5). Its negative control is re-adding one.
5. Test the segment state as a pure function if there's any logic; don't invent logic to test.

## Scope
`src/screens/AnalyticsScreen.tsx`, `src/screens/CalendarScreen.tsx`, a new `src/components/calendar/`, `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`, and tests.

**Leave the calendar's week-start and day-name arrays alone:** another lane makes the week Monday-first next, in these files, and wants a clean move, not a rewrite. **Do NOT touch:** `SettingsScreen.tsx`, `HomeScreen.tsx`, `OnboardingScreen.tsx`, `ActiveTimer.tsx`, `QuickStart.tsx`, `useAppStore.ts`, `BlockEditor.tsx`, `RoutineScreen.tsx`.

## Click-through the orchestrator will run on web (400px and 1920px)
Analytics tab → segmented control visible without scrolling → History shows the tracking calendar titled "Tracking history", with example data showing tracked days → month navigation works → Breakdown still shows today's content. No stray Calendar button.

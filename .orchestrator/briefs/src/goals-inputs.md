# Lane: goals-inputs — chip-height filter rows on web, and an estimate field that understands "12h" (#43, #46)

Run `gh issue view 43` and `gh issue view 46` and read both in full before starting.

## Why
**#43.** Both filter rows on the Goals screen (status and activity type) render on web as ~265px-tall vertical bars, with the label floating mid-height. A horizontal `ScrollView` in a column parent stretches its content to the cross axis on react-native-web. Recording 14:31: "whoa, this is like quite broken, this view".

**#46.** The goal estimate accepts only bare minutes. Recording 15:06: "I'd rather this be able to read, if I do '12 hours' for example — '12h' or '12hr'." It took four attempts to enter twelve hours. Wave A's review script step 4: "Set an estimate as `12h`".

**What the 2019 design shows (pp. 49–57, transcribed from the page images this week):** a goal's estimate defaults to "1hr". Tapping it lets you type a number, and after "10" + Enter the row shows **"10hrs"**. In the design, **a bare number means hours**, not minutes.

That conflicts with #46, which lists bare `90` as 90 minutes. **Resolution for this lane:** accept both explicit units everywhere, and treat a bare number as **hours** (matching the design and the director's own "12" intent). Show the parsed value under the field, so it's never a surprise. State this at the top of your report. If the code makes it unsafe (e.g. imports or stored data rely on bare minutes), stop and say so rather than choosing.

## Scope, and what's coming
Wave B will rewrite `src/screens/GoalsScreen.tsx` (912 lines) into the design's text list with a filter box and an inline add field. **Keep this lane's changes to that file small and local**; don't restructure it. The parser is the durable part.

## Deliver
1. **`parseDuration(input): { minutes: number } | { error: string }`** in `src/core/utils/time.ts` (add only; timer-units already added `formatElapsed` and `formatGoalTimeLabel` there, so leave those alone). Accept, case-insensitive with optional spaces: `12` (hours), `1.5`, `12h`, `12hr`, `12hrs`, `12 hours`, `1 hour`, `90m`, `90 min`, `90 mins`, `90 minutes`, `1h30`, `1h30m`, `1h 30m`, `1:30` (h:mm), `.5h`. Reject with a readable message: empty, `0`, negatives, `abc`, `12x`, `1h70m`, over 10,000 hours, and non-integer minutes after conversion (round to the nearest minute instead, and say so in a code comment). Table-test all of it.
2. **The estimate field** in the goal form uses it. Echo what it understood under the field (`= 12h` using `formatDuration`), or the error inline in red. Save is refused while the field is invalid, with the inline error showing rather than a dialog. If the old form stored minutes directly, convert at the boundary; the stored unit stays minutes.
3. **Filter rows**: fix both on the Goals screen so chips are chip-height at 400px and 1920px (e.g. `alignItems: 'flex-start'` on `contentContainerStyle`, or `flexGrow: 0` plus `alignSelf`). Grep `src/` for other horizontal chip rows (`horizontal` + chips) and fix the same pattern there **only if the file isn't owned by another lane** (see below); list the rest.
4. Put any chip-row style you share in one place rather than copying it.

## Scope
`src/screens/GoalsScreen.tsx` (filter rows and the estimate field only), `src/core/utils/time.ts` (add `parseDuration`), and tests.

**Do NOT touch:** `OnboardingScreen.tsx`, `HomeScreen.tsx`, `useAppStore.ts`, `persistence.ts` (another lane is in them now), `AnalyticsScreen.tsx`, `src/components/calendar/*`, `SettingsScreen.tsx`, `BlockEditor.tsx`, `TimePicker.tsx`, `RoutineScreen.tsx`. Those are being landed or are next in line.

## Click-through the orchestrator will run on web (400px and 1920px)
Goals tab: both filter rows are one line of chip-height pills; tapping a chip filters. New Goal: typing `12h` shows `= 12h` under the estimate; `1h30` shows `= 1h 30m`; `12` shows `= 12h`; `abc` shows an inline error and Save does nothing; saving with `12h` produces a goal card reading `0m / 12h` (or the app's equivalent).

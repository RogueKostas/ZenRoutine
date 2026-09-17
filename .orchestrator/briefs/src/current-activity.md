# Lane: current-activity — scheduled ≠ started ≠ tracked, pause, visible untracked time, and the Pomodoro Current Activity view (#54, #53)

Run `gh issue view 54` and `gh issue view 53`. Read `docs/DESIGN-2019.md` §4.6 (pp. 70–77) end to end and **look at** `docs/design-2019/p73.jpg`, `p75.jpg`, `p76.jpg` and `p77.jpg`. Read `docs/ITERATION-1-PLAN.md` § Wave C exit criteria 4 and 5, and the review script step 8 ("start the scheduled block, watch the seconds tick, run a pomodoro, pause, stop, and check the untracked gap appears").

## The design and the director
- p77 (orange): **"By default activities 'start' when scheduled but do not 'track'. The user has to actively indicate that the app can start tracking. The user can also pause tracking."** The IDLE mock shows grey wedges labelled **"Time spent not tracking"**.
- p75 (orange): **"The 'Current Activity' view is basically a powerful Pomodoro timer…"**. On one screen: a big circular countdown (`02:36`), a LIVE/IDLE badge, `4:22 / 8hrs` (goal tracked / estimate), a row of tomatoes (completed and available pomodoros this session), a notes icon, and the full-day ribbon with the "you are here" marker.
- Director (09:30): 25/5, with a 15-minute break after four; "almost a default for the app, but in settings you could turn it off." #53: **Pomodoro boundaries must not fragment the tracking entry**: one session, N pomodoros inside it.
- **Out of scope** (plan): activity notes (p76). Show the notes icon disabled with a "coming later" hint, or omit it, and say which. `TrackingEntry.notes` already exists; leave it alone.

## What exists (on `main` when you start; re-check)
- **Ribbon:** `DayRibbon` (#77) accepts caller-supplied grey `overlays` spans ("untracked") and a now marker.
- **Home:** `home-today` (#55/#56, may have landed) leads with the current scheduled block and starts tracking linked to its goal. Its selector (`src/core/engine/dayOverview.ts`) knows which goal a block serves.
- **Timer:** `ActiveTimer` shows seconds (#66) and `TrackingControls` has stop and discard with app dialogs (#68).
- **Preferences:** `preferences` exists in `AppState` (#73: `weekStartsOn`). Add `pomodoro` there.
- **Schema:** it will be at **v8** after `goals-list` lands (optional goal type and estimate). Your step is v8 → v9, explicit and version-gated, with `STRICT_SCHEMA_VERSION` still 4. Follow the pattern of v5–v8 in `persistence.ts`, and write a real v8 fixture with the unchanged store's own actions, as #78 did.

## Deliver
1. **Model (#54).**
   - A tracking entry gains **pauses**: `pauses?: { start: string; end?: string }[]`, or an equivalent you justify.
   - Tracked minutes = (end − start) − paused time, everywhere: `getTrackingEntryDurationMinutes`, goal progress, analytics, the forecast's logged minutes, and backup.
   - An entry can be **paused and resumed**, and at most one pause can be open.
   - Stopping while paused closes the pause at the stop time.
   - The migration fills nothing (absent = no pauses); test that old entries keep their durations exactly.
   - Check every duration consumer with grep.
2. **States (#54).**
   - A pure selector `getBlockTrackingState(block, entries, now)` → `'upcoming' | 'started' | 'tracking' | 'paused' | 'ended'`, plus `untrackedSpans` for the block: the parts of the block's scheduled time **not covered by tracked time** (before tracking began, during pauses, after it stopped early).
   - "Started" means the block's time has begun but the user hasn't confirmed tracking.
   - Pure and tested, with the design's example from p77: started some time after the scheduled start, and later paused.
3. **Pomodoro (#53).**
   - A pure state machine `pomodoroAt(sessionStart, pauses, now, settings)` → `{ phase: 'focus' | 'short-break' | 'long-break', remainingSeconds, completedPomodoros, cycleIndex }`, with defaults 25/5/15, a long break after 4, and paused time excluded.
   - Breaks do **not** create entries or pauses. The entry is one continuous session; breaks are just the timer's phase. State this in the code, and say whether break time counts as tracked (the design and the director imply the session is the tracked unit; pick one, justify it, and flag it for the director).
   - Settings row: "Pomodoro timer" on/off (`preferences.pomodoro.enabled`, default **on**). Off means a plain running timer (today's behaviour).
4. **Current Activity view.** A screen or modal opened from Home's active tracking card and from starting a scheduled block. It contains:
   - A large circular countdown for the current phase (RN views, no dependency; a ring of segments or two rotated half-discs, as the breakdown pie in `src/components/breakdown/` does).
   - A LIVE / IDLE / PAUSED badge.
   - `4:22 / 8hrs` goal progress (lifetime tracked / estimate; hide it when the entry has no goal or the goal has no estimate).
   - A tomato row: filled for completed pomodoros, part-filled for the current one, empty for the rest of a 4-set.
   - **Pause / Resume** and **Stop**.
   - The day ribbon at the bottom with the now marker **and grey untracked overlays** for today's blocks.
   - It must work at 500px and 1920px. The phase change (focus → break) should be obvious; a gentle on-screen banner is enough (no notifications).
5. **Visible untracked time (Wave C exit criterion 5):** "A scheduled block that was never confirmed shows its untracked time as a grey wedge rather than vanishing." Show grey spans on Home's ribbon for today's past and current blocks, and in the Current Activity view. If Home's Day Overview rows can show "not tracked" for past blocks cheaply, do it (a small label). Otherwise say so.
6. **Tests:** migration (v8 → v9) with a real fixture; duration with pauses across every consumer; the state selector (p77's case, never-confirmed, stopped early, overnight); the pomodoro machine (4 cycles → long break; pause freezes the countdown; turning it off); untracked spans. Run once with `TZ=UTC`.

## Scope
`src/core/types/TrackingEntry.ts`, `src/core/types/AppState.ts` (preferences), `src/store/*` (pause/resume actions, preference setter, migration), `src/core/utils/time.ts` (duration only), `src/core/engine/*` (new `trackingState.ts`, `pomodoro.ts`; duration consumers in `analytics.ts`/`prediction.ts`), `src/components/tracking/*`, a new Current Activity screen and its navigation route, `src/screens/HomeScreen.tsx` (wire the entry point and the untracked overlays; keep the rest as `home-today` left it), `SettingsScreen.tsx` (one row), and tests.

**Do NOT:**
- touch `GoalsScreen.tsx`, `src/components/goals/*`, `src/screens/RoutineScreen.tsx`, `src/components/routine/*` or `src/components/calendar/*`;
- change `src/components/ribbon/*` beyond additive props with tests;
- build activity notes or the catch-up queue (#57, Iteration 2).

## Click-through the orchestrator will run (rendered, 500px and 1920px, example data)
- Home: the current scheduled block → Start → the Current Activity view opens: LIVE, a 25:00 countdown ticking, `x / yh` for the goal, an empty tomato row, and the ribbon with the marker.
- Pause → PAUSED, and the countdown freezes; Resume.
- A past block today that was never tracked shows grey on the ribbon.
- Settings → Pomodoro off → the view shows a plain elapsed timer.
- Stop → Home; the entry's duration excludes the paused time.

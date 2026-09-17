# Iteration 1 — review readiness

**Build:** `main` @ `71d88d6` · deployed at <https://zenroutine-web.onrender.com> (bundle `index-2d744945d2de47778e626cdf3779743f.js`)
**Gate:** `npm run typecheck` exit 0 · **725 tests / 44 files** (129 at the start of the iteration), green under the host timezone and `TZ=UTC` · `expo export --platform web` succeeds · CI green on `71d88d6`
**Checked:** 17 Sep 2026, on the deployed build from a clean browser profile.

Iteration 1 asked for one thing: that this review be a conversation about whether the 2019 design is *right*, not about whether the build *matches* it. Every issue in Waves A, B and C is closed.

---

## 1. The review script, step by step

From `ITERATION-1-PLAN.md`. Run on the deployed build, driven through the DevTools protocol with real mouse and keyboard input (screenshots in the PRs listed).

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Open in a clean browser profile | **PASS** | Fresh profile, no storage |
| 2 | Walk onboarding end to end | **PASS** | Five distinct slides in order: Welcome · Set Meaningful Goals · Plan Your Week · Track Your Time · See Your Progress. Back works; the last slide offers both buttons |
| 3 | Load example data from the first-run screen | **PASS** | One tap on the last slide (or on an empty Home) fills the app |
| 4 | Goals: name-only goal · inherit type under a filter · drag to the top · `12h` estimate | **PASS** | "Call the dentist" stored with no type and no estimate; "Draft slides" added under the Work filter stored as Work; a real mouse drag put it top, hidden goals kept their order; `12h` echoes `= 12h` |
| 5 | Routine: tap a segment and change it · copy a day | **PASS** | Tapping Work 9–12 opens the edit box; choosing Fitness relabels the segment `Fitness, 9am to 12pm`; Copy day asks "Replace existing activities?" and copies |
| 6 | Calendar: when each goal completes · reorder and watch the dates move | **PASS** | With **all tracking history deleted**, the calendar still dates every goal. Before: Ship 2 Oct, Q4 6 Oct. After dragging Q4 to the top: **Q4 21 Sep, Ship 6 Oct** |
| 7 | Home: today's goals with progress, and where "now" is | **PASS** | Ribbon with a live marker; rows name goals (`13:00–17:30 Ship the analytics dashboard 45/80h`); past rows greyed and marked "Not tracked"; the current row leads with Start |
| 8 | Track: start the scheduled block · seconds · pomodoro · pause · stop · untracked gap | **PASS** | Start opens Current Activity: LIVE, 25:00 counting down (24:58 → 24:55), tomatoes, `6:00 / 30hrs`. Pause → PAUSED and the countdown freezes at 24:57; Resume continues; Stop stores the pause and excludes it from the duration. Untracked time is grey on the ribbon |
| 9 | Nothing needs developer tools; nothing silently does nothing | **PASS** | Every confirm and message is an in-app dialog (Privacy, Theme, Reset, Load Sample Data, Replace blocks, Delete). `Alert.alert` is banned by a test |

**Widths.** Every step was checked at desktop width (1024–1280px). Onboarding, Home, Goals, the routine editor dialog and the Current Activity view were also checked at 400–500px. Headless Edge will not lay out below ~500px, so true 400px rests on the in-app browser checks (Wave A) and on unit tests.

---

## 2. What changed this iteration

| Wave | Issues | What you will notice |
|---|---|---|
| **A** | #39 #40 #41 #42 #43 #44 #45 #46 #47 #59 #62 | Onboarding works; example data in one tap; Monday-first weeks with a setting; the timer counts seconds; `4h / 20h` instead of `240 / 1200 min this week`; chip rows are chips; inline time fields; the calendar is reachable; every dialog works on web; the design is in the repo |
| **B** | #48 #49 #50 #51 #55 #60 | The routine is made of activity types only; goal priority is list order with drag; type and estimate are optional, so the app works as a plain to-do list; adding under a filter inherits the type; Home names the goals |
| **C** | #52 #53 #54 #56 #58 #63 | The forecast calendar (month/week/day, filter, milestones); the Pomodoro Current Activity view with pause and LIVE/IDLE; visible untracked time; the day ribbon on Home with a live marker; the Routine tab as week strip + tappable ribbon + breakdown pie; drag the ribbon edges and zoom |
| **Also** | #38 | A data-safety gap closed: a record set aside during load now always reaches its backup before the main store is rewritten |

The design itself is now in the repo: `docs/DESIGN-2019.md`, with all 85 page images in `docs/design-2019/` and every handwritten annotation transcribed verbatim with its page and pen colour.

---

## 3. Decisions taken for you, which you may want to reverse

Each was a judgement call where the design was silent or the issue and the design disagreed. None is expensive to change.

1. **A plain number in the estimate field means hours** (`12` → 12h), following design pp. 57–58 rather than #46's "bare number = minutes".
2. **A new goal's "1hr" is a placeholder, not a stored estimate**, so a to-do item claims no forecast time. The Block Editor's quick-add *does* store 60 minutes, because a goal added there is meant to be scheduled.
3. **Copy day copies *to* another day**; the design (p29) says "Copy *from* other day". The end state is the same.
4. **The calendar segment is labelled "Calendar" and the screen heading "Forecast"**.
5. **Break time counts as tracked.** One entry per session; a Pomodoro break only changes the timer's phase.
6. **Untracked time appears twice**: as a ring around the Current Activity countdown and as grey on the day ribbon. p77 shows it in the timer pie only.
7. **An end time before a start time is an overnight block**, not an error (existing behaviour, relied on by validation and Home).
8. **The routine keeps one global goal order**, not one per activity type; a filtered list reorders relative to its visible neighbours.

## 4. Known gaps and deliberate omissions

- **Never run on a phone or tablet** ([#15](https://github.com/RogueKostas/ZenRoutine/issues/15)). Every native claim in this document is untested: this is a web build only. Pinch zoom on the ribbon has never been tried on touch hardware.
- **Activity notes** (design p76) are out of scope for Iteration 1; the button is visible but disabled.
- **The catch-up queue** ([#57](https://github.com/RogueKostas/ZenRoutine/issues/57)) is Iteration 2, as planned. The design's notification drumbeat (pp. 78–80) is not built.
- **A full 25-minute Pomodoro cycle** has not been watched end to end; the 25/5 and four-then-15 rules are covered by unit tests only.
- **True 400px** rests on Wave A's in-app browser checks and on unit tests (see §1).
- **Design inconsistencies left unresolved**, recorded in `DESIGN-2019.md` §4: p74 says past goals are "grayed out" but draws them black; "Development" versus "Personal Development"; the unnamed blue envelope activity type; several colour mismatches on p69.
- **The 14 Sep review has 14 corrections** recorded in `DESIGN-2019.md` §7 — mostly page numbers, plus the mode icons being on pp. 68/72 rather than 42–45.

## 5. Still waiting on you

- [#31](https://github.com/RogueKostas/ZenRoutine/issues/31) Should deleting a goal reset its competitors' forecast evidence?
- [#34](https://github.com/RogueKostas/ZenRoutine/issues/34) What happens when a skeleton record is unreadable? (Two permanent-brick routes sit behind this.)
- [#35](https://github.com/RogueKostas/ZenRoutine/issues/35) Should goal progress be reconciled when an entry is quarantined?
- [#15](https://github.com/RogueKostas/ZenRoutine/issues/15) No physical-device smoke has ever been run.

---

## 6. How to run the review

Open <https://zenroutine-web.onrender.com> in a clean browser profile (or clear site data), and walk the nine steps above. Record your screen and narrate, as on 14 Sep — that recording is what produced this iteration.

**Tag each remark as one of three things.** This is the whole point of the exercise:

- **bug** — it is broken, or it does nothing.
- **drift** — it works, but it does not match the design. Name the page if you can (`docs/design-2019/pNN.jpg`, or open `docs/DESIGN-2019.md` and search).
- **design** — it matches the design, and the design is wrong.

**The iteration has worked if most of your remarks are "design".** A remark tagged *drift* is a defect in this iteration; a remark tagged *design* is the conversation Iteration 2 is for.

Two things worth doing deliberately, because they are new and they are the point of the product:
1. **Reorder your goals and watch the calendar.** Drag a goal to the top of Goals, then open Analytics → Calendar. The completion dates should move. That loop — "when will this be done, and what happens if I change my mind" — is what the 2019 design is for.
2. **Start a scheduled block and pause it.** The gap between what you planned and what you tracked is meant to be visible as grey, not scored.

*Written 17 Sep 2026 by the orchestrator. Every PR in this iteration carries its own rendered evidence and its own "NOT OBSERVED" list.*

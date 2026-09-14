# Iteration 1 — "Faithful"

**Goal.** Get ZenRoutine to a state where Kostas's next review is a conversation about whether the 2019 design is *right*, not about whether the build *matches* it.

That is the whole test. The 14 Sep review derailed in the first thirty seconds on a broken onboarding, and spent the remaining twenty-nine minutes on drift. Iteration 1 succeeds when he can open the web build cold, use every screen without developer tools, and recognise the app from his own drawings.

Read `docs/REVIEW-2026-09-14.md` first — it is the evidence behind every issue referenced here. The transcript is at `docs/review-2026-09-14-transcript.txt` if a brief is ambiguous.

---

## Decisions already made — do not re-open

| # | Decision | Source |
|---|---|---|
| 1 | **The routine is made of activity types only.** `RoutineBlock.goalId` is removed; goals draw from their type's pooled minutes in priority order. Tracking entries still link to a goal — the *plan* no longer names one in advance. | Kostas, 14 Sep · [#60](https://github.com/RogueKostas/ZenRoutine/issues/60) |
| 2 | **The bottom tab bar stays.** The navigation shell is unchanged; the *screen content* becomes faithful. The design's single-surface + mode-icons idea is parked until the faithful screens exist and can be judged by use. | Kostas, 14 Sep · [#56](https://github.com/RogueKostas/ZenRoutine/issues/56), [#58](https://github.com/RogueKostas/ZenRoutine/issues/58) |
| 3 | **Faithful first, polish second.** Where the design and a nicer idea disagree, build the design. Kostas: *"I would follow this UI/UX even if it's like super simplistic, and then we can polish."* | Recording 24:58 |
| 4 | **Phone is the product; web is the review surface.** Every change must work at ~400px and on the deployed web build. | Recording 02:22 |

---

## The working rule

> **Shell stays. Content becomes faithful.**

Tabs remain `🏠 Home · 📅 Routine · 🎯 Goals · 📊 Analytics · ⚙️ Settings`. What lives inside each one is re-derived from the 2019 pages.

### Screen map

| Tab | 2019 source | What it becomes |
|---|---|---|
| **Home** | pp. 73–77 *Day Overview* | Today's scheduled **goals** with time ranges and cumulative progress (`14.30–17.00 · Integrate Analytics · 5/8hrs`), past rows greyed, current row prominent. Day ribbon 7am→11pm at the bottom with a live "you are here" marker. Quick Start leads with the currently scheduled block, not a six-type grid. |
| **Routine** | pp. 36, 41–43 | Week strip `M T W T F S S` with colour columns; a day ribbon that is edited by **tapping a segment**; breakdown pie beneath it. |
| **Goals** | pp. 45–67 | A text list. Row = `[done] [name] [type icon or ?] [estimate or 1hr]`. Filter box top-right. Drag rows to reprioritise. Type and estimate both optional. Adding a goal under a filter inherits that type. |
| **Analytics** | p. 43 + new | Keeps the tracked-vs-planned breakdown. The **forecast calendar** ([#52](https://github.com/RogueKostas/ZenRoutine/issues/52)) needs a home — put it here as a segmented view alongside the existing tracking calendar, rather than adding a sixth tab. Both must be reachable without a `@ts-ignore` button. |
| **Settings** | — | Unchanged, plus `weekStartsOn` and a Pomodoro toggle. |

Anything not in that table is Iteration 2.

---

## Wave A — Get in and use it

Nothing here is deep. All of it is what makes a review possible at all.

| # | Title |
|---|---|
| [#59](https://github.com/RogueKostas/ZenRoutine/issues/59) | Re-extract the design doc with its annotations — **and commit it to the repo** |
| [#39](https://github.com/RogueKostas/ZenRoutine/issues/39) | `Alert.alert` is a no-op on web: 19 flows silently do nothing |
| [#40](https://github.com/RogueKostas/ZenRoutine/issues/40) | Onboarding renders slide 1 on every step |
| [#41](https://github.com/RogueKostas/ZenRoutine/issues/41) | Link to Goal shows raw minutes, mislabelled "this week" |
| [#42](https://github.com/RogueKostas/ZenRoutine/issues/42) | Active timer never shows seconds |
| [#43](https://github.com/RogueKostas/ZenRoutine/issues/43) | Goals filter chips render as tall columns on web |
| [#44](https://github.com/RogueKostas/ZenRoutine/issues/44) | Week starts Sunday; Monday-first with a setting |
| [#45](https://github.com/RogueKostas/ZenRoutine/issues/45) | Time picker and New Goal take over the whole screen |
| [#46](https://github.com/RogueKostas/ZenRoutine/issues/46) | Goal estimate accepts only bare minutes |
| [#47](https://github.com/RogueKostas/ZenRoutine/issues/47) | The tracking calendar is unreachable |
| [#48](https://github.com/RogueKostas/ZenRoutine/issues/48) | Cannot create a goal from the Block Editor |
| [#62](https://github.com/RogueKostas/ZenRoutine/issues/62) | Sample data reachable from first run |
| [#38](https://github.com/RogueKostas/ZenRoutine/issues/38) | Merge-stage side-car write swallowed on the migrate path |

**#59 has a correction worth stating loudly:** the corrected spec must land **inside this repository**, at `docs/DESIGN-2019.md`, with the page images it cites. The current spec lives in a OneDrive folder no lane can see, which is the mechanical reason every lane drifted. A design document outside the repo is not a design document.

### Exit criteria
Kostas opens `zenroutine-web.onrender.com` in a clean browser profile and, **without opening developer tools**:
1. sees five distinct onboarding slides and reaches the end;
2. loads example data from a button on the first-run screen;
3. sees a Monday-first week;
4. starts a timer that counts in seconds;
5. sees `4h / 20h`, never `240 / 1200 min this week`;
6. gets a visible response from every destructive or confirming action;
7. finds the calendar without being told where it is.

---

## Wave B — The model matches the document

| # | Title |
|---|---|
| [#60](https://github.com/RogueKostas/ZenRoutine/issues/60) | Implement the decision: routine = activity types only |
| [#49](https://github.com/RogueKostas/ZenRoutine/issues/49) | Goal priority becomes list order, not an enum |
| [#50](https://github.com/RogueKostas/ZenRoutine/issues/50) | Activity type and estimate become optional |
| [#51](https://github.com/RogueKostas/ZenRoutine/issues/51) | Adding a goal in a filtered list inherits the type |
| [#55](https://github.com/RogueKostas/ZenRoutine/issues/55) | Day Overview names goals, past rows greyed |

Order matters here. **#60 before #49** — dropping `goalId` is what makes a per-type capacity pool exist, and #49's ordering is what that pool is consumed in. **#49 before #52** — the forecast cannot sequence without a total order.

`GoalsScreen.tsx` is 912 lines. Wave B should leave it smaller than it starts, not larger; the design's goals screen is a list, a filter box and an add field.

### Exit criteria
1. The Goals screen is recognisably p. 51 and p. 67: a list, a filter box, drag to reorder.
2. A goal can be created with a name alone and nothing errors or hides it.
3. No block in the routine offers a goal picker.
4. Home names the goals scheduled for today, not the activity types.
5. The forecast explainer copy no longer claims goal-linked blocks are dedicated.

---

## Wave C — The two things the app is for

| # | Title |
|---|---|
| [#52](https://github.com/RogueKostas/ZenRoutine/issues/52) | Forecast calendar with fill-forward sequencing |
| [#53](https://github.com/RogueKostas/ZenRoutine/issues/53) | Current Activity: Pomodoro timer wired into the routine |
| [#54](https://github.com/RogueKostas/ZenRoutine/issues/54) | Scheduled ≠ started ≠ tracked; untracked time visible |
| [#56](https://github.com/RogueKostas/ZenRoutine/issues/56) | Day ribbon on Home with a live marker |
| [#63](https://github.com/RogueKostas/ZenRoutine/issues/63) | Routine surface: week strip and breakdown |
| [#58](https://github.com/RogueKostas/ZenRoutine/issues/58) | Ribbon becomes the routine editor — tap a segment |

Build the **day ribbon once**, as one component, and use it in four places: Home, Routine (editable), Current Activity, and the calendar's day zoom. It is the single recurring visual idea in the design; implementing it four times is how it ends up looking like four different things.

### Exit criteria
1. Given a routine and ordered goals, the calendar shows the day each goal is forecast to complete — **with no tracking history at all**.
2. Zooming to a day shows which goal occupies which block, in order.
3. Re-ordering goals visibly moves the completion dates.
4. A tracking session runs 25/5, tomatoes fill, four pomodoros yield a 15-minute break, and Settings can turn the whole thing off.
5. A scheduled block that was never confirmed shows its untracked time as a grey wedge rather than vanishing.

---

## Invariants — true at every merge

1. **The gate runs on the merged tree**, not the branch. Full suite green, type-check clean, `expo export --platform web` succeeds.
2. **Test count never decreases.** It stands at 129. A change that removes behaviour removes its tests and adds the replacement's.
3. **No data loss on upgrade.** Anything that changes stored shape ships a migration and a test that loads a pre-change store and asserts what survives. The quarantine mechanism stays intact.
4. **Web is a first-class target.** Every UI change is verified on the deployed build at 1920px and at 400px. `Alert.alert` is banned (see #39); use the replacement.
5. **No new `@ts-ignore`.** The existing one on the calendar navigation goes away in Wave A.
6. **The design document is the tiebreaker.** After #59 lands, `docs/DESIGN-2019.md` is in-repo and authoritative. If a brief and the design disagree, stop and say so rather than picking.

---

## How to run it

Point Claude Code at this file and run the orchestration loop:

```
Read docs/ITERATION-1-PLAN.md and docs/REVIEW-2026-09-14.md, then orchestrate
Wave A to completion. Lanes run locally as headless claude workers in git
worktrees. Merge green PRs without asking. Stop and report at the wave exit
criteria rather than rolling into Wave B.
```

Waves are sequential; issues *within* a wave are parallel except where Wave B notes an ordering. Four concurrent lanes matches the existing `.orchestrator/config.json`.

**Deploy at each wave boundary** and post the URL — Render is on `main` with `autoDeployTrigger: checksPass`, so a green merge is a deploy. The wave is not done until the exit criteria have been checked against the deployed build, not the local one.

---

## The review script

This is what Kostas will do at the end. Lanes should treat it as the acceptance test for the whole iteration.

1. Open the web build in a clean browser profile.
2. Walk onboarding end to end.
3. Load example data from the first-run screen.
4. **Goals** — add a goal with a name only. Add another under a Work filter and check it inherited Work. Drag one to the top. Set an estimate as `12h`.
5. **Routine** — look at the week. Tap a segment on Monday's ribbon and change it. Copy Monday to Tuesday.
6. **Calendar** — find when each goal completes. Drag a goal up in Goals, come back, and see the dates move.
7. **Home** — see today's goals with their progress, and where "now" is on the ribbon.
8. **Track** — start the scheduled block, watch the seconds tick, run a pomodoro, pause, stop, and check the untracked gap appears.
9. Nothing in steps 1–8 requires developer tools, and nothing silently does nothing.

---

## Explicitly out of scope for Iteration 1

Do not start these; they are Iteration 2 or later.

- [#57](https://github.com/RogueKostas/ZenRoutine/issues/57) Catch-up queue replacing the notification drumbeat — the largest single behaviour change, and it wants the tracking states from #54 to exist first.
- Activity notes (design p. 76).
- Accounts, Google auth, multi-device sync.
- AI / MCP features — asking when a goal completes, telling it to reprioritise.
- [#12](https://github.com/RogueKostas/ZenRoutine/issues/12), [#13](https://github.com/RogueKostas/ZenRoutine/issues/13), [#14](https://github.com/RogueKostas/ZenRoutine/issues/14) — the product issues from the earlier session. #13 in particular should wait for #54 and #57 to define what the two sources actually are.
- Visual polish, animation, theming beyond what the faithful screens need.

## Still waiting on Kostas — none of it blocks Iteration 1

- [#31](https://github.com/RogueKostas/ZenRoutine/issues/31) Should deleting a goal reset its competitors' forecast evidence?
- [#34](https://github.com/RogueKostas/ZenRoutine/issues/34) What happens when a skeleton record is unreadable? *(two permanent-brick routes sit behind this)*
- [#35](https://github.com/RogueKostas/ZenRoutine/issues/35) Should goal progress be reconciled when an entry is quarantined?
- [#15](https://github.com/RogueKostas/ZenRoutine/issues/15) No physical-device smoke has ever been run.

---

*Written 14 Sep 2026 against `main` @ 5361355. Supersedes the sequencing in `HANDOVER-PROMPT.md`.*

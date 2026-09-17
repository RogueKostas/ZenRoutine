# Iteration 1 — goal-mode run plan

**What this is.** The execution plan for driving `docs/ITERATION-1-PLAN.md` to completion unattended, under Claude Code's `/goal`. The iteration plan says *what* and *why*; this file says *in what order, how it is checked, and when to stop and hand back*.

**The end state.** The build is *review-ready*: Kostas can open the deployed web build cold, walk the plan's nine-step review script without developer tools, and spend the review on whether the 2019 design is right rather than whether the build matches it.

**Scope note.** `ITERATION-1-PLAN.md` says to stop after Wave A. This run deliberately continues through Waves B and C, because a Wave A–only build still fails the iteration's own test (the Goals, Routine, Home and tracking screens would still be drift). Each wave boundary is still deployed, verified and **posted** — the run just doesn't wait there. If you want the old behaviour, change §8's condition to end at Wave A.

Written 17 Sep 2026 against `main` @ 41a90cc (last app-code change `e271813`, 12 Sep; 129 tests).

---

## 1. Authority granted by starting this goal

Starting `/goal` with the condition in §8 authorises the orchestrator to:

- create branches and worktrees, dispatch local lanes, push lane branches;
- open PRs, and **merge green PRs to `main` without asking** (this deploys — Render is on `main`, `autoDeployTrigger: checksPass`);
- close the issues those PRs resolve, and comment on issues with progress;
- commit this file, `docs/DESIGN-2019.md` and its page images.

It does **not** authorise: force-push, rewriting `main` history, changing Render/CI/GitHub settings, adding a runtime dependency (see §7), deciding any `needs-kostas` issue, or starting anything the iteration plan lists as out of scope (#57, #12–#14, notes, accounts, AI).

## 2. Operating rules

- Run as the orchestrator via the `orchestration-loop` skill with `.orchestrator/config.json` (local `claude` lanes, max 4 concurrent, forbidden list as configured). Record every pass in `.orchestrator/ORCHESTRATOR-STATE.md`.
- **Every lane worktree gets an allow list** in `.claude/settings.local.json` before dispatch (npm/npx/node, read-only git + `git add`/`git commit`, `gh issue view|list`, `gh pr view|diff`, WebFetch/WebSearch; deny list unchanged). Without it lanes return unverified trees. Read the file; don't assume.
- **Gate on the merged tree:** `npm ci` → `npm run typecheck` → `npm test` → `npm run build:web`, each its own process. Test count is cited in every PR and never decreases below the previous merge.
- **Every brief** cites `docs/DESIGN-2019.md` page numbers for its screen, the issue body, and `docs/REVIEW-2026-09-14.md`. Briefs say: *if the brief and the design disagree, stop and report — do not choose.*
- **UI changes are verified in a browser**, not just vitest: the lane serves `dist/`; the orchestrator re-checks on the deployed build at 1920px and 400px using the in-app browser with storage cleared.
- `Alert.alert` is banned once #39 lands. No new `@ts-ignore`. Stored-shape changes ship a migration **and** a test that loads a pre-change store.
- `GoalsScreen.tsx` (912 lines) must end Wave B smaller than it started.

---

## 3. Phase 0 — Pre-flight (orchestrator, no lanes)

1. `git fetch`; confirm `main` = `origin/main`, clean tree (the untracked `.orchestrator/briefs/` from pass 9 may be committed or left; don't delete).
2. `npm ci && npm run verify` on `main`; record the baseline test count (expect 129). CI on `41a90cc` is green.
3. Open `https://zenroutine-web.onrender.com` in the in-app browser; confirm it loads (it may cold-start). If it will not load after two tries → stop (§7).
4. Commit this file on a `docs/iteration-1-goal` branch and merge it.

**Exit:** baseline recorded; deploy reachable; plan on `main`.

## 4. Phase 1 — #59 The design document, in the repo (orchestrator does this itself)

Lanes cannot see OneDrive, so this cannot be a lane.

Source material, already on disk:
- `C:\Users\kzari\OneDrive\Zen Routine\converted\images\pageNN_img1.png` — 85 extracted page images (64 MB). **They contain the handwritten annotations**, but at least p. 69 is **flipped vertically** (text upside down, left-to-right order intact). Check every page's orientation; don't assume they're all the same.
- `…\Zen Routine-1.pdf` (146 MB, the original) and `…\claude_code_package\ZEN_ROUTINE_SPEC.md` (the text-only spec that caused the drift).

Steps:
1. Flip or rotate each page image to its correct orientation, downscale to ~1200px wide JPEG (target ≲15 MB total; no Python on this host — use PowerShell `System.Drawing` or a scratch Node script), write to `docs/design-2019/pNN.jpg`.
2. Read every page image and write `docs/DESIGN-2019.md`: one section per screen group, typed text summarised, **every handwritten annotation transcribed verbatim with its page number and colour**, each section linking its page images. Open with a note that the PDF's text layer is incomplete, so nobody works from it again.
3. Cross-check against the quotes in `docs/REVIEW-2026-09-14.md` Part 1 and #59's list: every quoted annotation must appear. Missing ones mean a page was misread.
4. Update `CLAUDE.md`'s pointer ("once #59 lands") to say the design is in-repo and authoritative.

**Exit:** PR merged, #59 closed, all annotations from #59's list findable by `grep` in `docs/DESIGN-2019.md`.

---

## 5. The waves

### Wave A — Get in and use it

Lanes are grouped to limit file conflicts. Batch 1 runs first because #39 touches many screens.

| Batch | Lane | Issues | Main files |
|---|---|---|---|
| 1 | `web-dialogs` | #39 | new dialog component; every `Alert.alert` site (23) |
| 1 | `first-run` | #40, #62 | `OnboardingScreen.tsx`, Home empty state, sample data |
| 1 | `timer-units` | #42, #41 | `ActiveTimer.tsx`, `QuickStart.tsx` |
| 1 | `sidecar-merge` | #38 | `src/store/persistence.ts`, `useAppStore.ts` |
| 2 | `week-start` | #44 | `RoutineBlock.ts`, `utils/time.ts`, `validation.ts`, `CalendarScreen.tsx`, Settings |
| 2 | `goals-inputs` | #43, #46 | `GoalsScreen.tsx` chips; duration parser (`12h`, `12hr`, `1h30m`, `90m`) |
| 2 | `inline-pickers` | #45 (time-picker half) | `TimePicker.tsx`, Block Editor |
| 2 | `calendar-home` | #47 | `AnalyticsScreen.tsx` segmented view; delete the `@ts-ignore` |

**Re-scoped, stated on the issues:**
- **#48** (create a goal from the Block Editor's Link to Goal section) conflicts with the settled decision in #60, which removes that section. Fold it into #60: the Block Editor shows the activity type's goals in order, with a quick-add field that creates a goal of that type. Comment this on #48 and close it with #60's PR.
- **#45's New Goal half** is covered by Wave B's inline add field (#50/#51). Wave A fixes the time picker only.
- **#39's "inline validation"** point is a design call. Use inline field messages for validation and the dialog for confirmations, and note the choice in the PR. That matches the design's minimal forms; if a lane finds the design says otherwise, stop.

**Wave A gate (on the deployed build, fresh storage, 1920px and 400px):** all seven exit criteria in `ITERATION-1-PLAN.md` §Wave A, each with a screenshot. Post the URL and the results in the conversation, then continue.

### Wave B — The model matches the document

Order is mandatory:

1. **`routine-types-only` — #60 (+#48).** Drop `RoutineBlock.goalId` from the type, UI and engine (dedicated-capacity branch in `src/core/engine/prediction.ts`). Persisted `goalId` is dropped in a migration, tested against a pre-change store. Fix the forecast explainer copy.
2. **`goal-order` — #49.** Priority becomes list position; migrate the enum to an order (highest priority first, ties by creation date). Drag to reorder on the Goals list (use the installed `react-native-gesture-handler`; must work with a mouse on web).
3. **`goals-list` — #50 then #51** (one lane, sequential; both rewrite `GoalsScreen.tsx`). Row = `[done] [name] [type icon or ?] [estimate or 1hr]`, filter box top-right, inline add field; type and estimate optional; adding under a filter inherits the type. Design pp. 45–67.
4. **`day-overview` — #55**, in parallel with 2–3 (Home only).

**Wave B gate:** the plan's five Wave B exit criteria on the deployed build; `GoalsScreen.tsx` line count reported and smaller than 912.

### Wave C — The two things the app is for

1. **`day-ribbon`** (first, alone): one `DayRibbon` component, 7am→11pm, coloured by type, labels, optional live "now" marker, optional tap-to-edit, optional goal labels per segment. Unit-tested. No screen changes beyond Home (#56 part 1).
2. Then in parallel:
   - **`home-now` — #56**: ribbon on Home with live marker; Quick Start leads with the scheduled block.
   - **`routine-surface` — #63 + #58**: week strip `M…S`, editable ribbon (tap a segment to edit), breakdown pie; copy-day still works. Keep the existing block-card list off-screen or remove it; don't ship both.
   - **`forecast-engine` — #52 part 1**: a pure fill-forward scheduler (routine × ordered goals → dated sequence, partial days, per-type pools, milestones). The #52 worked example (4h/day, 6h + 8h goals → done Tue midday, Thu) is a required test. Works with zero tracking history.
   - **`tracking-states` — #54 model**: scheduled / started / tracked / paused; untracked time is computed and stored or derivable. Migration if the shape changes.
3. Then:
   - **`forecast-calendar` — #52 part 2**: month grid (default) with dots by type, week and day zoom (day = ribbon with goal labels), type filter, completion/milestone toggle. Lives in Analytics as a segment (per #47).
   - **`current-activity` — #53 + #54 UI**: Pomodoro 25/5, ×4 → 15, tomatoes, seconds, LIVE/IDLE, `tracked / estimate` lifetime against the goal, ribbon with marker, grey "time spent not tracking" wedge; Settings toggle turns Pomodoro off.

**Wave C gate:** the plan's five Wave C exit criteria on the deployed build. For criterion 3, reorder goals and screenshot the calendar before and after.

---

## 6. Final — review-readiness check

1. On the final `main` commit: `npm run verify` exit 0 locally, CI green, and Render has deployed that commit (check the served bundle changed, or the build hash).
2. In the in-app browser with storage cleared, walk the **nine-step review script** from `ITERATION-1-PLAN.md` exactly, at 1920px, then again at 400px. Each step gets PASS/FAIL, a screenshot, and one line of evidence. Any FAIL goes back into the relevant wave as a lane, then this check is rerun from step 1.
3. Write and merge `docs/REVIEW-READINESS.md`:
   - build commit, URL, test count;
   - the step table;
   - known gaps and deliberate deviations (with issue links);
   - the still-open decisions (#31, #34, #35, #15);
   - **a one-page guide for Kostas's review:** record the screen and narrate as on 14 Sep, and tag each remark as **bug** (broken), **drift** (doesn't match the design page) or **design** (matches, but the design is wrong), naming the page where possible. The iteration has worked if most remarks are *design*.
4. Post the final report (format in §8).

---

## 7. Stop and hand back — do not work around these

Post a report headed **`STOPPED — NEEDS KOSTAS`** (what happened, evidence, the decision needed, suggested options) and end the goal when:

1. A brief, issue or lane result **disagrees with `docs/DESIGN-2019.md`**, or the design is silent or ambiguous on something a lane must decide and the choice is visible to users.
2. Work runs into **#31, #34 or #35**, or anything else labelled `needs-kostas`.
3. A change would **lose stored user data** or can't be given a migration test.
4. A **runtime dependency** would need to be added (dev-only test tooling may be added with justification in the PR).
5. The **same lane fails its gates three times**, or the test count would drop.
6. **Deploy verification fails:** CI red on `main` and not fixable within one lane, Render not deploying a green commit, or the site unreachable.
7. Anything needs a forbidden command, a settings change, or credentials.

Wave boundaries are **not** stop points. Post the URL and results, then continue.

---

## 8. The `/goal` condition

Start a fresh session in this repo (auto mode recommended), then run:

```
/goal Execute docs/ITERATION-1-GOAL.md as orchestrator until ZenRoutine Iteration 1 is review-ready. The goal is MET only when the conversation contains a final report headed "REVIEW-READY" that shows ALL of: (1) PRs merged and issues closed for #59, #39, #40, #41, #42, #43, #44, #45, #46, #47, #38, #62, #60, #49, #50, #51, #55, #52, #53, #54, #56, #58, #63, with #48 closed via #60's PR, listing each PR number; (2) `npm run verify` exiting 0 on the final main commit, stating its SHA and a test count of at least 129; (3) CI green on that SHA and the Render deploy of that SHA confirmed live at zenroutine-web.onrender.com; (4) all nine steps of the ITERATION-1-PLAN.md review script walked on the deployed build with cleared storage at both 1920px and 400px, every step marked PASS with evidence; (5) docs/REVIEW-READINESS.md merged. The goal is ALSO MET, and work must stop, when the conversation contains a report headed "STOPPED — NEEDS KOSTAS" that names a stop condition from section 7 of the plan, its evidence, and the decision required. A wave boundary, partial progress, a plan, or a promise to continue is NOT met.
```

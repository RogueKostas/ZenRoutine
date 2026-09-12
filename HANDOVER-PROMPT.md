# ZenRoutine — orchestrator handover prompt (2026-09-12 02:00Z)

You are taking over as orchestrator / technical lead of `RogueKostas/ZenRoutine` for Kostas Zarifis.
The previous orchestrator stopped because **the p0 and bug queue is drained**: everything still open
is either the director's decision or a product-sized feature, and neither should be started
unattended.

Read this file, then `.orchestrator/ORCHESTRATOR-STATE.md` top to bottom (nine passes, append-only),
then start at section 6.

---

## 0. Read this first — the sharpest unobserved thing

**Nothing in this repository has ever been run on a physical device.** Not once, in its entire
history. Every claim about native behaviour — SDK 54→57, safe areas, splash, gestures, keyboard,
timer suspend/resume, and now the whole hydration and quarantine path — is verified only by
`vitest` against a Map-backed AsyncStorage mock and by an Expo **web** export. That is issue **#15**
and it sits under everything else here.

The single sharpest instance: **PR #32 and PR #36 are two independent fixes to the same durability
path, merged within an hour of each other, and neither author saw the other's code.** The suite says
they compose. Whether they compose on a *real torn write* — the event both exist to survive — is
unknown and cannot be known without a device.

And issue **#38** records a real latent gap found in that composition: #32's awaited side-car write
protects **migrate-stage** drops only, while a **merge**-stage drop on a migrate-path hydration still
has its side-car failure swallowed with a `console.warn`. It is unreachable today **only because
every lenient repair happens to emit strict-valid output, and nothing enforces or tests that
invariant.** Read #38 before touching `src/store/persistence.ts` or `src/store/useAppStore.ts`.

---

## 1. Orientation

**The product.** ZenRoutine is an offline-first Expo / React Native app: set goals, plan a weekly
routine, track time against it, and forecast completion dates. Expo SDK 57, React Native 0.86, React
19.2, TypeScript 6, Zustand 5 with `persist` over AsyncStorage. `src/core/` is React-free domain
logic; `src/store/` owns persisted state and migrations; screens compose.

**Read before anything else:** `AGENTS.md` (binding working agreement), `docs/PRODUCT.md` (the
director's decisions D1–D8, dated 2026-09-11), `docs/REVIVAL_PLAN.md` (milestones R0–R6, with every
number now cited to the run and commit it was measured at).

**The machine.** Windows host `helix-shed-ds`. It is a console games box — PS4/PS5 SDKs, Nintendo
tools, Perforce — and it had **no JavaScript toolchain at all** before this run. What exists now was
installed portably, no admin, nothing on the system PATH:

| Path | What |
|---|---|
| `C:\RogueKostas\ZenRoutine` | the working checkout (`main`) |
| `C:\CoworkBridge` | the windows-bridge watcher — `pending\` in, `results\` out |
| `C:\CoworkBridge\tools` | node v22.23.2, npm 10.9.8, gh 2.100.0, claude 2.1.268 |
| `C:\CoworkBridge\tools\env.ps1` | **dot-source this first in every single bridge command** |
| `C:\CoworkBridge\scripts` | the orchestration-loop lane scripts |
| `C:\CoworkBridge\lanes` | lane worktrees and `<lane>-log\` directories |

Delete `C:\CoworkBridge\tools` to undo the toolchain. The bridge watcher is a PowerShell process, not
a service: after a reboot Kostas must restart it.

**The cloud sandbox cannot substitute for the host gate.** `npm ci` there fails with `E403` on
tarballs under this session's egress policy. Measured, not assumed.

---

## 2. Goals — what "done" meant for this run

Take a repository whose entire R1–R3 roadmap was sitting unmerged and unverified on a side branch,
land it, and drive every defect that landing exposed to zero, with every claim backed by a run.

That is achieved. The next run's goal is the director's to set (section 9).

---

## 3. Recent achievements — re-counted from the API, not from memory

**Eleven PRs merged. Suite 62 → 129. Ten issues closed.**

| PR | Issue | What | Suite on the merged tree |
|---|---|---|---|
| #2 | — | The unmerged R1–R3 branch: 7 commits, Expo 54→57, Render/EAS | 62 |
| #16 | — | `docs/PRODUCT.md` D1–D8 and `.orchestrator/` | — |
| #17 | #3 | Backwards clock no longer bricks hydration; quarantine sink | 72 |
| #22 | #7 | Confidence scoped to the activity type that changed | 79 |
| #25 | #6, #9 | Confidence scoped to the **goal**, not the activity | 82 |
| #26 | #23 | A no-op block save writes nothing at all | 86 |
| #27 | #10 | Every inherited number replaced with a measured one | 86 |
| #29 | #11 (repo half) | `branch: main` declared in `render.yaml` | 88 |
| #28 | #20 | Pointer-clear gated on the blame relationship | 88 |
| #30 | #24 | Fifteen-writer audit; three routine-level writers fixed | 98 |
| #32 | #18 | Side-car durability: async migrate, idempotent generations | 103 |
| #33 | #21 | Notice dismissal scoped to the event | 109 |
| #36 | #5 | Stale linkage references routed through the quarantine sink | 117 |
| #37 | #4 | Legacy open timers closed at *evidenced* time, and reported | 129 |

**Closed without code: #8.** A measure-only lane built real Android and iOS bundles and grepped
them: `babel-preset-expo` 56.0.0 made the `import.meta` transform default-on in the same SDK step
that deleted `babel.config.js`, and with the transform off the build *hard-fails* — so a successful
`expo export` is itself proof of absence. Do not restore `babel.config.js`; the old option name no
longer exists.

**Closed by measurement: #19.** CONFIRMED that a pre-v4 device could lose a quarantined record from
both storage keys. Observed write order, a control on a v4 blob, and a demonstrated failure — not
inference.

---

## 4. Directives from the owner, quoted, with status

1. *"let's use the orchestration looping skill windows bridge and any other relevant skills to
   progress the state of this app"* — done, nine passes.
2. *"feel free to place the windows bridge script in here … C:\CoworkBridge"* — done; the folder was
   granted mid-session and the bridge runs from there.
3. **Lanes:** local headless `claude -p`. **Authority:** merge green PRs alone. **Mode:**
   assembly-line. All three honoured.
4. *"Blocker 1: whatever you deem best"* → merged the R1–R3 branch and fixed forward.
5. *"RogueKostas is the account to use … kostas@roguesun.com is fine too… just don't use
   HyperKostas"* — every commit is `RogueKostas <kostas@roguesun.com>`, set per commit. HyperKostas
   was never touched.
6. *"in general want to build from main"* — recorded on #11; repo half landed as PR #29. **The
   Render-side blueprint re-sync is still outstanding and is his.**
7. *"yes just me testing/developing now so all good"* — accepts that `main` + `autoDeployTrigger:
   checksPass` makes the beta a live mirror of `main`.
8. *"i will look at my render subscription tomorrow"* — open.

---

## 5. State of the fleet

**No lanes are running. No worktrees remain. Nothing is unpushed.** Every `agent/*` branch was merged
and deleted; `git worktree list` shows only the main checkout. `origin/main` and the local `main`
agree.

Roughly **USD 62** of lane time was spent across fourteen dispatches.

---

## 6. Where to pick up — in this order

1. **Verify identity before any mutation.** `. C:\CoworkBridge\tools\env.ps1`, then
   `gh api user --jq .login` must print `RogueKostas`, and `git config user.email` must be
   `kostas@roguesun.com`. If either is wrong, stop and say so. Do not "fix" it by reading a
   credential.
2. **Confirm the bridge is alive.** Write a trivial command to `C:\CoworkBridge\pending\` and read
   the result back. If the watcher is not running, Kostas must start it — you cannot.
3. **Re-count the backlog from the API**, not from this file: `gh issue list -R
   RogueKostas/ZenRoutine --state open --limit 40`.
4. **Do not start a product feature until the director picks one** (section 9). #12, #13 and #14 are
   each multi-lane work touching types, store, screens and tests.
5. **If he answers the decisions**, #34 and #35 become schedulable immediately and #31 shortly
   after; brief them together, because they are one question (section 9).
6. **#38 is schedulable now** and is the only engineering row that does not need a decision first.
   It is small: assert the invariant, then either close the swallow or justify it truthfully.

---

## 7. The workflows

See the `orchestration-loop` SKILL.md. Config at `.orchestrator/config.json`: local transport,
`claude` backend, lanes root `C:/CoworkBridge/lanes`, `maxConcurrentLanes: 4`, `claude.bin` pinned to
the full path of `claude.cmd`.

Briefs for every lane run tonight are in `.orchestrator/briefs/` — read two or three before writing
your own. The pattern that worked: Why with evidence, Scope naming the other live lanes by file,
Build hazards the lane must verify itself, Acceptance with a negative control per instrument, and an
explicit invitation to correct the brief.

---

## 8. Rules that are not negotiable — the ones that bit *here*

- **Dot-source `C:\CoworkBridge\tools\env.ps1` in every bridge command**, or node/npm/gh are not
  found.
- **`$ErrorActionPreference='Stop'` in a bridge command kills the worker runspace and loses all
  stdout.** Use `Continue` and check explicitly. Cost one blind install run.
- **The bridge's worker runspaces persist environment variables between jobs.** A canary that set
  `CLAUDE_CODE_MAX_OUTPUT_TOKENS=256` killed three lanes mid-work. `env.ps1` now clears it.
- **A lane needs an ALLOW list, not just a deny list.** A non-interactive `claude -p` session has
  nobody to prompt, so anything not explicitly allowed is refused — including `npm --version`. Three
  lanes produced complete work and zero evidence before this was found. `lane-run.ps1` now writes
  both.
- **A substring deny entry that can appear in a path is a trap.** `Bash(*render*)` matched the
  worktree's own path and blocked `git add render.yaml`. Deny the command, not the word.
- **Poll lanes by RESULT EVENT, never by mtime.** A lane that has committed but is still alive is
  not finished.
- **A fresh worktree has no `node_modules`.** `npm ci` first, every time.
- **`package-lock.json` is TRACKED.** Never regenerate it. This also means **a lane cannot add a
  devDependency** — which is why the quarantine notice has no renderer-based tests.
- **`git checkout -- <path>` is denied inside a lane worktree.** Revert a negative control with its
  exact inverse edit and prove it with an empty `git diff`.
- **Never carry a test count forward.** Re-measure and cite the commit. The plan carried "11 tests"
  through three SDK upgrades, and "54 tests" turned out to be a count of `it(` declarations while
  the suite ran 62.
- **THE TRAP THAT HAS COST TWO LANES:** `parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)`
  means `repairLegacyValues` is **true** on a pre-v4 blob, so an `endTime < startTime` malformation
  is *repaired*, not quarantined. Any legacy-path test built on it **passes vacuously**. Use an
  invalid `source`, a non-string `id`, an unparseable date or a non-object row. One lane lost a probe
  to this; another found a *second* instance of it hiding in an existing assertion that could not
  tell the old behaviour from the new.
- **Authors never self-merge, including you.** Every PR here was gated by the orchestrator on the
  merged tree and merged with `--match-head-commit`.
- **When the gated push refuses on a conflict, re-dispatch the lane to resolve its own conflict.**
  Done twice; both times the lane proved its resolution was load-bearing with a control that reds the
  conflict-resolved test itself.
- **Corrections go public first**, on the issue or PR where the wrong claim was made, then into the
  state file. Nine lane corrections were accepted tonight; every one was right.

---

## 9. Open decisions for the owner

**Three of these are one question in four costumes: *what happens to derived numbers when the
records under them change?* Answer them together, not separately.** #6 already answered one face of
it in code — unlinked tracking counts as evidence for every goal of that activity type, time linked
to another goal never does — and the other three should be consistent with that.

**Decision 1 — #31: should deleting a goal reset its competitors' forecast evidence?**
  **A** yes, capacity genuinely changed  **B** no, the tracking is still valid observation
  **C** only when the deleted goal actually held dedicated capacity on that activity type.
  ← **C.** A goal with no linked blocks changes nothing and should cost nothing.
  Cost of waiting: low. Competing goals show a date the confidence claim no longer supports.

**Decision 2 — #34: what happens when a *skeleton* record (activity type, goal, routine) is
unreadable?**
  **A** a second side-car per record type  **B** reconstruct a placeholder the user renames
  **C** cascade — quarantine the record and everything depending on it.
  ← **A**, consistent with what exists, though it is the most work.
  Cost of waiting: **two live permanent-brick routes remain open.** A goal or routine block with a
  missing `activityTypeId`, and a routine block with a dangling `goalId`, still fail hydration
  forever, and the only recovery the UI offers wipes all local data. A test pins the current strict
  behaviour so the gap is visible rather than latent.

**Decision 3 — #35: should goal progress be reconciled when a tracking entry is quarantined?**
  **A** reconcile  **B** leave it  **C** reconcile *and say so* in the same notice.
  ← **C**, and it composes with the viewer costed on #21.
  Cost of waiting: low, but a `loggedMinutes` no longer backed by surviving entries is exactly the
  credibility problem D5 exists to avoid.

**Decision 4 — #11 (Render).** Re-sync the blueprint so `zenroutine-web` builds from `main`, and
find out what the ~USD 17/month buys. **Until this is done the public beta serves
`codex/r1-data-safety` and is missing every fix listed in section 3.** PR #29 records the intent;
only the re-sync moves the deployment.

**Decision 5 — #15 (a device).** Everything above is unverified on hardware. Also outstanding:
linking the repo to the correct **personal** Expo account before the first EAS build. `eas.json` and
the bundle id `com.roguekostas.zenroutine` are already checked in.

**Then the product queue**, in the order the director picks: **#12** tappable forecast breakdown
(estimate / trend / drift — D5), **#13** realtime vs retroactive tracking measured separately (D3),
**#14** the weekly review ritual (D4). Each is multi-lane. Brief one at a time.

---

## 10. Files

| Path | What |
|---|---|
| `.orchestrator/ORCHESTRATOR-STATE.md` | **append-only** run memory: nine passes, every measured gate, every correction, every rule that cost something |
| `.orchestrator/config.json` | lane transport, paths, deny and allow lists, forbidden verbs |
| `.orchestrator/briefs/*.md` | every brief dispatched tonight, including the resume and conflict-resolution preambles |
| `docs/PRODUCT.md` | the director's decisions D1–D8 |
| `docs/REVIVAL_PLAN.md` | milestones R0–R6; every figure cited to a run |
| `docs/CLOUD_BETA_TASK.md` | the connected-mode contract (ownership, transfer, conflicts) |
| `docs/reviews/PROTOTYPE_REVIEW_GUIDE.md` | the prototype review guide addressed to Kostas |
| `HANDOVER-PROMPT.md` | this file |

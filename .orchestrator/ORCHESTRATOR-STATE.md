<!-- APPEND ONLY. Never edit or delete a prior observation - append what replaced it and why. -->

# Orchestrator durable state - RogueKostas/ZenRoutine - run starting 2026-09-11

## Config
transport: local . backend: claude . lanesRoot: C:/CoworkBridge/lanes . base: main
cadence: 15 min active / 30 min idle . max lanes: 3
identity verified: git user.name `RogueKostas`, git user.email `kostas@roguesun.com` - 2026-09-11 18:1xZ
  UNCONFIRMED: `kostas@roguesun.com` is a Rogue Sun address on a personal repo. Director to confirm
  this is the intended commit identity for ZenRoutine before any lane commits.
gh login: NOT AUTHENTICATED as of 2026-09-11 18:20Z (`gh auth status` -> "not logged into any GitHub hosts").
  Blocks: issue creation, PR creation, PR merge. Director operator step required.
codex events probed: not probed - no codex CLI on this machine

## Host / toolchain - MEASURED 2026-09-11
Machine `helix-shed-ds` (Windows, PS 7.6.6, non-admin, winget 1.29.290 present).
It is a console games box: PS4/PS5 SDKs, Nintendo tools, Perforce, git 2.x, .NET. It had
NO node, NO npm, NO gh, NO claude CLI, NO WSL distro. The Node 24.13.0 R0 evidence in
docs/REVIVAL_PLAN.md was NOT recorded on this machine.
Installed by the orchestrator, portable, no admin, no system PATH change:
- C:\CoworkBridge\tools\node-v22.23.2-win-x64  (node v22.23.2, npm 10.9.8)
- C:\CoworkBridge\tools\gh                      (gh 2.100.0)
- C:\CoworkBridge\tools\env.ps1                 (dot-source this first in every bridge command)
Delete C:\CoworkBridge\tools to undo.
The Cowork cloud sandbox CANNOT substitute for the host gate: npm tarball fetches from
registry.npmjs.org return 403 under this session's egress policy. MEASURED 2026-09-11 18:1xZ.

## Transport
Cowork session <-> Windows host runs over the windows-bridge PowerShell watcher at
C:\CoworkBridge (pending/ + results/, 4 workers). Bridge root is OUTSIDE the repo.
A duplicate bridge copy was deployed at C:\RogueKostas\ZenRoutine\bridge before the
C:\CoworkBridge folder grant arrived; it is unused and should be deleted, and the
`/bridge/` line removed from .gitignore, once the loop is stable.

## Artifacts / dashboards
- Web beta: https://zenroutine-web.onrender.com - Render Blueprint `zenroutine-beta`, static site
  `zenroutine-web`, built from branch `codex/r1-data-safety` (NOT from main). ~USD 17/month.

## Ready-to-run commands
All bridge commands must start with: `. C:\CoworkBridge\tools\env.ps1`
- launch a lane:  `powershell -File C:\CoworkBridge\scripts\launch-lane.ps1 -Lane <name>`
- poll lanes:     `powershell -File C:\CoworkBridge\scripts\lane-status.ps1`
- land a lane:    `powershell -File C:\CoworkBridge\scripts\lane-push.ps1 -Lane <name>`
- lane result:    `python C:\CoworkBridge\scripts\lane-result.py C:\CoworkBridge\lanes\<name>-log`
- gate:           `npm ci; npm run typecheck; npm test; npm run build:web`

## Backlog scan - 2026-09-11 18:25Z
Counted from the git remote directly; `gh issue list` NOT available (gh unauthenticated), so the
issue tracker has NOT been read. Treat the issue counts as UNKNOWN, not zero.

Branch inventory (measured, `git log --oneline origin/main..<branch>`):
- origin/codex/r1-data-safety - 7 commits AHEAD of main, main has ZERO commits it lacks.
  35 files, +5973 / -4593. One deletion: babel.config.js.
- origin/codex/r0-tests-ci - 0 commits ahead. Already merged.
- origin/claude/phase2..phase6, origin/claude/zustand-store-debug-panel - stale, pre-R0, unassessed.

READY (ordered, with the reason):
1. Land `codex/r1-data-safety` into main. Unblocks every other row; main is currently a stale
   tree that does not match the deployed beta. Gate PASSED independently (below).
2. Fix the six review findings below, one lane each, after the merge.
3. Record product decisions D1-D8 as docs/PRODUCT.md and re-shape R2/R3/R5 around them.

BLOCKED-ON-HUMAN:
1. `gh auth login` on helix-shed-ds. Nothing can be filed, PR'd or merged until this is done.
2. Confirm commit identity kostas@roguesun.com vs a personal address.
3. Decision on landing the branch (see Merge decision below).

NEEDS-INVESTIGATION (schedulable as measure-and-report lanes):
- Native/Hermes startup after the babel.config.js deletion. No device or emulator on this host.
- Whether the Render blueprint should be repointed from `codex/r1-data-safety` to `main` after
  the merge, and what the USD 17/month is actually being spent on.

DONE-UNVERIFIED:
- Everything the branch claims for R1/R2/R3 on native. Web is verified; native is not.

Collisions to sequence: the six fix lanes below split cleanly into store/persistence (findings
1-3) and prediction engine (findings 4-5). Those two groups must not run concurrently against
the same file; within a group, serialise.

## Gate I ran myself on the merged tree - 2026-09-11 18:22Z
Branch tip 1fa3f45 == merged tree (verified: main has zero commits the branch lacks).
Run on helix-shed-ds in worktree C:\CoworkBridge\lanes\r1-review with portable node v22.23.2.
- npm ci                    -> exit 0, 584 packages, 18s. 23 advisories (1 low, 19 mod, 2 high, 1 crit).
- npm run typecheck (tsc)   -> exit 0
- npm test (vitest 4.1.11)  -> exit 0, 7 files, 62 tests passed
- npm run build:web         -> exit 0, 703 modules, 1.2MB bundle, exported to dist
This REFUTES the review's PLAUSIBLE claim that `typescript: ~6.0.3` is a nonexistent pin: npm ci
resolved it and tsc ran. Recorded as a correction below.

## Independent adversarial review of the branch - 2026-09-11 18:2xZ
Two non-author reviewers, static reading only (no node_modules in the cloud worktree).

P1 CONFIRMED F1 - useAppStore.ts:766 `stopTracking` does not validate endTime >= startTime, unlike
  addCompletedEntry/updateTrackingEntry. A backward clock change mid-timer writes endTime < startTime;
  on next launch persistence.ts:286 throws on the strict path and hydration fails permanently. The
  only offered recovery wipes ALL local data.
P1 CONFIRMED F2 - persistence.ts:419-429 legacy (<schema 4) migration force-closes secondary open
  timers with endTime = startTime, silently discarding their duration. tests/store/persistence.test.ts:93
  asserts this as intended.
P2 CONFIRMED F3 - persistence.ts:342-352 throws unconditionally on a dangling activityTypeId, with no
  version gate, unlike the sibling goalId/routineBlockId checks which repair legacy data. Same
  destructive-reset lockout as F1.
P1 CONFIRMED F4 - prediction.ts:66-75 getForecastEvidence filters tracking history by activityTypeId
  only, never by goalId. A goal with zero tracking of its own inherits another goal's evidence and is
  shown high confidence.
P1 CONFIRMED F5 - prediction.ts:71 compares evidence against routine.updatedAt, and every block
  mutation stamps the whole routine. Editing ANY unrelated block collapses every goal's confidence to
  low. Fires constantly in normal use.
P1 PLAUSIBLE F6 - babel.config.js deleted along with its documented `unstable_transformImportMeta`
  fix for zustand/middleware's import.meta under Hermes, with no replacement config. Web bundles
  fine (measured). Native startup UNVERIFIED - no device on this host.
P2 CONFIRMED F7 - tests/core/prediction.test.ts has no per-goal evidence isolation test; the
  arithmetic tests were independently re-derived and are sound.

## Merge decision (recommendation, awaiting director)
Recommend MERGE then fix forward. Reasons: the branch is strictly ahead with one deletion and no
conflicts; the gate passes on the merged tree; there are ZERO external users, so the data-loss
findings threaten only the director's own test data; and leaving it unmerged keeps main stale and
the paid beta building from a side branch. The seven findings become seven issues and seven lanes
immediately after the merge.

## Lanes in flight
| lane | transport | backend | launched | issue | deadline | worktree |
|---|---|---|---|---|---|---|
| (none yet - blocked on gh auth) | | | | | | |

## Merged this run
| PR | lane | merged sha | the gate I ran on the merged tree | issue commented |
|---|---|---|---|---|

## Release states reached
- source merged: NO (main still at eb357c3)
- app published: web beta live at https://zenroutine-web.onrender.com, built from the UNMERGED branch
- scenario accepted: NO - no physical-device smoke has ever been run on this project

## RULES THAT HAVE COST ME (append as they bite in THIS repo)
- Every bridge command must dot-source C:\CoworkBridge\tools\env.ps1 or node/npm/gh are not found.
- `$ErrorActionPreference='Stop'` inside a bridge command kills the worker runspace and LOSES all
  stdout. Use 'Continue' and check results explicitly. Cost one blind install run.
- The gh release zip for Windows extracts with `bin/` at the top level in some releases and a
  versioned wrapper directory in others. Locate gh.exe by search, never by assumed path.
- A fresh worktree has no node_modules.
- Poll lanes by result event, never by mtime.
- npm ci in the Cowork cloud sandbox fails with E403 on tarballs. The gate runs on the host only.

## CORRECTIONS POSTED - never walk one back
- 2026-09-11 18:22Z Review claimed `typescript: ~6.0.3` is likely a nonexistent version pin that would
  break npm ci. MEASURED FALSE on the host: npm ci resolved 584 packages and tsc ran clean. The
  reviewer flagged it PLAUSIBLE and named the check; the check was run. To be posted on the PR when
  one exists.

## Log
### 18:25Z - pass 1 (setup)
- landed: nothing
- launched: no lanes - blocked on gh auth
- learned: the entire R1-R3 + SDK 54->57 + Render/EAS roadmap already exists, green, on an unmerged
  branch; the host had no JS toolchain at all; the cloud sandbox cannot run the gate
- corrected: the typescript ~6.0.3 claim (above)
- last successful machine contact: 2026-09-11 18:22Z, bridge job zr-gate-2, exit 0

---

## Pass 2 - 2026-09-11 23:00-23:15Z

### Landed
Nothing. PRs #2 and #16 were merged in pass 1 at the director's explicit authorisation
("you are authorised to do those merges and continue the work"), giving origin/main = 261c592.
The gate had already been run by the orchestrator on the merged tree at 1fa3f45 - typecheck 0,
62 tests, web export 0.

### Launched
Three lanes from 261c592, backend claude, worktrees under C:/CoworkBridge/lanes:
- f1-hydration        -> issue #3 (F1)
- f5-confidence-scope -> issue #7 (F5)
- f6-hermes-probe     -> issue #8 (F6), measure-and-report, forbidden from fixing

Collision plan: #4 and #5 wait for f1 (same files); #6 waits for f5 (same file); #9, #10, #13,
#14, #12 follow.

### Learned - three dispatch failures, all the orchestrator's

1. `lane-run.ps1` resolved `claude` via Get-Command, which returns `claude.ps1`. The generated
   `run.cmd` cannot execute a .ps1, so the lane died with zero bytes of output and an EMPTY
   claude.err - no error anywhere. Fixed by pinning config `claude.bin` to the full path of
   `claude.cmd`.
2. An earlier one-line canary set `$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS='256'`. The windows-bridge
   worker runspaces PERSIST environment variables between jobs, so all three lanes inherited it
   and died mid-work with "response exceeded the 256 output token maximum" after 14 and 9 turns.
   Fixed by adding `Remove-Item Env:CLAUDE_CODE_MAX_OUTPUT_TOKENS` to C:/CoworkBridge/tools/env.ps1,
   which every bridge command dot-sources.
3. THE EXPENSIVE ONE. `lane-run.ps1` writes only a DENY list into the worktree's
   `.claude/settings.local.json`. In a non-interactive `claude -p` session there is nobody to
   prompt, so anything not explicitly allowed is refused - including `npm --version`. All three
   lanes produced complete, well-reasoned implementations and ZERO evidence: every acceptance gate
   came back MISSING, and `git add`/`git commit` were refused too, so the work sat uncommitted in
   the worktrees. Cost: USD 12.12 across the three lanes (5.67 + 5.54 + 0.91), 192 turns.
   Fixed by patching lane-run.ps1 to write an ALLOW list alongside the deny list: npm, npx, node,
   WebFetch, WebSearch and the read-only plus add/commit git verbs. git is enumerated rather than
   wildcarded so `git push` can never be allowed, and deny still takes precedence.
   All three lanes re-dispatched into their PRESERVED worktrees with the resume preamble.

Every one of the three lanes reported the block accurately, refused to self-grant a permission,
and corrected the brief. That is the behaviour the briefs asked for and they delivered it.

### Corrections the LANES made to MY briefs - all accepted

- f5: the brief forbade touching `src/store/persistence.ts`. That was wrong and the lane said so:
  `parseRoutine` builds an explicit object literal and `merge` runs `migratePersistedState` on
  every hydration, so any new field on `Routine` is dropped on every reload. A per-activity
  timestamp cannot be persisted without a parser change. The lane kept the touch to one call plus
  a local helper, away from the hydration path f1 owns. MY BRIEF WAS WRONG.
- f6: `babel-preset-expo` was NOT dropped from the dependency tree. `expo@57.0.19` declares it as
  a direct dependency (`package-lock.json:2923-2926,3731`), so only the project config file and the
  explicit `unstable_transformImportMeta: true` are gone. The real question is narrower than I
  wrote it. MY ISSUE TEXT WAS WRONG - to be corrected on #8.
- f6: the file was deleted at the SDK 56 step (`4a10b53`), not SDK 57, and its comment named
  SDK 54/55, not SDK 54. MY ISSUE TEXT WAS WRONG on both counts.
- f6 also rejected my third verdict option as worded: a device was never required for this
  measurement. `npx expo export --platform android` needs no hardware. What it lacked was
  permission to install dependencies. Correct, and accepted.

### Not yet verified
No lane has yet produced a single gate result. The suite count of 62 at 261c592 remains the last
measured number. f1 projects 62 -> 67 and f5 projects 62 -> 69 if their tests pass; both are
PROJECTIONS by the lanes, not measurements, and are labelled as such until a gate runs.

### Last successful machine contact
2026-09-11 23:16Z, bridge job zr-lanes-4, exit 0.


---

## Pass 3 - 2026-09-11 23:10-23:45Z

### Landed - two PRs, each gated by me on the merged tree

| PR | issue | merged sha | my gate on the merged tree | issue |
|---|---|---|---|---|
| #17 | #3 (F1) | 2189e5f (branch tip 370fcac) | npm ci 0 - typecheck 0 - **72 tests** - build:web 0 | closed by the PR |
| #22 | #7 (F5) | 9cca4f2 (branch tip f9081c3) | npm ci 0 - typecheck 0 - **79 tests** - build:web 0 | closed by the PR |

Both gated pushes reported 0 deletions before AND after syncing origin/main, tracked tree clean, and
remote ref read back matching. Both merged with --match-head-commit against the sha I gated.

PR #22's gate mattered more than usual: persistence.ts, useAppStore.ts and useAppStore.test.ts all
AUTO-MERGED against PR #17, which had landed minutes earlier, so that combination had never been
compiled or run anywhere before I ran it.

Suite progression, each number measured by me on the host, at the named commit:
261c592 = 62 -> 370fcac = 72 -> f9081c3 = 79.

### Closed without code: #8 (F6)
The f6-hermes-probe lane, forbidden from fixing, delivered the measurement and the answer is NOT A
DEFECT. `babel-preset-expo` 56.0.0 (2026-05-05) made the `import.meta` transform default-on and
renamed the option - the same SDK step that deleted babel.config.js. Verified in the shipped code
(`build/configs/expo.js:92`, opt-OUT), not only the changelog. Native android AND ios bundles were
built and grepped: one `import.meta` hit each, and it is a COMMENT in Expo's own ImportMetaRegistry.
Zustand resolves to CJS on native via a `react-native` export condition, so the ESM file is never
loaded there. Control: with `transformImportMeta: false` the build HARD-FAILS, so a successful
`expo export` is itself proof of absence - the feared failure is structurally impossible on SDK 57,
which is stronger than the issue asked for. Do not restore babel.config.js: the old option name no
longer exists.

### Reviews I ran myself as a non-author - 5 findings on #17, 5 on #22, all filed
Both branches merged anyway. The reasoning, recorded because it is a judgement and not a measurement:
each is a STRICT IMPROVEMENT over main with a green gate, and every remaining path to the old failure
predates the branch. Merging kept the loop moving; the findings became lanes.

New issues: #18 (p0, side-car can rotate out a genuine generation - the branch's own test asserting
the blob is unchanged is what makes the "unreachable" cap reachable), #19 (measure: can zustand's
migrate write-back lose a quarantined record on a pre-v4 blob), #20 (pointer-clear gate does not check
the blame relationship, so unrelated corruption is silently swallowed - the code contradicts its own
comment), #21 (notice dismissal not scoped to the event; side-car is write-only), #23 (p0, A NO-OP
BLOCK SAVE STILL COLLAPSES CONFIDENCE - `updateRoutineBlock` stamps unconditionally and BlockEditor
has no dirty check, so the #7 headline is only two thirds delivered), #24 (`setActiveRoutine` stamps
`updatedAt` on EVERY routine; a second writer the plan's remainder note does not mention).
#5 was WIDENED rather than duplicated: a linkage failure on a well-formed entry still bricks
hydration, outside the quarantine sink #17 added. Comment posted on #5.

### Launched
Three lanes from 9cca4f2, three non-colliding file groups:
- f4-goal-evidence -> #6 (p0), prediction.ts + prediction.test.ts. May also close #9.
- no-op-save       -> #23 (p0), useAppStore block mutations + BlockEditor.tsx
- docs-truth       -> #10, docs only

Held back deliberately to avoid collisions, for the next free slots: #18, #20, #5, #4 (all the
persistence.ts + quarantine group) and #24 (useAppStore routine mutations, collides with #23).

### Corrections the LANES made to MY briefs this pass - all accepted
- f1-hydration found a REAL BUG IN ITS OWN FIRST ATTEMPT once re-dispatched with the resume preamble:
  the pointer rule cleared `currentTrackingEntryId` by searching quarantine for a matching id, so a
  record whose own id is the unreadable field is quarantined as id:null, the search misses it, and
  hydration still bricks - by the exact mechanism being fixed. Negative control 3 is that bug going
  red. This is the second time the resume preamble has paid for itself.
- f1 also corrected a comment of its own that claimed the clamp made the action and persistence
  layers agree; `trackingEntryIsValid` requires endTime > startTime, so they do not. The asymmetry
  is deliberate and now documented as such.
- f5: my brief named three block mutations. There are FOUR - `copyDayBlocks` had the same blast
  radius and would have been a live hole. MY BRIEF WAS WRONG.
- f6: `git check-ignore -v dist` (which I put in the brief) is a misleading check - it exits 1 and
  prints nothing because the pattern is directory-only and the path did not exist. Use `dist/`.
  MY BRIEF WAS WRONG.

### RULES THIS PASS ADDED
- An orchestrator review that merges anyway must say WHY in the PR, not just list findings. "Strict
  improvement over main, no regression, gate green" is a defensible reason; silence is not.
- Re-dispatching an interrupted lane with the resume preamble is not a formality. Twice now the
  resumed lane found a defect in its own earlier work that inspection had missed.

### Not yet verified - unchanged and still true
No physical-device smoke has ever been run on this project (#15). Every native claim stays labelled
unverified. `expo export` exercises Metro, Babel and hermesc; it is not `eas build` and it is not a
device. The Render blueprint still builds from `codex/r1-data-safety`, not from main (#11, director's
call).

### Last successful machine contact
2026-09-11 23:42Z, bridge job zr-lanes-5, exit 0.


---

## Pass 4 - 2026-09-12 00:02-01:20Z

### Landed - three PRs, each gated by me on its own merged tree

| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #25 | #6 (F4), closes #9 | 1be6543 | ci 0, tsc 0, **82 tests**, web 0 | bf4e3c2 |
| #26 | #23 | 5dee5f2 | ci 0, tsc 0, **86 tests**, web 0 | e79ed46 |
| #27 | #10 | 15c0a76 | ci 0, tsc 0, **86 tests**, web 0, 0 source files changed | 1fbc197 |

Each gated push: 0 deletions before AND after sync, remote ref read back matching. Each merged with
--match-head-commit against the sha I gated. Each landed one at a time, re-synced and re-gated,
because #25 and #26 both touch code the other reads.

Suite: 79 at 9cca4f2 -> 82 at 1be6543 -> 86 at 5dee5f2. Every number measured by me on the host.

### Reviews I ran myself - I read the diffs this pass, not agent reports
For #25 and #26 the diffs were small enough to read directly and both are clean. Specifically
checked on #26: the early return fires BEFORE `updatedAt` is touched, so a no-op save now writes
literally nothing; and `changedFields` compares the merged block against the stored one rather than
trusting the payload shape, so a present-but-identical field does not count as a change.

### The correction that matters most this pass
f4-goal-evidence found that MY BRIEF WAS WRONG about the unlinked-entry question being open. It is
not: the strict alternative (unlinked counts for nobody) reddens SIX tests - its own plus five
pre-existing, including BOTH of PR #22's capacityChangedAt tests that my brief said must keep
passing untouched. Every existing evidence fixture is unlinked because `makeTrackingEntry` sets no
goalId. So "unlinked counts for nobody" and "#22's tests pass untouched" cannot both hold. The lane
would have made the same call on the merits and said so, but flagged that the choice was constrained
rather than free. That is the fourth lane correction accepted this run and the fourth that was right.

### The docs lane found a better defect than the one I briefed
I filed #10 as "the plan says 11 tests, the suite is 62". The lane established that:
- the 11 was NEVER WRONG - at f228fd1 and a192181 the suite genuinely is 8 + 3, and
  `git log eb357c3..a192181 -- tests` is empty. The defect is TENSE, not arithmetic: a true figure
  re-recorded in a form that reads as a description of the suite. It dated them rather than
  "correcting" them, which is the right treatment for a record.
- R1's "54 across six files" WAS wrong at the commit that claims it. d5b1e87 has seven test files,
  and 54 is exactly the static count of `it(` declarations. The runtime count there is 62, because
  persistence.test.ts has two `it.each` blocks expanding to eight more cases than are written. The
  same +8 gap holds today: 71 declarations, 79 cases. Someone counted declarations and wrote it down
  as a run.
The plan now separates "accurate when recorded, now stale" from "wrong when recorded".

### My omission, found by a lane and fixed
`gh` was not in the lane allow list, so docs-truth could not read the tracker and correctly REFUSED
to invent the #18-#24 mapping, labelling it unverified instead. Read-only `gh issue view`,
`gh issue list`, `gh pr view` and `gh pr diff` are now in config `allowed`. Write verbs stay out.

### Director decisions taken this pass
- "in general want to build from main" - recorded on #11, which is now split: the repo half (declare
  `branch: main` in render.yaml) is a lane, dispatched below; the Render-side blueprint re-sync and
  the spend review are his, tomorrow. I flagged that autoDeployTrigger: checksPass + main makes the
  beta URL a live mirror of main rather than a published snapshot.
- "just me testing/developing now so all good" - he accepts that consequence. No external testers,
  so a merge that redeploys is fine.

### Launched - concurrency raised from 3 to 4
Four non-colliding lanes from 1fbc197:
- zustand-probe   -> #19, MEASURE ONLY, edits nothing. Its answer decides how #18 (p0) is fixed, so
                     it runs first by the unblocks-the-most rule.
- routine-writers -> #24, src/store/useAppStore.ts routine-level mutations
- quarantine-blame-> #20, src/store/persistence.ts
- render-branch   -> #11 repo half, render.yaml only, explicitly forbidden from touching Render
maxConcurrentLanes raised to 4 because the fourth lane edits one YAML key and the four file groups
are disjoint. Revert to 3 if a pass ever has to serialise.

Held for next: #18 (blocked on #19's finding by its own acceptance text), #5 (widened, waits for
quarantine-blame to clear persistence.ts), #4 (same file group), then product #13, #14, #12.

### Not yet verified - unchanged
#15 is open. No physical-device smoke has ever been run on this project. Every native claim stays
labelled unverified. The Render blueprint still builds from codex/r1-data-safety until the director
re-syncs it.

### Last successful machine contact
2026-09-12 01:19Z, bridge job zr-lanes-6, exit 0.


---

## Pass 5 - 2026-09-12 00:20-00:40Z

### Landed - two PRs, each gated by me on its own merged tree

| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #28 | #20 | beb716d | ci 0, tsc 0, **88 tests**, web 0 | f445724 |
| #29 | #11 repo half | 5c4ec54 | ci 0, tsc 0, **88 tests**, web 0, diff is one added line | 44a8916 |

Suite: 86 at 1fbc197 -> 88 at beb716d. Both gated pushes clean, both remote refs read back matching.

### Closed without code: #19, and it changes #18
zustand-probe returned **CONFIRMED**. A pre-v4 device CAN lose a quarantined record entirely.
Observed AsyncStorage order on a version-3 blob:
  READ storage -> WRITE storage [stripped] -> READ quarantine -> WRITE quarantine
Control on a version-4 blob: READ, READ, WRITE quarantine - no app-blob write at all. The exposure
is specific to zustand's migrate path (middleware.mjs:390-421: setItem() is RETURNED into the
rehydrate chain, and line 405 short-circuits when versions match). The merge path is already safe.
Failure case demonstrated, not inferred: with the side-car write rejecting, appHoldsCorrupt=false
AND sidecarPresent=false - gone from both keys, only a console.warn, hydration still reports ready.
Recommended fix, now on #18: make the persist `migrate` option async and await the side-car append
inside it, before returning clean state. Closes the window by construction.

### THE CORRECTION THAT WOULD HAVE COST US A FAKE TEST
The probe's FIRST attempt used `endTime < startTime` and quarantined NOTHING.
`parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)` means repairLegacyValues is TRUE on a
pre-v4 blob, so that malformation is REPAIRED, not quarantined. **Any regression test written with
endTime < startTime against a v3 envelope passes vacuously.** Use invalid `source`, a non-string
`id`, an unparseable date, or a non-object row. Posted on #18 and #19 and written into the #5 brief.

### Lane corrections to MY briefs this pass - both accepted
- quarantine-blame: my brief said the non-empty-quarantine case was untested. IT IS TESTED
  (tests/store/persistence.test.ts:194, from PR #17). What was untested is the UNRELATED dangling
  pointer. And implementing my acceptance criterion literally - an id-set membership test - WOULD
  HAVE BROKEN that existing test, because a record whose id is the corrupted field is quarantined
  as id: null and can never match. Hence the two-armed rule. My brief's line numbers were stale too.
- render-branch: Render's spec says an omitted `branch` uses the repo's DEFAULT branch, which is
  already main. So render.yaml was NEVER what pinned the beta to codex/r1-data-safety - that is a
  Render-side stored setting overriding the documented default. The commit records intent and
  changes nothing about what is deployed. I had assumed the file was the pin. IT WAS NOT.

### A guard rail of mine that fought a lane
The deny list is built as `Bash(*<entry>*)` and one entry was `render`. That matched the worktree's
own path, so `git -C C:/CoworkBridge/lanes/render-branch ...` and even `git add render.yaml` were
auto-denied. Three denied calls before the lane diagnosed it - and it REPORTED it rather than
absorbing it. Narrowed to `render deploy`, `render service`, `renderctl`.
RULE: a substring deny entry that can appear in a path is a trap. Deny the command, not the word.

### In flight at the end of this pass
- routine-writers (#24) - FINISHED, result event present, NOT yet landed. Next pass lands it.
- linkage-quarantine (#5, widened) - dispatched, src/store/persistence.ts
- notice-scope (#21) - dispatched, App.tsx

#18 (p0) is unblocked by #19 but COLLIDES with routine-writers on src/store/useAppStore.ts.
Dispatch it the moment routine-writers lands, and not before.

### Not yet verified - unchanged
#15 is open. No physical-device smoke has ever been run. The Render blueprint still serves
codex/r1-data-safety until the director re-syncs it; PR #29 did not and could not move it.

### Last successful machine contact
2026-09-12 00:37Z, bridge job zr-lanes-7, exit 0.


---

## Pass 6 - 2026-09-12 00:40-01:05Z

### Landed
| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #30 | #24 | 41c01b0 | ci 0, tsc 0, **98 tests**, web 0 | aa81342 |

Suite: 88 at 885015d -> 98 at 41c01b0. Gated push clean, remote ref read back matching.

### The routine-writers lane did more than it was asked and was right about all of it
It produced the exhaustive audit the issue asked for - FIFTEEN writers of routine.updatedAt or
routine.blocks, each with a verdict - and found three broken, not the two I named.

TWO CORRECTIONS TO MY BRIEF, both accepted:
- I said `duplicateRoutine` was correct and needed only coverage. WRONG. The copy sets
  `updatedAt: now`, so any activity type the SOURCE never stamped falls onto that fresh timestamp
  and the copy is BORN with zero evidence for an identical schedule. Fourth instance of the class.
- A third writer exists that I could not name: `deleteGoal` (useAppStore.ts:535) rewrites
  routine.blocks clearing goalId - a CAPACITY_RELEVANT field - and stamps nothing.

The generalisation the plan was missing, now written into REVIVAL_PLAN.md: **any writer that bumps
routine.updatedAt must also seed capacityChangedAt, or the bump resets every un-seeded activity
type.** That is the rule; the individual bugs were instances of it.

### The lane refused to make a product decision, correctly
`deleteGoal` is the opposite polarity to #7: it never bumps updatedAt so it cannot collapse
confidence - it silently UNDER-reports a real capacity change. Competing goals keep citing evidence
gathered under a schedule that no longer exists. Whether deleting a goal should reset its
competitors' evidence is a product call, so the lane left it and documented it rather than patching
it silently. Filed as **#31** for the director with three options and a recommendation (partial:
stamp only when the deleted goal actually held dedicated capacity).

### Judgement beyond the brief that I accepted
`updateRoutine` now excludes `isActive` as well as `capacityChangedAt`. Not what I asked for, and
right: `isActive` has a companion in `activeRoutineId`, which is what `useActiveRoutine` actually
resolves and which only `setActiveRoutine` maintains, so `updateRoutine(id, {isActive: true})` would
have left the two disagreeing about which routine a forecast reads. An UPDATABLE_ROUTINE_FIELDS
allow list closes the plain-JS route, and two deliberate @ts-expect-error directives make the type
itself the test - they fail typecheck if it ever loosens.

### Product judgement now embedded in the code, and worth revisiting
Activation stamps only the activity types whose schedule genuinely differs from the routine going
out. Consequence: a Vacation Mode round trip WILL reset confidence for the types Vacation schedules
differently. Defensible - evidence gathered on holiday was not gathered under the work schedule -
but arguable. Isolated in `activationCapacityChanges`; reversing it is one function.

### Honest scope limit the lane volunteered
Two of the three fixes are store-API-only: `updateRoutine` and `duplicateRoutine` have ZERO call
sites in the app today. Only `setActiveRoutine` is reachable (DebugPanel `__DEV__`, and
RoutineScreen:166), and its production path is benign under the fix because the routine it activates
is brand-new and empty.

### In flight at the end of this pass
- sidecar-durability (#18, THE LAST p0) - dispatched with #19's confirmed evidence, the recommended
  async-migrate fix, and the vacuous-test trap written into the brief
- linkage-quarantine (#5) - running
- notice-scope (#21) - FINISHED, result event present, NOT yet landed. Next pass lands it.

Next after those: #4 (waits for linkage-quarantine to clear persistence.ts), then product #13, #14,
#12. #31 and #15 are the director's.

### Not yet verified - unchanged
#15 open. No physical-device smoke has ever been run. Render still serves codex/r1-data-safety.

### Last successful machine contact
2026-09-12 01:06Z, bridge job zr-merge-rw, exit 0.


---

## Pass 7 - 2026-09-12 01:05-01:35Z

### Landed - two PRs. #18 was THE LAST p0.

| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #32 | #18 (p0) | fcde340 | ci 0, tsc 0, **103 tests**, web 0 | 1c4c66d |
| #33 | #21 | 88bf24b | ci 0, tsc 0, **109 tests**, web 0 | 6acc9ae |

Suite: 98 at 5d53b22 -> 103 at fcde340 -> 109 at 88bf24b. All measured by me on the merged tree.

### THE GATED PUSH EARNED ITS KEEP
`lane-push.ps1` REFUSED to push linkage-quarantine: a real content conflict in
tests/store/hydrationAndBackup.test.ts, because sidecar-durability had landed in the same file
minutes earlier. Three conflict regions, both lanes appending independent describe blocks. Left the
merge in progress in the worktree and pushed nothing. Exactly the behaviour the script exists for.

Resolution: RE-DISPATCHED THE LANE to resolve its own conflict rather than resolving it myself.
The author owns the resolution; the orchestrator lands it. The second-dispatch brief tells it not to
redo the fix, to treat the regions as a probable UNION but verify that per region, not to edit the
other lane's work, and - the part that matters - to check its own `quarantineStartIndex`
append-only assumption against PR #32, which made migrate async and the side-car idempotent. If that
assumption broke, that is a finding, not a conflict.

### #18: the lane chose against my recommended option, and was right
I listed "clean the blob" first. It took the idempotent side-car instead, and said why in the code:
**a fix that only works when the cleanup write lands does not cover its own worst case, which is
precisely a device that cannot write.** It also verified zustand's source itself rather than trusting
#19's reading of it. Control A reproduced the loss verbatim (`expected 3 to be less than 1` - side-car
write at 3, blob write at 1); control B reproduced the rotation (20 copies, original gone).

NEW BEHAVIOUR, flagged not buried: on the migrate path an unwritable side-car now makes the app
REFUSE TO OPEN (retryable) rather than open having destroyed the record. Silent data loss is worse
than a retryable failure, so I agree - but a user with a full disk now sees something new, and that
path has never met real storage.

### #21: two corrections, the second more useful than the fix
- The side-car is NOT write-only in code - readQuarantineArchive() and a tested parseQuarantineArchive
  already exist. What is missing is anything that SURFACES them. MY BRIEF WAS WRONG, and it makes a
  viewer far cheaper than I implied.
- There is no way to render a React Native component in this suite, and getting one means adding a
  devDependency, which means regenerating the TRACKED lockfile - forbidden. The lane covered what it
  could without a renderer and stated plainly what that does not prove. It did not skip the coverage
  and it did not quietly break the rule.
Costing delivered instead of a guess: viewing ~half a day, no new dependencies. Restoring is a
different feature - the reason a record was quarantined has not changed, so re-inserting it just gets
it quarantined again; "restore" really means "repair", a write path into user data.

### Filed for the director - the decision queue is now the real backlog
- #31 should deleting a goal reset its competitors' forecast evidence
- #34 what happens when a SKELETON record (activity type, goal, routine) is unreadable. Two live
  brick routes remain, named and pinned by a test rather than left latent. Also carries the owed
  correction of the `realistically unreachable` comment at persistence.ts:63-66.
- #35 should goal progress be reconciled when a tracking entry is quarantined
These three plus #6's unlinked-entry rule are the same question from four sides: what happens to
derived numbers when the records under them change. Worth answering together.

### Backlog state - the bug queue is nearly drained
Open: 10. Five are needs-decision/needs-kostas (#11, #15, #31, #34, #35). Three are product-sized
(#12, #13, #14). #5 is in flight resolving its conflict. **#4 is the last schedulable bug** and it
waits for #5 to clear src/store/persistence.ts.

When #5 and #4 are in, there is nothing left that is not either the director's decision or a
product-sized feature. THE LOOP SHOULD STOP THERE rather than start a large feature unattended:
write the handover, stretch the cadence, and say plainly that the next move is his to pick.

### Last successful machine contact
2026-09-12 01:10Z, bridge job zr-merge-ns, exit 0.


---

## Pass 8 - 2026-09-12 01:15-01:40Z

### Landed
| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #36 | #5 | fb0130a | ci 0, tsc 0, **117 tests**, web 0 | 9fcca7b |

Suite: 109 at 6acc9ae -> 111 at the lane's resolved tree -> 117 on the merged tree after sync.

### The conflict resolution worked, and it proved itself
Re-dispatched to its own author rather than resolved by me. Findings:
- `persistence.ts` had NO conflict. PR #32 was confined to useAppStore.ts, so this lane's work
  carried across byte-identical. The conflict was purely two top-level describe blocks appended at
  the same offset, with git folding two shared context lines into the hunk.
- The append-only assumption behind `quarantineStartIndex` SURVIVED #32, which was the question I
  sent it back with.
- THE CONTROL THAT MATTERS: disabling the goalId quarantine reds the CONFLICT-RESOLVED test itself.
  That is the proof a hand-resolved test-file merge did not quietly become vacuous - the specific
  risk of resolving conflicts in test files - and the lane went looking for it unprompted.

### Corrections to my brief, accepted
- Repairing by clearing the reference is STRUCTURALLY IMPOSSIBLE for `activityTypeId`: it is required
  on TrackingEntry, Goal and RoutineBlock, unlike goalId? and routineBlockId?. Nothing to clear it
  to. Quarantining IS the repair, at every version. MY ISSUE ASKED FOR SOMETHING THAT CANNOT EXIST.
- Every line number in my brief was stale; the checks had moved to :544-625. Read by symbol.
- The per-stage fix did NOT need useAppStore.ts, which I had assumed it might.
- The lane found a live second-order bug its own widened scope created: `entryIds` computed before
  the linkage phase would judge a pointer against the pre-linkage set and re-brick the launch for
  exactly the reason being fixed. Control C reds on it.

### Launched
open-timer-duration -> #4, THE LAST SCHEDULABLE BUG, from 9fcca7b. Sole lane; nothing else running.
Briefed with the six PRs that have reshaped this file tonight, told to read by symbol not line, told
to prefer reusing the quarantine sink over inventing a second path, and warned about the
repairLegacyValues trap - which matters more here than anywhere, because #4 is squarely on the
legacy path.

### STOPPING CONDITION - active from the next pass
When #4 lands, open work is: five director decisions (#11, #15, #31, #34, #35) and three
product-sized features (#12, #13, #14). NOTHING schedulable that is not one of those.
The next pass MUST: land #4, write HANDOVER-PROMPT.md from the skill's templates/handover.md, commit
it, STOP THE WAKE CHAIN (schedule nothing further), and tell Kostas the queue is drained and the next
move is his. Do not start a product feature unattended.

### The unobserved item that outranks the rest
PR #32 and PR #36 are two independent fixes to the same durability path, merged without either
author seeing the other's code. The suite says they compose. Whether they do on a REAL torn write -
the event both exist to survive - is unobserved and needs a device. This is the sharpest single item
behind #15 and belongs at the top of the handover.

### Last successful machine contact
2026-09-12 01:40Z, bridge job zr-merge-lq, exit 0.


---

## Pass 9 - 2026-09-12 01:45-02:05Z - FINAL PASS

### Landed - the last bug
| PR | issue | branch tip gated | my gate | merged main |
|---|---|---|---|---|
| #37 | #4 | e5ad0fa | ci 0, tsc 0, **129 tests**, web 0 | see below |

Suite: 117 at 6d4388b -> 129. Eleven PRs merged this run, 62 -> 129 tests.

### The final lane found the trap INSIDE the test my own brief told it to replace
`tests/store/persistence.test.ts:113` asserted `openB.endTime === openB.startTime` - but
`makeTrackingEntry`'s default `updatedAt` is 10:00 while that fixture sets `startTime: '11:00'`.
`updatedAt` precedes `startTime`, so there is no evidence, and the FIXED code closes that entry at
`startTime` too. The lane wrote the fix, ran the suite, got 117/117 green, and noticed the assertion
had never moved. **A lane that trusted that test would have shipped nothing and called it done.**
That is the second instance of the repairLegacyValues trap found tonight, and the more dangerous one:
the first cost a probe, this one would have cost a false fix.

### Two more corrections, accepted
- "Never at startTime" is NOT achievable and should not be: with `updatedAt` at or before
  `startTime` and nothing following, any later timestamp is INVENTED. Shipped the honest version -
  close at `startTime` but tag `evidence: 'none'` and report it, so an unevidenced zero is never
  indistinguishable from a discarded one. That is the real fix to the word "silently".
- MY BRIEF CONTRADICTED ITSELF: scope said persistence.ts + tests, deliverable 2 said surface repairs
  TO THE USER. A getter nothing renders is surfaced to a programmer. The lane took the deliverable,
  touched App.tsx and QuarantineNotice.tsx, and FLAGGED the expansion rather than burying it.
- On "reuse the quarantine sink": right about the plumbing, wrong about the array. A quarantined
  record is ABSENT and verbatim; a repaired one is PRESENT and altered. One shared array would have
  made the shipped notice false about every repaired entry. Separate `repairs` channel, own sentence.

### It answered the composition question and found a real gap -> #38
Read zustand's source rather than the comments. Order: migrate(:391) -> merge(:415) -> set(:419) ->
`if (migrated) setItem()`(:421). **#32's awaited side-car write protects MIGRATE-stage drops only.**
A record dropped by the MERGE stage during a migrate-path hydration is stripped from the blob at :421
while its side-car write happens later in initializeAppStore, where failure is SWALLOWED. The comment
justifying the swallow cites ":405 short-circuits when the version matches" - true of the pure merge
path, FALSE for merge-stage drops on the migrate path. That is the #19 window, still open on one
branch. Unreachable today ONLY because every lenient repair happens to emit strict-valid output, and
NOTHING ENFORCES OR TESTS THAT INVARIANT. The lane verified its own repair preserves it and left the
gap alone - a durability change to merged work is not a lane's call. Filed as #38.

### STOPPED
No lanes running. No worktrees. Nothing unpushed. Every agent/* branch merged and deleted.
Open work is five director decisions (#11, #15, #31, #34, #35) and three product-sized features
(#12, #13, #14), plus #38 which is small and schedulable. None started - a product feature must not
begin unattended.

HANDOVER-PROMPT.md written at the repo root. The wake chain is stopped; nothing further is scheduled.

Roughly USD 62 of lane time across fourteen dispatches. Nine lane corrections to my briefs were
accepted this run and every single one was right - the count is the point: a brief is a hypothesis,
and the lane holding the file is better placed to falsify it than the orchestrator who wrote it.

### Last successful machine contact
2026-09-12 02:05Z.


### CORRECTION - posted 2026-09-12 02:10Z, same pass

The first draft of HANDOVER-PROMPT.md said "Eleven PRs merged. Ten issues closed." **Both numbers
were wrong**, and they contradicted the fourteen-row table directly beneath them in the same file.

Re-counted from the API, not from memory:
- `gh pr list --state merged` -> 15, of which **#1 predates this run**, so **14 merged this run**:
  #2, #16, #17, #22, #25, #26, #27, #28, #29, #30, #32, #33, #36, #37.
- `gh issue list --state closed` -> **14, all of them this run**: #3, #4, #5, #6, #7, #8, #9, #10,
  #18, #19, #20, #21, #23, #24.

Corrected in the handover in place, with the correction visible in the file rather than the numbers
silently swapped. This is precisely the habit this run spent a whole lane (#10) correcting in
docs/REVIVAL_PLAN.md, and the orchestrator committed it in the last document it wrote. Recorded
because a tally nobody checks is how the original "11 tests" survived three SDK upgrades.

### Final gate, run on `main` itself rather than on a branch - 2026-09-12 02:09Z
npm ci exit 0 - typecheck exit 0 - **129 tests, 8 files** - build:web `Exported: dist`.
main = ed0c771. Local and remote refs read back equal.

### Loop stopped
No wake is scheduled. No lanes are running. `git worktree list` shows only the main checkout.
Open: #38 (small, schedulable), #11/#15/#31/#34/#35 (director), #12/#13/#14 (product-sized).



## Pass 10 - 2026-09-17 ~15:00-16:20 local - ITERATION 1 RESUMES

### Authority, restated
Director (Kostas, 17 Sep, in the Claude Code desktop session): approved `docs/ITERATION-1-GOAL.md`
("go for it"). That plan grants: merge green PRs to main without asking (= deploy), push lane
branches, close issues via PRs, commit the design doc. Runs Waves A-C, posting at each wave boundary
without stopping; stop only on its section 7 conditions. The previous agent's suggestion to stop at
Wave A was offered by the director as FYI; the director chose the goal plan.

### Transport change
The orchestrator now runs in Claude Code ON THE HOST (not Cowork + windows-bridge). Scripts are still
C:\CoworkBridge\scripts\*, invoked directly. `. C:\CoworkBridge\tools\env.ps1` is still required for
node/npm (node is NOT on the default PATH - measured). No python on the host (measured) -
lane-result.py cannot run; parse claude.out with grep/node instead.
Lane watcher: scratchpad watch-lanes.sh under the Monitor tool (emits on result event / DEADLINE /
PID gone without result), 30 min expiry, re-armed.
Browser verification: `.claude/launch.json` config `lane-dist` serves C:\CoworkBridge\lanes\_verify\dist
(copy a lane's dist there) via C:\CoworkBridge\tools\serve-dist.js on :8765. `.claude/` is in
.git/info/exclude.

### Config changes (tracked file, committed with this entry)
laneTimeoutMin 45 -> 75 (Iteration 1 lanes are UI features, larger than the bug lanes of passes 2-9).
allowed += grep, cat, head, tail, wc, git grep (read-only).

### Pre-flight - measured
identity: gh login RogueKostas, git email kostas@roguesun.com (matches config).
main @ 41a90cc: npm ci ok, typecheck exit 0, **129 tests / 8 files**, build:web `Exported: dist`.
Deploy https://zenroutine-web.onrender.com loads (in-app browser, 17 Sep ~15:55). At 800px the
onboarding renders all five slides squashed side by side - #40 confirmed live, and worse than the
review described (width maths wrong as well as scroll).
PR #65 (the goal plan) - CI green - merged, main = a831cb0.

### #59 - orchestrator-owned, in progress
The OneDrive `converted/images/pageNN_img1.png` set is the DRAWING LAYER ONLY (no typed text) and
nearly every page is FLIPPED VERTICALLY (measured by transcription agents on p03, p08-p21, p44-p64).
Replaced as a source: the original PDF renders correctly through the built-in WinRT
`Windows.Data.Pdf` API under Windows PowerShell 5.1 (scratchpad render-pdf.ps1) - no download,
typed text + annotations, correct orientation. 85 pages -> JPEG q80 1200px = 8.4 MB.
Four transcription subagents + one verification subagent on the full renders.

### Deviation from the plan, stated
Wave A batch 1 dispatched BEFORE #59 lands. None of the four touches design-derived behaviour (dialogs,
onboarding paging, timer seconds, calendar access); #59's own text scopes its precondition to the
re-alignment work (Wave B). Batch 2 and later briefs will cite DESIGN-2019.md.

### Launched - Wave A batch 1 (collision-sequenced)
| lane | issues | backend | owns |
|---|---|---|---|
| web-dialogs | #39 | claude | new Dialog + all Alert.alert sites (Settings, ActivityTypes, Routine, BlockEditor, TrackingControls, DebugPanel), App.tsx provider |
| first-run | #40, #62 | claude | OnboardingScreen, Home empty state, _addSampleData only |
| timer-units | #42, #41 | claude | ActiveTimer, QuickStart, time.ts (add only) |
| calendar-home | #47 | claude | AnalyticsScreen segmented view, CalendarScreen -> component, nav route removal |
All four showed an init event within a minute.

Held for batch 2, with reasons: #38 sidecar-merge (useAppStore.ts - first-run edits _addSampleData
there); #44 week-start (CalendarScreen - calendar-home moving it; Settings - web-dialogs in it);
#43+#46 goals-inputs; #45 time picker (BlockEditor - web-dialogs in it).
Reconciled in the calendar-home brief: #47 says "reachable without Analytics"; ITERATION-1-PLAN
(later, authoritative) says Analytics segmented view. Followed the plan.


## Pass 11 - 2026-09-17 ~16:10-16:40 local

### Landed - each gated by me on its own merged tree AND clicked through on its web build
| PR | lane | issues | tests after | browser evidence (localhost:8765 serving the merged-tree dist) |
|---|---|---|---|---|
| #66 | timer-units | #42, #41 | 137 | timer ticks 0:03 -> 0:07 -> 0:13, 1920 + 400 |
| #67 | calendar-home | #47 | 139 | Breakdown / Calendar segments, "Activity calendar", 400 + 1920 |
| #68 | web-dialogs | #39 | 158 | Privacy notify + Escape; Load Sample Data confirm -> Success; copy-day Replace confirm; Delete Block confirm renders ABOVE the editor sheet |
| #69 | first-run | #40, #62 | 172 | five distinct slides at 400; example data -> populated Home; Goals shows high/medium/low |
| #70 | (orchestrator) | #59 | - | DESIGN-2019.md + 85 page images; 12/12 review annotations grep-found; p65 eyeballed |
| #71 | goals-inputs | #43, #46 | 221 | chips 44px (were ~265); estimate echo 1h30 / 12 / abc; empty-Home offer seen |
| #72 | inline-pickers | #45 (half) | 261 | inline Start/End fields, no Select Time screen; 5pm -> 8h |
#45 left OPEN: its New Goal half belongs to Wave B (#50/#51); commented on the issue.

### Lane corrections to MY briefs - all accepted
- timer-units: the 0:00 freeze was a React bail-out (state never changed within a minute), not formatDuration.
- calendar-home: the "tracking calendar" shows the ROUTINE + predicted completions, never tracking entries (the 14 Sep review's D8 is wrong too). Titled "Activity calendar"; naming is a director call.
- web-dialogs: 25 sites not 23 (App.tsx); deleteActivityType never throws, so "Cannot Delete" was unreachable - now checked after the fact.
- first-run: the old sample data could never be confident (scheduleChangedAt = now) and could hide a real routine.
- goals-inputs: alignItems alone doesn't fix #43 - RNW gives every ScrollView flexGrow 1.
- inline-pickers: end < start is an OVERNIGHT block by design of the existing validation; not rejected.
- MY decision, stated on PR #71: a bare estimate number means HOURS (design pp. 57-58) over #46's "bare = minutes".

### Tooling learned this pass
- claude 2.1.274 writes the result event with "type":"result" NOT first -> watcher matched `^{"type":"result"` and
  reported timer-units as "exited without result". Fixed (grep total_cost_usd AND type result);
  C:\CoworkBridge\tools\lane-result.js parses JSON properly (python is absent). lane-status.ps1 NOT re-checked for this.
- C:\CoworkBridge\tools\lane-pr.ps1: PR body = <lane>-log/pr-head.md + lane result. Avoids PowerShell quote hell.
- `gh pr merge --delete-branch` also removes the local lane worktree.
- In-app browser screenshots/clicks time out when the Claude window is not drawn; find/form_input/javascript still work.
  Sheet slide-in animations never finish in that state.

### In flight
| lane | issues | owns |
|---|---|---|
| week-start | #44 | preferences.weekStartsOn + schema v5 migration, time.ts week helpers, Routine/Calendar/Analytics/Settings/Home week figures |
| forecast-engine | #52 part 1 | NEW src/core/engine/forecast.ts only (pure fill-forward; ignores goalId and priority) |

### Order from here
Wave A: #44 lands -> #38 sidecar-merge (persistence, after #44's migration) -> Wave A gate on the DEPLOYED build.
Wave B: #60 (after #44 + #38: touches persistence migration) -> #49 -> #50+#51 (one lane) ; #55 after forecast-engine
(Home needs "which goal is scheduled now", which is an allocation question). #48 folds into #60.
Deploy: live bundle now renders one onboarding slide at a time (#69 is live). Bundle hash check at the wave gate.


## Pass 12 - 2026-09-17 ~16:35-17:00 local - WAVE A GATE PASSED ON THE DEPLOYED BUILD

### Landed
| PR | what | tests | evidence |
|---|---|---|---|
| #73 | week-start (#44) | 283 | real v4 browser store migrated to v5 intact (5 goals / 45 entries / 31 blocks); Sunday choice persists across reload; calendar Mon-first |
| #74 | hotfix: #73's tests were host-TZ dependent | 283 | green under TZ=UTC, America/Los_Angeles, host |
| #75 | forecast-engine (#52 part 1) | 304 | no UI; gate run under host TZ AND TZ=UTC |

### MY ERROR, recorded as it happened
I merged #73 with CI RED: `gh pr checks` and `gh pr merge` were chained in one command and I did not read the
check output before the merge ran. main (eb3f205) was red for ~8 minutes; Render's checksPass held the deploy.
Cause: two new tests built Dates at module load, before the file's beforeAll set TZ=Europe/London; CI is UTC.
Corrected publicly on #73, fixed in #74, main green at 2266069.
RULE: never chain merge after checks. `gh pr checks <n> --watch`, READ it, then merge in a separate call.
RULE: every lane runs the suite once under TZ=UTC (added to _common-iter1.md).
Found in passing: under TZ=Pacific/Auckland 2 tests in tests/core/prediction.test.ts fail (pre-existing,
file unchanged since #6). Offered to the director as a separate task chip; not in this iteration's scope.

### Wave A exit criteria - DEPLOYED build (zenroutine-web.onrender.com, bundle contains #74; #75 still deploying),
### cleared storage, driven by in-page JS because screenshots time out while the app window is not drawn.
Measured widths: 1024 (the pane's desktop width - NOT 1920, which the pane could not emulate) and 400.
1. five distinct slides, in order - PASS @400 (Welcome / Set Meaningful Goals / Plan Your Week / Track Your Time /
   See Your Progress); @1024 paging reached the last slide (title read failed on my selector, not the app).
2. example data from first run - PASS @1024 and @400 (one tap -> Home with Today's Schedule + Active Goals).
3. Monday-first - PASS: Routine tabs Mon/Tue/Wed... ; Calendar headers Mon..Sun, first cell 31 Aug.
4. timer counts seconds - PASS: 0:02 -> 0:05 (@1024), 0:02 -> 0:04 (@400).
5. `45h / 80h`, no "min this week" - PASS both widths.
6. visible response to confirming actions - PASS: Privacy, Theme, Reset All Data, Load Sample Data, Replace existing
   blocks? all open the app dialog; dialog card is 368px wide at 400.
7. calendar findable - PASS: Analytics -> Calendar segment at y=70 (no scroll), "Activity calendar".
Wave A issues: #39 #40 #41 #42 #43 #44 #46 #47 #59 #62 closed. #45 half-done (New Goal half -> Wave B). #48 -> #60.
#38 deferred to the end of the persistence chain (#60 -> #49 -> #38), not user-visible.

### In flight
routine-types-only (#60+#48), day-ribbon (Wave C foundation; Home read-only integration only).


## Pass 13 - 2026-09-17 ~17:00-17:40 local - Wave B model changes landed; Wave B UI + Wave C in flight

### Landed (CI read green before every merge)
| PR | lane | issues | tests | evidence |
|---|---|---|---|---|
| #76 | routine-types-only | #60, #48 | 329 | real v5 browser store -> v6, 0 blocks with goalId, data intact; Block Editor "Goals for this activity type" + quick-add |
| #77 | day-ribbon | (Wave C foundation) | 357 | RENDERED (headless Edge): 1920 labels/ticks/now-marker; 500 stacked labels, thinned ticks |
| #78 | goal-order | #49 model half | 395 | real v6 store (priorities) -> v7 order exactly as derived; explainer + "Next in line" copy; no chips |
My merge fixes: #76 forecast.test.ts cast (goalId removed from type after #75 used it).

### Rendering: a way round the hidden-window problem
C:\CoworkBridge\tools\shot.ps1 = headless Edge (built in, no download) screenshot of the lane-dist server.
serve-dist.js now accepts POST /__seed (the app's localStorage as JSON, saved beside dist) and serves
/__seed.html?to=... which loads it and redirects. So: seed once from the in-app tab, then shots of a populated app.
LIMITS (measured): headless Edge lays out at >= ~500px even when --window-size=400 (a 400 shot is a cropped 500
layout); deep links (/Tabs/Goals) land on Home, so a shot is always Home. Use the in-app tab's DOM for other
screens. msedge returns before writing the file (script waits). PowerShell `$args` is automatic - renamed.

### Lane corrections accepted this pass
- routine-types-only: explainer described priority-weight sharing (prediction.ts still did); rewritten again by #78.
- day-ribbon: blocks have no names, so labels are type names (design open question §4.2); tick thinning is by
  ribbon width, not screen width.
- goal-order: priority changes never reset forecast confidence, so reorders don't either; global order confirmed
  against p60/p65-67.

### Config
laneTimeoutMin 75 -> 110 (UI-surface lanes are the largest of the iteration).

### In flight (4 lanes)
| lane | issues | owns |
|---|---|---|
| routine-surface | #63, #58 | RoutineScreen, components/routine (not blockGoals), ribbon extensions, pie |
| goals-list | #50, #51, #49 UI, #45 half | Goal type optional (schema 8), GoalsScreen rewrite, drag |
| home-today | #55, #56 | HomeScreen, new dayOverview selector |
| forecast-calendar | #52 part 2 | Analytics Calendar segment -> "Forecast" |
Persistence chain from here: goals-list (v8) -> tracking-states #54 -> sidecar #38. Then current-activity #53
(after #54). Then review readiness.

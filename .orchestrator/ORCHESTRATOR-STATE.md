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


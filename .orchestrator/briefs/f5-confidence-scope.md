# Lane: f5-confidence-scope — editing any routine block collapses every goal's forecast confidence (#7)

## Why

`src/core/engine/prediction.ts:71` compares each tracking entry against `routine.updatedAt` — the
**whole routine's** timestamp — rather than anything scoped to the activity type or block that
actually changed. In the store, `addRoutineBlock`, `updateRoutineBlock` and `deleteRoutineBlock`
(`src/store/useAppStore.ts:598,628,~648`) all stamp the entire routine's `updatedAt` on any block
mutation.

Failure scenario: a user has 60 distinct tracked days of "Reading" against a long-standing
dedicated block, correctly shown as high confidence. They nudge an unrelated "Exercise" block by
five minutes. Every one of those 60 days is now older than `routine.updatedAt`, evidence collapses
to zero, and the app reports *"low confidence — no completed tracking days since this routine
changed"*.

This fires constantly for any routine with more than one activity type, which is the normal case.

Found by independent adversarial review before PR #2 was merged. Severity P1, CONFIRMED. The line
numbers are from that review — verify them against the tree in front of you.

Why it matters more than it looks: `docs/PRODUCT.md` D5 is the director's decision that the
forecast shows an **exact date** with a visible strength-of-prediction signal, and that the date
becomes tappable to show its working (issue #12, a later lane). A confidence signal that resets
itself on every unrelated edit makes that whole feature untrustworthy.

Authorised by the director on 2026-09-11.

## Scope

- `src/core/engine/prediction.ts` — the evidence/confidence path.
- `src/store/useAppStore.ts` — **only** the routine-block mutations, if a finer-grained change
  timestamp is the right fix.
- `src/core/types/` — only if a new timestamp field is needed.
- `tests/core/prediction.test.ts` and, if a persisted shape changes, `tests/store/`.

**Do NOT touch** `stopTracking`, the hydration/merge path, or `src/store/persistence.ts` — lane
`f1-hydration` is working in those right now. **Do NOT** change `getForecastEvidence`'s
goal-vs-activity filtering: that is issue #6 (F4) and will be the next lane in this same file, so
leave it exactly as you found it and keep your diff narrow enough that it can follow cleanly.

If a persisted shape changes, `AGENTS.md` requires a backward-compatible migration and tests. A
routine that has no per-block timestamp yet must hydrate and behave sensibly — decide what its
evidence window is and write that decision down.

Do NOT publish, release, merge, push, or move shared pins. Forbidden here: `git push`, `gh auth`,
`git stash`, `--force`, `--skip-`, `npm publish`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. The orchestrator
lands this work.

## Read first

1. `AGENTS.md` — binding working agreement.
2. `src/core/engine/prediction.ts` in full. The model groups active goals by activity so capacity
   is not double-counted, keeps goal-linked blocks dedicated, shares only unlinked time, and
   allocates the shared pool by five priority weights. Understand that before changing anything.
3. `docs/REVIVAL_PLAN.md`, the R3 section — it states the intended confidence semantics:
   confidence describes **evidence quality, not probability**, and only positive completed
   tracking on distinct days counts.
4. `tests/core/prediction.test.ts` — the allocation arithmetic there was independently re-derived
   during review and is sound. Do not weaken it.

## Build

1. Invalidate evidence at the granularity that actually changed. Per-block or per-activity-type
   change timestamps are the obvious route; whichever you choose, only capacity that actually
   feeds a goal should reset that goal's evidence.
2. Keep the stated semantics intact: evidence is distinct days of positive completed tracking, and
   a schedule change that genuinely alters a goal's capacity **should** still reset it. The bug is
   the blast radius, not the mechanism.
3. Tests:
   - editing a block of a **different** activity type leaves the affected goal's confidence and
     evidence-day count unchanged;
   - changing the capacity that **does** feed a goal resets it;
   - a routine with no per-block timestamps (pre-migration data) behaves as documented.
4. **A negative control per instrument.** For each test, make it fail deliberately once, paste the
   RED output, restore, paste GREEN. A check that cannot go red is not a check. `MISSING` — no
   output — is its own outcome and it FAILS.
5. **Hazards, verify yourself rather than trusting this brief:**
   - `package-lock.json` is TRACKED — never regenerate. Confirm with
     `git ls-files --error-unmatch package-lock.json`.
   - `npm run verify` chains typecheck → test → build:web; run them individually.
   - A fresh worktree has no `node_modules`; `npm ci` first.
   - Expo SDK 57 / RN 0.86 / TypeScript 6 at `origin/main`. Do not upgrade anything.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0 — tail pasted, no new `any`/`@ts-ignore`/`@ts-nocheck`.
- [ ] `npm test` exit 0 — tail pasted. Was **62 tests** at `origin/main`; must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] Negative controls: RED then GREEN, both pasted.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, message stating what is NOT OBSERVED.

## Report

Say explicitly whether your change alters any persisted shape, and if so what the migration does
to existing data. Name anything that can only be confirmed on a device.

**Corrections to this brief are welcome and expected.** If the measurement disagrees with the
brief, follow the measurement and say so at the TOP of your report.

---

**RESUMING AN INTERRUPTED RUN.** Partial work from an earlier attempt is already present in this
worktree, **uncommitted**. Read it before you write anything. Keep what is right, but re-derive
every claim rather than inheriting it. If any of it is wrong, say so plainly and replace it —
inheriting a mistake silently is worse than restarting.

**What happened, and what changed:** your earlier run produced the implementation but every
acceptance gate came back `MISSING` because `npm`, `npx`, `node` and `git add`/`git commit` were
all refused — a non-interactive session has nobody to prompt, and the worktree's
`.claude/settings.local.json` carried only a deny list, never an allow list. You were right to
report it and right not to self-grant. **That has now been fixed by the orchestrator**: the
settings file in this worktree now allows `npm`, `npx`, `node`, `WebFetch`, `WebSearch` and the
read-only plus `add`/`commit` git verbs. The forbidden verbs — push, publish, force, auth, stash,
reset --hard — remain denied, and deny still takes precedence.

**So this run's job is the part that could not happen before:**

1. Read your own uncommitted work in this worktree and re-check it. The earlier run reported it as
   correct by inspection only; treat that as a hypothesis, not a result.
2. `npm ci` from the tracked lockfile — this worktree has no `node_modules`.
3. Run every acceptance gate, each in its own process, and paste the output.
4. Produce the negative controls you could not produce before: make each new test fail
   deliberately, paste RED, restore, paste GREEN.
5. Fix whatever the gates reveal. The earlier run named its own most likely breakages — start
   there, but do not trust that list to be complete.
6. **Commit** on this lane's branch, with a message stating what is NOT OBSERVED.

If a gate fails and you cannot fix it within scope, say which one failed and why. A failed gate
honestly reported is a result; a skipped gate is not.

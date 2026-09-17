# Lane: f1-hydration — stopTracking can persist an invalid entry and permanently brick hydration (#3)

## Why

`src/store/useAppStore.ts:766` (`stopTracking`) writes a tracking entry without validating
`endTime >= startTime`, unlike `addCompletedEntry` and `updateTrackingEntry`, which both call
`trackingEntryIsValid`.

If the device clock moves backwards between start and stop — NTP resync, a manual clock
correction, timezone/clock skew after reconnecting — the entry is persisted with
`endTime < startTime`.

On the next launch, `merge()` (`useAppStore.ts:1015-1021`) always re-runs
`migratePersistedState(persistedState, CURRENT_SCHEMA_VERSION)`. Because every save stamps the
current version (`useAppStore.ts:263,1011`), that is always the **strict** path, so
`parseTrackingEntry` (`src/store/persistence.ts:286-289`) throws
`Invalid tracking entry: endTime is before startTime` rather than repairing.

Hydration then fails permanently. "Try again" re-hits the same record. The only recovery the UI
offers (`App.tsx:79-123`, "Reset local data") wipes every goal, routine and tracking record on
the device.

Found by independent adversarial review before PR #2 was merged. Severity P1, CONFIRMED by code
trace. The line numbers above are from that review and are a starting point, not gospel — verify
them against the tree in front of you and say so if they have moved.

Authorised by the director on 2026-09-11: "you are authorised to do those merges and continue
the work", with the standing grant that lanes fix, the orchestrator lands.

The product context that makes this worth doing properly is in `docs/PRODUCT.md`: ZenRoutine is
offline-first and the user's tracking history is the only copy. Losing it is the worst thing this
app can do to someone.

## Scope

- `src/store/useAppStore.ts` — `stopTracking` and the hydration/merge path only.
- `src/store/persistence.ts` — the tracking-entry parse path only.
- `App.tsx` — only if the recovery UI needs to report what was quarantined.
- `tests/store/` — new and existing tests.

**Do NOT touch** `src/core/engine/prediction.ts` or `tests/core/prediction.test.ts` — lane
`f5-confidence-scope` is working in those files right now. Do not touch
`src/store/persistence.ts`'s **legacy migration block around lines 419-429** (open-timer
force-closing) or the **dangling-`activityTypeId` check around lines 342-352**: those are issues
#4 and #5 and will be separate lanes.

Do NOT publish, release, merge, push, or move shared pins. These are forbidden here:
`git push`, `gh auth`, `git stash`, `--force`, `--skip-`, `npm publish`, `git reset --hard`,
`npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command.
The orchestrator lands this work.

## Read first

1. `AGENTS.md` — the repository working agreement. It is binding, and it says persisted-shape
   changes require a backward-compatible migration and tests.
2. `src/store/persistence.ts` in full — particularly how the three linkage checks differ in
   whether they repair or throw. You need that contrast to make a consistent decision here.
3. `tests/store/hydrationAndBackup.test.ts` — the existing hydration contract you must not break.
4. `docs/PRODUCT.md` D6 — local data is the product promise until sync exists.

## Build

1. Validate in `stopTracking` on the same terms as its two siblings. **Decide and document in the
   code what happens to a backwards-clock session** — clamping to a zero-length entry, discarding
   it with a user-visible message, or storing it flagged. Any of those is defensible; silently
   persisting an invalid entry is not. Write the reasoning in a comment so the next reader does
   not have to re-derive it.
2. Make hydration survivable. A single unparseable tracking entry must not be able to block the
   whole store. Quarantine or drop the offending record, keep everything else, and surface what
   was dropped rather than losing it silently.
3. Regression tests for both paths:
   - a backwards-clock stop, asserting the new contract;
   - hydration of a store that **already contains** one corrupt entry — this is the state a
     device could be in right now, and it is the case that matters most.
4. **A negative control per instrument.** For each test you add, make it fail deliberately once
   (break the fix, or feed it a deliberately wrong input), paste the RED output, restore, paste
   the GREEN output. A check that cannot go red is not a check. `MISSING` — no output at all —
   is its own outcome and it FAILS.
5. **Hazards, which you must verify yourself rather than trusting this brief:**
   - `package-lock.json` is TRACKED. Never regenerate it. Confirm with
     `git ls-files --error-unmatch package-lock.json`.
   - `npm run verify` chains typecheck → test → build:web. Run the individual scripts so you can
     see which one failed; read `package.json` before running any aggregate.
   - A fresh worktree has **no** `node_modules`. Run `npm ci` first, from the tracked lockfile.
   - This project is Expo SDK 57 / React Native 0.86 / TypeScript 6 as of `origin/main`. Do not
     "upgrade" or "fix" dependencies.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0 — paste the tail. No new `any`, `@ts-ignore` or `@ts-nocheck`.
- [ ] `npm test` exit 0 — paste the tail. The suite was **62 tests** at `origin/main`; it must not
      go down.
- [ ] `npm run build:web` exit 0 — each gate in its own process.
- [ ] The negative controls: RED then GREEN, both pasted.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed on this lane's branch, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at — in particular, anything about this fix that can
only be confirmed on a physical device, since this project has never had a device smoke (#15).

**Corrections to this brief are welcome and expected.** If a measurement disagrees with the brief,
follow the measurement and say so at the TOP of your report. If the review's line numbers or its
reading of the merge path turn out to be wrong, that is a finding worth reporting, not an
embarrassment to hide.

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

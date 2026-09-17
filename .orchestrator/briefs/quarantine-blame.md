# Lane: quarantine-blame — the pointer-clear gate does not check the blame relationship (#20)

## Lanes running beside you — stay out of their files

- `routine-writers` is in `src/store/useAppStore.ts` on #24. **Do not touch that file** except where
  it is unavoidable to read it; if a change there turns out to be genuinely required, say so in your
  report and stop rather than editing it.
- `zustand-probe` is measuring on #19 and edits nothing.
- `render-branch` is in `render.yaml` on #11.

Your file is `src/store/persistence.ts` plus its tests. The quarantine mechanism you are refining
landed an hour ago in PR #17 — read it, and read the whole of `persistence.ts`, before writing.

Note that **#5 will widen this same area** to route linkage failures through the quarantine sink.
Keep your diff narrow enough that #5 can follow cleanly, and do not pre-empt it.

## Why

Found in the non-author review of PR #17 (F1). **P2, CONFIRMED.**

`src/store/persistence.ts:536-554` clears a dangling `currentTrackingEntryId` when
`currentTrackingEntryId !== null && quarantine.length > 0 && !entryIds.has(currentTrackingEntryId)`.

It never checks that the dangling id has anything to do with what was quarantined — only that
*something* was quarantined on this run.

Failure scenario: entries are `[E1]`, `E1` is closed, nothing is open. A different, unrelated entry
is malformed and gets quarantined. `currentTrackingEntryId` holds a stale value that never referred
to any real entry — from an unrelated bug, a bad manual edit, a partial write. Because something
else was quarantined, the pointer is silently nulled, the strict invariant at the end passes, and
hydration reports success while genuinely unrelated corruption is swallowed.

Before PR #17 this threw `Invalid currentTrackingEntryId` and surfaced the corruption.

The comment two lines above the condition says *"a dangling pointer with no bad record to blame is
real corruption and should still be loud."* That is the intent; the code does not implement it.
`tests/store/persistence.test.ts` covers only `quarantine.length === 0`, so the case is untested.

## Deliver

1. Gate the clear on the blame relationship — the dangling id must match a record that was actually
   quarantined — so an unrelated dangling pointer stays loud, as the comment already promises.
2. Tests for both: quarantined-entry-was-the-running-timer clears the pointer; quarantine happened
   but the pointer dangles for an unrelated reason still throws.

## Gates

`npm ci` from the tracked lock first, then `npm run typecheck`, `npm test`, `npm run build:web`,
each in its own process. A negative control per new test: RED before, GREEN after, both pasted.
Suite was **72** at the merge of PR #17; it must not go down.

## Do not

Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command. Do not regenerate `package-lock.json`.
Corrections to this issue are welcome and expected.

## Done means

The code does what its own comment says, and both branches are pinned by a test.


## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck -> test -> build:web. Run the individual scripts so you can see
  which one failed; read `package.json` before running any aggregate.
- A fresh worktree has **no** `node_modules`. `npm ci` first, from the tracked lock.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **86 tests at `1fbc197`**, measured by the orchestrator. Re-measure at your own tree
  and cite it; do not copy that number forward without running it.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] **A negative control per new test**: make it fail deliberately, paste RED, restore, paste
      GREEN. A check that cannot go red is not a check. `MISSING` — no output — is its own outcome
      and it FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed on this lane's branch, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at, especially anything only a device can settle —
**#15 is open: no physical-device smoke has ever been run on this project.**

**Corrections to this brief are welcome and expected.** If a measurement disagrees with the brief,
follow the measurement and say so at the TOP of your report. Three lanes have now corrected my
briefs and all three were right.

# Lane: sidecar-durability — the quarantine side-car can lose a record entirely (#18, p0)

## Lanes running beside you — stay out of their files

- `linkage-quarantine` is in `src/store/persistence.ts` on #5. **Do not touch that file.**
- `notice-scope` is in `App.tsx` on #21. **Do not touch that file.**

Your file is `src/store/useAppStore.ts` — specifically the persist wrapper and the side-car write —
plus its tests. Read PR #17 (which built the quarantine), #28 (the blame gate) and #30 (the routine
writers) before you start; all three are in this area.

## This issue grew after it was filed. Read #19's closing comment in full.

The issue body below describes the **generation rotation** defect. A measure-only lane (#19) then
CONFIRMED a second and worse one in the same mechanism. Both are in scope.

## Why

Found in the non-author review of PR #17 (F1). **P1, CONFIRMED.**

`merge()` in `src/store/useAppStore.ts` only calls in-memory `set()`; it never persists. The
quarantine path is therefore merge-only, and the branch's own test in
`tests/store/hydrationAndBackup.test.ts` pins this by asserting
`AsyncStorage.getItem(APP_STORAGE_KEY)` is byte-identical to the raw blob after a successful
quarantine-and-hydrate.

So the corrupt record stays on disk. Every cold start before some *other* store-mutating action
re-quarantines the identical record into a new generation via `appendQuarantineGeneration`
(`src/store/persistence.ts:126-137`). With `MAX_QUARANTINE_GENERATIONS = 20` and
`.slice(-MAX_QUARANTINE_GENERATIONS)`, the **oldest** generation is silently dropped once the cap is
exceeded.

Failure scenario: a user hits one quarantine event for record A. Later, record B goes bad and is
never cleaned from the blob. Twenty cold starts later — routine on mobile, where the OS kills
backgrounded apps, and likelier still for someone who mostly reads their stats without starting a
timer — generation 1 containing record A is gone, silently.

The comment at `persistence.ts:64-66` calls the cap "realistically unreachable". The test asserting
the blob is left unchanged is precisely what makes it reachable. That contradiction is the finding.

## Deliver

Pick one and say why in the code:

1. Persist the cleaned blob after a merge-only quarantine, so a record is set aside exactly once —
   but only after the side-car write has succeeded, never before (see #19), and without
   reintroducing the first-launch overwrite risk R1 was about.
2. Make the side-car idempotent: key generations by record identity or content hash so re-seeing the
   same bad record does not consume a generation.
3. Keep the cap but never let a full side-car silently discard; surface it.

Whichever is chosen, correct or remove the "realistically unreachable" comment — it is now known to
be wrong.

## Gates

`npm ci` from the tracked lock first (a fresh worktree has none), then `npm run typecheck`,
`npm test`, `npm run build:web`, each in its own process. A negative control per new test: RED
before, GREEN after, both pasted. Suite was **72** at the merge of PR #17; it must not go down.

## Do not

Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command. Do not regenerate `package-lock.json`.
Corrections to this issue are welcome and expected.

## Done means

Twenty cold starts with one uncleaned corrupt record cannot discard an unrelated earlier
generation — proven by a test that fails without the fix.


---

# The second defect, CONFIRMED by measurement on #19

On a **pre-v4 blob**, zustand's `persist` rewrites the app blob *before* the side-car append runs.
Observed AsyncStorage order, not inferred:

```
READ  zenroutine-storage
WRITE zenroutine-storage    [stripped]     <- the record is now in no durable location
READ  zenroutine-quarantine
WRITE zenroutine-quarantine [holds record]
```

Control on a current-version blob: `READ storage, READ quarantine, WRITE quarantine` — no app-blob
write at all. The exposure is specific to the migrate path; `merge` is already safe.

**Demonstrated failure, not hypothesised:** with the side-car write rejecting (disk full) on a v3
blob, `appHoldsCorrupt=false` and `sidecarPresent=false`. The record is gone from both keys, the only
trace is a `console.warn`, and hydration still reports `ready`. The kill-during-the-gap race is the
*less* likely path; the deterministic one is the write simply failing.

## The recommended fix — verify it before relying on it

**Make the persist option's `migrate` async and await the side-car append inside it, before returning
clean state.** `node_modules/zustand/esm/middleware.mjs:396-399` shows zustand awaits a returned
promise before reaching the `set` + `setItem` at :419-421, so this closes the window *by
construction* rather than narrowing it. It needs no change to `merge` and no change to
`migratePersistedState` itself — only the wrapper.

That is the #19 lane's reading of the installed source. **Read it yourself and confirm the ordering
before building on it.** If the source says something else, follow the source and say so at the top
of your report.

## A trap that will otherwise cost you a fake test

`parseTrackingEntry` is called as `parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)`, so on
a pre-v4 blob `repairLegacyValues` is **true** and a malformation like `endTime < startTime` is
*repaired*, not quarantined. **A regression test built on that malformation against a v3 envelope
passes vacuously.** Use one that throws regardless of leniency: an invalid `source`, a non-string
`id`, an unparseable date, or a non-object row. The #19 lane lost its first probe to exactly this.

## Residual to decide, and to state in your report either way

On the merge path the record still lives only in the app blob until `initializeAppStore` writes the
side-car. Nothing rewrites the blob in that span today — so it is safe **by accident, not by
ordering**, and any future write added to hydration reopens it. Address it or leave it, but say
which and why.

## Build hazards — verify each yourself

- `package-lock.json` is TRACKED. Never regenerate it.
- `npm run verify` chains typecheck -> test -> build:web. Run the scripts individually.
- A fresh worktree has no `node_modules`. `npm ci` first.
- Expo SDK 57 / RN 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **98 tests at the tip of PR #30**. Re-measure at your own tree and cite it.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, own process.
- [ ] **A negative control per new test**: RED before, GREEN after, both pasted. For the ordering
      fix specifically, the control that matters is a *failing side-car write on a pre-v4 blob* —
      show that the record survives with the fix and is lost without it.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at — **#15 is open: no physical-device smoke has ever
been run, and this is the hydration path, which is exactly where device-only behaviour lives.**

**Corrections to this brief are welcome and expected.** Follow the measurement over the brief and say
so at the TOP of your report. Seven lanes have now corrected my briefs and every one of them was
right.

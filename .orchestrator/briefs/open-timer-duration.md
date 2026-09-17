# Lane: open-timer-duration — legacy migration silently discards a second open timer's duration (#4)

**You are the last bug in this backlog.** Everything else open is either the director's decision or a
product-sized feature. No other lane is running; no file is off limits for collision reasons. Take
the time to do it properly rather than narrowly.

## Read first — this code has changed a great deal in the last three hours

Six PRs have landed in `src/store/persistence.ts` and `src/store/useAppStore.ts` since this issue was
written. Read them before you write anything, and **read by symbol, not by line number** — every
line reference in the issue body below is stale:

- **#17** built the quarantine sink: an unparseable tracking entry is set aside rather than aborting
  hydration, and is copied verbatim to a `zenroutine-quarantine` side-car.
- **#28** gated the pointer-clear on a blame relationship (`dropped.id === pointer || dropped.id === null`).
- **#32** made the persist `migrate` option **async** so the side-car write completes before zustand
  rewrites the app blob, and made the side-car **idempotent** (deduped by content fingerprint).
- **#36** routed stale linkage references through the same sink, and scoped the blame gate per stage
  with `quarantineStartIndex`.

The mechanism you need almost certainly already exists. **Prefer reusing the quarantine sink over
inventing a second path.**

## A trap that has already cost one lane a wasted probe

`parseTrackingEntry` is called as `parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)`, so on
a **pre-v4 blob `repairLegacyValues` is `true`** and malformations like `endTime < startTime` are
*repaired*, not quarantined. This issue is squarely on the legacy path, so it matters here more than
anywhere: **a test built on that malformation against a v3 envelope passes vacuously.** Use a
malformation that throws regardless of leniency — an invalid `source`, a non-string `id`, an
unparseable date, a non-object row — or assert on the repair itself rather than on quarantining.

## Why
`src/store/persistence.ts:419-429`: when migrating schema < 4 data containing more than one tracking entry with `endTime === undefined`, the non-selected open entries are force-closed with `endTime = startTime`, discarding their real elapsed duration with no warning to the user.

This is currently codified as intended behaviour — `tests/store/persistence.test.ts:93-114` asserts `openB.endTime === openB.startTime`.

Found by independent adversarial review before PR #2 was merged. Severity P1, CONFIRMED.

## Deliver
1. Decide the correct behaviour and state it in the code: the most defensible option is to close the entry at the last moment there is evidence for (for example the entry's own last-updated timestamp, or the start of the next entry for the same activity), never at `startTime`, and to record that the entry was repaired.
2. Surface repaired entries to the user rather than mutating history silently.
3. Update `tests/store/persistence.test.ts` so it asserts the new contract, and add a test that the repair is reported.

## Gates
- `npm ci` from the tracked lockfile first — a fresh worktree has no dependencies.
- `npm run typecheck` — exit 0, no new `any`, `@ts-ignore` or `@ts-nocheck`.
- `npm test` — exit 0, and the suite count must not go down.
- `npm run build:web` — exit 0.
- Add a **negative control** for every new test: make it fail deliberately once, record that it went red, then restore it. A check that cannot go red is not a check.

## Do not
- Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build` or any Render command.
- Do not touch files outside the scope above — other lanes are working in this repo.
- Do not regenerate `package-lock.json`; it is tracked, reviewed truth.
- Corrections to this brief are welcome and expected. If the framing here is wrong, say so in your report.

## Report must include
Files or behaviours examined, command output as evidence, actionable findings, and a **Not done / unverified** section.

## Done means
No migration path can silently zero a duration the user actually worked, and the test suite asserts that rather than the old behaviour.


## Scope

`src/store/persistence.ts` and its tests. `src/store/useAppStore.ts` only if the fix genuinely needs
it — say so in your report if it does.

Do NOT publish, release, merge, push, or move shared pins. Forbidden: `git push`, `gh auth`,
`git stash`, `--force`, `--skip-`, `npm publish`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build`, `eas submit`, `npx expo login`, `render deploy`. The orchestrator lands
this work.

## Build hazards — verify each yourself

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck -> test -> build:web. Run the scripts individually.
- A fresh worktree has **no** `node_modules`. `npm ci` first.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **117 tests at the tip of PR #36**. Re-measure at your own tree and cite it; do not
  copy that number forward without running it.
- `git checkout -- <path>` is denied in a lane worktree. Revert a negative control with its exact
  inverse edit and prove the restore with an empty `git diff`.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, own process.
- [ ] **A negative control per new test**: RED before, GREEN after, both pasted. The one that matters
      here: with the fix disabled, the second open timer's duration is destroyed — show that.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, with a message stating what is NOT OBSERVED.

## Report

**#15 is open: no physical-device smoke has ever been run on this project**, and this is the
hydration path. Say what only a device can settle.

One more thing worth your attention if you have room: two independent durability fixes (#32's write
ordering and #36's linkage quarantining) were merged without either author seeing the other's code.
The suite says they compose. If, while you are in this file, you see a way they do not, that is worth
more than this issue is.

**Corrections to this brief are welcome and expected.** Every lane in this run has corrected its
brief and every one of them was right. Follow the measurement and say so at the TOP of your report.

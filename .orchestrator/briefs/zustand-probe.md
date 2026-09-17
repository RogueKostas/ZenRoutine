# Lane: zustand-probe — MEASURE ONLY: can a pre-v4 blob lose a quarantined record? (#19)

## THIS LANE DOES NOT FIX ANYTHING

You are a measurement instrument. **Do not modify any source file, do not commit, do not push.**
If you find yourself editing the repository, you have misread this brief. `NOT OBSERVED` is an
acceptable and useful outcome.

Your answer decides how **#18** — an open p0 — is fixed, so it is worth being exact about what you
did and did not establish.

## Lanes running beside you

`routine-writers` (#24) is in `src/store/useAppStore.ts` and `quarantine-blame` (#20) is in
`src/store/persistence.ts`. You may READ both files. You may not change them.

## Why

Found in the non-author review of PR #17 (F1). **P1, PLAUSIBLE — not traced. This issue is to
MEASURE, not to fix.**

`src/store/useAppStore.ts` wires the quarantine sink into both `migrate` and `merge`. Zustand's
`persist` middleware calls `migrate()` only when the on-disk `version` differs from
`options.version`, and — per its documented behaviour — writes the migrated state back to storage
*before* `rehydrate()`'s promise resolves. The quarantine side-car append happens later, in
`initializeAppStore`.

If that ordering is real, then on a device still holding a **pre-v4 blob** containing one
structurally malformed tracking entry:

1. `migrate()` quarantines the record and returns clean state.
2. Zustand immediately persists the clean, already-stripped blob.
3. The side-car append runs afterwards — and its failure path is only `console.warn`.

A failed side-car write, or the process being killed in the gap, loses the record from **both**
locations, permanently and silently. That is the one outcome the quarantine design exists to prevent.

## This is a measure-and-report task. Do not fix anything.

Determine, with evidence:

1. What `zustand@5.0.11`'s `persist` actually does. Read the installed
   `node_modules/zustand/esm/middleware.mjs` (or the CJS sibling) after `npm ci` — the source, not
   the documentation. Does a version mismatch trigger a `setItem` before `rehydrate()` resolves?
2. Whether the window is real in this app: write a pre-v4 blob containing a malformed tracking
   entry, hydrate, and observe the order of storage writes. Assert on the observed order rather than
   describing it.
3. If the window is real, how wide it is and what the cheapest correct ordering would be — the
   side-car write succeeding before anything rewrites the app blob is the obvious candidate.

`NOT OBSERVED` is an acceptable outcome. Say plainly what you could not determine.

## Do not

Do not modify source, do not commit, do not push. Report only. Label every piece of evidence with
the commit it came from.

## Done means

A written verdict on whether a pre-v4 device can lose a quarantined record entirely, with the
zustand source and an observed write order behind it, and a recommendation.


## Build hazards — verify yourself

- `npm ci` first from the tracked lock; a fresh worktree has no `node_modules`.
- `package-lock.json` is TRACKED. Never regenerate it.
- Network access may be restricted. If a fetch fails, report that it failed rather than treating
  silence as evidence.
- Read the INSTALLED `node_modules/zustand` source, not the documentation. The version is pinned in
  the lockfile; name it in your report.

## Done means

A written verdict on whether a pre-v4 device can lose a quarantined record entirely, with the
zustand source and an OBSERVED write order behind it, and a recommendation for #18. Label every
piece of evidence with the commit it came from. Include a **Not done / unverified** section.

**Corrections to this brief are welcome and expected.**

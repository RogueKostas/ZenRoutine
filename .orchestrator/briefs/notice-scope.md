# Lane: notice-scope — the quarantine notice is dismissed forever, and nobody can see what was set aside (#21)

## Lanes running beside you — stay out of their files

- `routine-writers` is in `src/store/useAppStore.ts` on #24. **Do not touch that file.**
- `linkage-quarantine` is in `src/store/persistence.ts` on #5. **Do not touch that file.**

Your files are `App.tsx` and its tests, plus any new component you need. If reading the store or the
side-car reader is unavoidable, read them — but do not edit either file. If the fix genuinely
requires a change in one of them, say so in your report and stop.

## Read first

1. `AGENTS.md` — the binding working agreement.
2. PR #17, which added the notice and the `zenroutine-quarantine` side-car.
3. `docs/PRODUCT.md` D6 — local data is the product promise until sync exists. That is the argument
   for making quarantined records visible rather than merely announced.

## On the product half

The issue asks whether quarantined records should be viewable and restorable. **You may not decide
that alone** — it is a product question and the director owns it. What you *can* do is make the case
concretely: implement the scoping fix and the test coverage, then in your report set out what a
viewer would cost and what it would look like, so the decision can be made on something real rather
than in the abstract. Do not build a restore path in this lane.

## Why

Found in the non-author review of PR #17 (F1). **P2, CONFIRMED.**

`App.tsx:56-60` and `App.tsx:143-145`: `quarantineDismissed` is a bare `useState(false)`, only ever
set to `true`, and never reset except by unmounting `AppContent`.

So if a user dismisses one quarantine notice and a later hydration in the same mounted instance —
a forced rehydrate, or `resetAppStoreAfterHydrationError` followed by another problem — quarantines a
**different** record, `showQuarantineNotice` stays `false` for the life of that component. The
side-car write still happens; the user is simply never told.

Related, and worth deciding at the same time: **the side-car is write-only.** Records are retained
under `zenroutine-quarantine` but nothing reads them back, so the notice can say records were set
aside and cannot show them. The lane that built it flagged this as needing a product decision.

## Deliver

1. Scope the dismissal to the quarantine event rather than the component instance, so a later,
   different event is reported.
2. Give the notice automated coverage. It currently has **none** — it is never rendered in any test;
   only typecheck and the web bundle touch it. Layout, the dismiss button and
   `accessibilityLiveRegion` are unverified anywhere. This was named as the weakest part of PR #17.
3. Product decision, to be answered before or alongside this: should quarantined records be
   viewable, and restorable, in the app? A notice the user cannot act on is close to no notice.
   `docs/PRODUCT.md` D6 says local data is the product promise until sync exists, which argues for
   viewable.

## Gates

`npm ci` from the tracked lock first, then `npm run typecheck`, `npm test`, `npm run build:web`,
each in its own process. A negative control per new test: RED before, GREEN after, both pasted.
Suite was **72** at the merge of PR #17; it must not go down.

## Do not

Do not push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command. Corrections to this issue are welcome and
expected.

## Done means

A second, different quarantine event reaches the user, and the notice is exercised by at least one
test rather than by nothing at all.


## Build hazards — verify each yourself, do not trust this brief

- `package-lock.json` is TRACKED. Never regenerate it. Confirm with
  `git ls-files --error-unmatch package-lock.json`.
- `npm run verify` chains typecheck -> test -> build:web. Run the individual scripts.
- A fresh worktree has **no** `node_modules`. `npm ci` first.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Do not upgrade anything.
- The suite is **88 tests at `44a8916`**, measured by the orchestrator. Re-measure at your own tree
  and cite it; do not copy that number forward without running it.

## Acceptance — all of these, or say which failed and why

- [ ] `npm ci` from the tracked lock first.
- [ ] `npm run typecheck` exit 0, tail pasted, no new `any` / `@ts-ignore` / `@ts-nocheck`.
- [ ] `npm test` exit 0, tail pasted. The suite must not go down.
- [ ] `npm run build:web` exit 0, in its own process.
- [ ] **A negative control per new test**: make it fail deliberately, paste RED, restore, paste
      GREEN. `MISSING` — no output — is its own outcome and it FAILS.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines.
- [ ] Committed, with a message stating what is NOT OBSERVED.

## Report

State plainly what a human still has to look at, especially anything only a device can settle —
**#15 is open: no physical-device smoke has ever been run on this project.**

**Corrections to this brief are welcome and expected.** Follow the measurement over the brief and say
so at the TOP of your report. Six lanes have now corrected my briefs and all six were right.

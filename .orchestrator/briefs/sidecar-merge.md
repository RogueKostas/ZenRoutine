# Lane: sidecar-merge — make the "repairs are strict-valid" invariant tested, and stop swallowing the merge-stage side-car failure (#38)

Run `gh issue view 38` and read it **in full**. It is precise and it is the brief. Then read `.orchestrator/ORCHESTRATOR-STATE.md` from "Pass 9" to the end of Pass 9 for the history.

## Why, in one paragraph
zustand hydrates in the order migrate → merge → set → `if (migrated) setItem()` (read `node_modules/zustand/esm/middleware.mjs`; don't trust line numbers from the issue). PR #32 made the **migrate**-stage side-car write awaited, so a quarantined record is on disk before the app blob is rewritten. A record dropped by the **merge** stage during a migrate-path hydration has its side-car write later, in `initializeAppStore`, where a failure is **swallowed** with `console.warn`. The comment justifying that is only true on the pure merge path. Today the window is unreachable **only because every lenient repair happens to emit strict-valid output, and nothing tests that.**

## What changed since the issue was written — read this code first
- **The schema is now v9.** Since this issue was written it went v5 preferences (#73), v6 drop block goalId (#60), v7 goal order (#49), v8 optional goal type/estimate (#50), v9 tracking-entry pauses (#54). `STRICT_SCHEMA_VERSION` is still 4 and must stay there; read the comments on each gate constant. Re-read `src/store/persistence.ts` on your base before designing anything, and make sure your invariant test covers the new migration step too.
- `_addSampleData` now builds a whole state and `set`s it once (`src/store/sampleData.ts`, #69). That's not a hydration path, but check it doesn't bypass anything you rely on.
- `App.tsx` now uses the app dialog, not `Alert.alert` (#68).

## Deliver
1. **Make the invariant explicit and tested:** every lenient repair path emits output the strict pass accepts. Walk the repair branches (legacy open-timer repair from #4, `endTime < startTime` repair, and anything else `repairLegacyValues` enables) and assert strict acceptance of the result. Negative control: make one repair emit something strict rejects, and show the test go red.
2. **Then close the window or document it truthfully.** Prefer closing it: a merge-stage drop on the migrate path must reach the side-car before the app blob is rewritten, or hydration must report failure rather than success. If closing it needs a structural change you judge too risky, record in the comment exactly why swallowing is safe, citing the invariant test from (1) by name. A test must then fail if that reasoning stops holding.
3. **Correct the misleading comment** either way.
4. **Beware the trap recorded in Pass 9:** `parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)` means a pre-current blob is parsed *leniently*, so malformations are **repaired, not quarantined**. A test built on a repairable malformation against an old envelope passes vacuously. Use malformations that throw regardless of leniency, or assert on the repair itself.

## Scope
`src/store/persistence.ts`, `src/store/useAppStore.ts` (the hydration and `initializeAppStore` path only), and `tests/store/*`.

**Do NOT touch:** screens, components, `src/core/engine/*` (a `forecast-engine` lane is adding a file there), or `src/store/sampleData.ts`.

## Report extras
**#15 is open: no physical-device smoke has ever been run**, and this is the hydration path. Say what only a device (a real torn write, real AsyncStorage) can settle. There is no browser click-through for this lane; say so and explain how the orchestrator could observe the change, if at all.

---

## Standing rules for every Iteration 1 lane (read all of it)

**Context.** Iteration 1 re-converges this app on its 2019 design. Read `docs/ITERATION-1-PLAN.md` (the goal and the invariants) and the section of `docs/REVIEW-2026-09-14.md` your issue cites. `docs/DESIGN-2019.md` (on `main` since #70) is authoritative for anything user-visible; its page images are in `docs/design-2019/pNN.jpg` — Read the image when the text is ambiguous. **If your brief and the design disagree, stop and report — do not choose.**

**Other lanes are running in this repo right now.** Stay inside your Scope. If the fix genuinely needs a file outside it, make the smallest change possible and flag it at the TOP of your report.

**Web is the only surface anyone uses.** Every UI change must work on react-native-web at ~400px wide and at 1920px. `Alert.alert` is a no-op on web: never add a call to it. If `src/components/common/Dialog*` (or a similar cross-platform dialog from #39) exists on your base, use it.

**You have no browser.** The test stack is vitest in a Node environment with no React renderer (see `vitest.config.mts`, `tests/setup.ts`). So:
- put the behaviour you change into **pure, exported functions** (layout maths, formatting, state transitions, selectors) and unit-test those;
- do not add a rendering library or any other dependency — `package-lock.json` is tracked and a new dependency needs the director's approval. If you believe one is unavoidable, stop and say so;
- end your report with a **"Click-through for the orchestrator"** list: the exact steps and what should be seen on the web build. The orchestrator checks them in a real browser before merging, so be precise.

**Gates — each in its own process, tails pasted:**
1. `npm ci` from the tracked lock first (a fresh worktree has no `node_modules`).
2. `npm run typecheck` exit 0 — no new `any`, `@ts-ignore` or `@ts-nocheck`.
3. `npm test` exit 0 — re-measure the suite on your base before changing anything and cite it (it was 697 on `main` @ 62c522e, 17 Sep 18:52); it must not go down. **Also run it once with `TZ=UTC`** (CI is UTC; a host-timezone-dependent test turned `main` red on 17 Sep — never build `Date`s at module load in a file that sets `process.env.TZ` in `beforeAll`).
4. `npm run build:web` exit 0.
5. **A negative control per new test:** break the production code with an `Edit`, show the test RED, restore with the exact inverse `Edit`, show GREEN, and prove the restore with an empty `git diff` on that file. A test that cannot go red is not a test.
6. `git diff --name-status origin/main...HEAD` shows no `D` lines, unless your brief tells you to delete a file.

**Hazards — verify, do not trust:** `package-lock.json` is TRACKED (`git ls-files --error-unmatch package-lock.json`) — never regenerate it. `npm run verify` chains all three gates — run them separately. Expo SDK 57 / RN 0.86 / TS 6 — upgrade nothing. `git checkout -- <path>`, `git stash`, `sed` and `rm` may be refused in this worktree; use `Edit`/`Read`/`Grep`, and put scratch files under `node_modules/` (gitignored). Stored-shape changes need a migration and a test that loads a pre-change store.

**Forbidden:** `git push`, `gh auth`, `git stash`, `--force`, `--skip-*`, `npm publish`, `git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`, any Render command. Do not open PRs or merge — the orchestrator lands this work.

**Commit** on your branch with a message that names the issue(s) and states what is NOT OBSERVED.

**Report** (in this order): corrections to this brief (if any) · what changed, by file · gate evidence · negative controls · click-through for the orchestrator · not done / unverified.

**Corrections to this brief are welcome and expected.** Every lane in the previous run corrected its brief and every one was right. If a measurement disagrees with the brief, follow the measurement and say so at the TOP of your report.

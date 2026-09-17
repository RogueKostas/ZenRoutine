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

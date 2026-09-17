# Lane: f6-hermes-probe — MEASURE ONLY: is the deleted babel.config.js a native startup crash? (#8)

## THIS LANE DOES NOT FIX ANYTHING

You are a measurement instrument. Produce a verdict with evidence behind it. **Do not modify any
source file, do not re-add any config, do not commit, do not push.** If you find yourself editing
the repository, you have misread this brief.

`NOT OBSERVED` is an acceptable and useful outcome. So is "I could not determine this without a
device" — say so plainly rather than guessing.

## Why

The Expo SDK 54 → 57 upgrade (merged as PR #2) deleted `babel.config.js`. That file carried
`babel-preset-expo` with `unstable_transformImportMeta: true`, and a comment stating that SDK 54
otherwise leaves `import.meta` in Zustand's ESM middleware bundle. `babel-preset-expo` was also
dropped from devDependencies, and no `babel.config.js` or `metro.config.js` replaces it anywhere
in the repository.

The app uses `zustand/middleware` (`persist`, `createJSONStorage`) in `src/store/useAppStore.ts`
— exactly the module that comment names. If the underlying issue is not handled by default on SDK
57, the Hermes bundle hits an untranspiled `import.meta` the moment the store module loads: a
startup crash on device, not a cosmetic problem.

What is already measured, by the orchestrator, on `origin/main`:

- `npm run build:web` exit 0, 703 modules, 1.2 MB bundle. **Web is fine.**
- Native is **unverified**, and has been for the entire life of this project (#15). This host has
  no device and no emulator.

Severity P1, PLAUSIBLE. Found by independent adversarial review.

## What to determine

1. What the Expo SDK 55, 56 and 57 release notes and the `babel-preset-expo` changelog say about
   `unstable_transformImportMeta` — when it appeared, what its default became, and whether it was
   folded into the preset's default behaviour.
2. What Zustand currently ships in the module `src/store/useAppStore.ts` imports. Read the actual
   published files in `node_modules/zustand` after `npm ci`, not the documentation.
3. **Whether a built native-target bundle still contains `import.meta`.** Inspect a bundle you
   produced. Do not reason from the docs alone — this is the whole point of the lane.
   `npx expo export --platform android` (or `ios`) produces a Hermes-targeted JS bundle without
   needing a device; if that fails in this environment, say exactly how it failed.
4. Whether anything else in the repository depended on the deleted Babel config.

## Scope

Read anything. Run read-only and build commands. Write nothing into the repository except files
under the lane's own log directory if you need scratch space.

Forbidden: `git push`, `gh auth`, `git stash`, `--force`, `--skip-`, `npm publish`,
`git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`,
any Render command.

## Hazards, verify yourself

- A fresh worktree has no `node_modules`; `npm ci` first, from the tracked lock.
- `package-lock.json` is TRACKED. Never regenerate it.
- `npx expo export` writes to `dist/`, which is gitignored — check with
  `git check-ignore -v dist` rather than assuming.
- Network access may be restricted. If a fetch fails, report that it failed rather than treating
  silence as evidence.

## Done means

A written verdict ending in one of:

- **restore the Babel config** — with the evidence that `import.meta` survives into the native
  bundle, quoted from a bundle you inspected; or
- **genuinely unnecessary on SDK 57** — with the evidence that the preset now handles it, from
  both the changelog and a bundle you inspected; or
- **undetermined without a device** — naming precisely what you could not do and what would
  settle it.

Label every piece of evidence with the **commit** it was produced from. Include a
**Not done / unverified** section. Do not commit anything.

**Corrections to this brief are welcome and expected.**

---

## SECOND DISPATCH — the block you hit has been removed

Your first run returned **UNDETERMINED**, correctly, and identified the cause precisely: not a
missing device, but a missing permission. `npm ci`, `npx expo export`, `WebFetch` and `WebSearch`
were all refused, so items 1, 2 and 3 could not be attempted.

**That is fixed.** This worktree's `.claude/settings.local.json` now allows `npm`, `npx`, `node`,
`WebFetch` and `WebSearch`. Push, publish, force, auth, stash and `reset --hard` remain denied.

Your three corrections to the brief are accepted and carried forward — state them again in this
run's report so they are not lost:

1. `babel-preset-expo` is **not** absent from the tree: `expo@57.0.19` declares
   `babel-preset-expo ~57.0.10` as a direct dependency (`package-lock.json:2923-2926,3731`). Only
   the project config file and the explicit `unstable_transformImportMeta: true` are gone. The real
   question is narrower than the brief stated: does the preset apply without a `babel.config.js`,
   and is the transform on by default in 57.0.10?
2. The file was deleted at the **SDK 56** step (`4a10b53`), not SDK 57.
3. Its own comment named **SDK 54/55**, not SDK 54.

Also carried forward, and still true: `docs/REVIVAL_PLAN.md:153` asserts the workaround was
"obsolete" with no cited evidence. That assertion is the claim under test.

**Now run the measurement:**

```
npm ci
npx expo export --platform android
```

then search the emitted bundle under `dist/` for `import.meta`. Check `git check-ignore -v dist`
first — you could not run it last time. If the android export is unavailable in this environment,
say exactly how it failed and try `--platform ios`; if neither works, a Metro bundle for a native
platform by any means is acceptable, so long as you name the command that produced it.

Still: **modify nothing, commit nothing.** Verdict plus evidence only, labelled with the commit it
came from.

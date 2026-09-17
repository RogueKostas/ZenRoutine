# Lane: docs-truth - the revival plan is stale, and the product decisions are not in it (#10)

## Why
`docs/REVIVAL_PLAN.md` records "all 11 core/store tests" in its SDK 55, 56 and 57 evidence sections. Measured at merge time on the branch tip: **7 files, 62 tests**. An inherited number repeated as fact is exactly the failure mode the working agreement warns about.

Separately, `docs/PRODUCT.md` now records the director's answers to the five product questions the plan was waiting on (D1–D8). The plan still presents them as open.

## Deliver
1. Correct every stale test count, naming the tip the new count was measured at. Do not delete the old claim — state what replaced it.
2. Mark the five product questions answered and link `docs/PRODUCT.md`.
3. Reflect the decisions in the milestones: R2 gains the two tracking modes and the weekly-review ritual, R3 gains the tappable forecast breakdown, R5 stops being conditional because accounts and sync are now planned work.
4. Add the F1–F7 findings to the plan's assessment section so the next reader does not rediscover them.

## Do not
Do not touch source or tests. Documentation only. Do not push or open a PR.

## Done means
No number in the plan is unbacked by a run it names, and a cold reader can see which product questions are closed.


## Corrected and expanded since the issue was filed

The issue says "says 11 tests, the suite is 62". **Both numbers are now stale.** Measured by the
orchestrator on the host:

| Commit | Suite |
|---|---|
| `261c592` (merge of the R1-R3 branch) | 62 |
| `370fcac` (merge of PR #17, issue #3) | 72 |
| `f9081c3` (merge of PR #22, issue #7) | **79** |

Re-measure at the tree you are working on and cite that commit. Do not copy any number from this
brief without re-running the suite - an inherited number repeated as fact is the exact habit this
issue exists to correct.

Also fold in, with citations:

1. **#8 is closed as NOT A DEFECT.** `docs/REVIVAL_PLAN.md:153` asserts the Babel/`import.meta`
   workaround was "obsolete" with no evidence. That assertion turns out to be **correct**, for a
   reason it does not state: `babel-preset-expo` **56.0.0** (2026-05-05) - "BREAKING: Enable
   `import.meta` transform by default and rename option to `transformImportMeta`" - made the
   transform default-on in the same SDK step that deleted the config file. Add that citation so the
   claim stops reading as unsupported. Full evidence is in the closing comment on issue #8.
2. **The findings F1-F7 and the follow-ups #18-#24**, into the assessment section, so the next
   reader does not rediscover them.
3. **`docs/PRODUCT.md` D1-D8** - mark the five product questions answered, link the file, and
   reflect the decisions in the milestones: R2 gains the two tracking modes and the weekly-review
   ritual, R3 gains the tappable forecast breakdown, R5 stops being conditional because accounts
   and sync are now planned work.
4. **The R1-R3 evidence sections now describe merged work**, not an unmerged branch. `main` is where
   this lives; the Render blueprint still points at `codex/r1-data-safety`, which is issue #11 and
   is the director's call, not yours - record it as open, do not change anything on Render.

## Scope

`docs/REVIVAL_PLAN.md` and `README.md` only. Documentation. **Touch no source file and no test.**

Other lanes are live in `src/core/engine/prediction.ts` (#6) and `src/store/useAppStore.ts` (#23).
Stay out of both.

Do NOT push, open a PR, merge, or run `gh auth`, `git stash`, `git reset --hard`, `npm audit fix`,
`expo prebuild`, `eas build` or any Render command.

## Acceptance

- [ ] `npm ci`, then `npm test`, so the number you write down is one you measured. Paste the tail
      and name the commit it was measured at.
- [ ] `npm run typecheck` and `npm run build:web` exit 0 - you changed no source, so these must be
      unchanged; if either fails, something else is wrong and you should say so rather than fix it.
- [ ] Every number in the files you touch is either backed by a run you cite or explicitly labelled
      unverified.
- [ ] No prior claim is deleted. State what replaced it and why - the plan is a record, not a
      snapshot.
- [ ] `git diff --name-status origin/main...HEAD` shows no `D` lines and no source files.
- [ ] Committed, message stating what is NOT OBSERVED.

## Report

List every number you changed, with the command and commit behind each. Name anything you found that
looks wrong but was outside your scope.

**Corrections to this brief are welcome and expected.**

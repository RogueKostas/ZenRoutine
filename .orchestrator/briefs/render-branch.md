# Lane: render-branch — declare `branch: main` in render.yaml (#11, director decision)

## Why

The director decided on 2026-09-11: *"in general want to build from main"*.

`render.yaml` declares no `branch` for the `zenroutine-web` static site, so the Render blueprint
still follows `codex/r1-data-safety` — the branch it was created from, which was merged into `main`
as PR #2 and is no longer where work happens. The public beta at https://zenroutine-web.onrender.com
is therefore serving a tree that is missing every fix landed since: #3, #7, #6, #23 and the docs
work.

Your job is the **repository half only**: state the intent declaratively, so the branch is in
version control rather than only in a dashboard setting.

## Deliver

1. Add `branch: main` to the `zenroutine-web` service in `render.yaml`. **Check Render's Blueprint
   specification for the correct key and placement before writing it** — do not guess from the
   surrounding YAML. If the key is named differently or belongs at another level, follow the
   specification and say so in your report.
2. Note in your report that `autoDeployTrigger: checksPass` combined with `main` means every merge
   redeploys the beta once CI passes. The director has confirmed he is the only tester right now
   and is content with that. Do not change `autoDeployTrigger`.
3. Nothing else. This is a one-key change.

## Scope and absolute limits

`render.yaml` only.

**You must not touch anything on Render itself.** No API calls, no CLI, no dashboard, no
authentication, nothing. `render` is on the forbidden-command list and the deny list enforces it.
Applying this change on Render is the director's action, tomorrow, and it is not yours to take or
to prepare. A `render.yaml` change alone does not move a service that was created against another
branch — say so plainly in your report so nobody assumes the deployment moved when it did not.

Also forbidden: `git push`, `gh auth`, `git stash`, `--force`, `--skip-`, `npm publish`,
`git reset --hard`, `npm audit fix`, `expo prebuild`, `eas build`, `eas submit`, `npx expo login`.
The orchestrator lands this work.

Other lanes are live in `src/store/persistence.ts` (#20), `src/store/useAppStore.ts` (#24) and a
read-only probe (#19). Stay out of all of them.

## Acceptance

- [ ] `npm ci`, then `npm run typecheck`, `npm test`, `npm run build:web` — you changed no source,
      so all must be unchanged. The suite is **86 at `1fbc197`**; re-measure and cite your own tree.
      If any gate fails, something else is wrong: say so rather than fixing it.
- [ ] The YAML still parses. Prove it with a command, not by eye.
- [ ] `git diff --name-status origin/main...HEAD` shows exactly one `M` line and no `D` lines.
- [ ] Committed, with a message stating that the Render-side blueprint re-sync has NOT been done and
      is the director's action.

**Corrections to this brief are welcome and expected.** If Render's specification says something
different from what I have written above, follow the specification.

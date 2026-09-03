# ZenRoutine repository guidance

## Product intent

ZenRoutine is an offline-first Expo application for planning a weekly routine, tracking actual time, and forecasting progress toward goals. Preserve that simple core loop unless an approved product decision changes it.

## Architecture

- Keep domain types and calculations in src/core/ free of React and React Native dependencies.
- Keep persisted application state and schema migrations in src/store/.
- Keep screens focused on composition; extract reusable behavior or UI from screens that continue to grow.
- Treat on-device storage as user data. Changes to persisted shapes require a backward-compatible migration and tests.
- Prefer platform-neutral implementations. Record and verify intentional iOS, Android, and web differences.

## Working agreement

- Read docs/REVIVAL_PLAN.md before beginning roadmap or multi-step revival work.
- Use the repository $revival-loop skill for upgrades, feature slices, and other multi-step work.
- For nontrivial tasks with independent investigation or review lanes, use bounded Codex subagents as described by $revival-loop; keep overlapping edits serialized through the main agent.
- Make resumable work cold-startable with a short task contract: Why, Deliver, Gates, Do not, and Done means.
- Use the smallest useful coordination tier. Prove the environment and instructions with one bounded canary before adding more agents.
- Require agent reports to name examined files or behaviors, give command or observation evidence, list actionable findings, and include a Not done/unverified section.
- Keep scheduled or heartbeat passes idempotent: inspect current state first, avoid duplicating finished work, and remain quiet when nothing actionable changed. A schedule never grants permission for external mutations.
- Inspect the current git status before editing and preserve unrelated user changes.
- Do not commit, push, open a pull request, deploy, or create external services unless the user asks.

## Setup and checks

- Use Node.js 22.13 or newer and npm.
- Install exactly from the lockfile with npm ci.
- Run npm run typecheck for every TypeScript change.
- Run npm run build:web when changing navigation, screens, shared UI, Expo configuration, or dependencies.
- Run npm run verify before calling a code-changing milestone complete.
- Run `npm test` for the automated core/store suite. Explicitly report device behaviors that remain manually unverified.

## Quality boundaries

- Keep TypeScript strict. Avoid new any, @ts-ignore, and @ts-nocheck escapes.
- Add regression coverage for fixes in the core engine, store actions, persistence migrations, and date/time behavior.
- Do not apply forced dependency upgrades. Upgrade Expo one SDK release at a time and verify each step.
- Never expose secrets in source, logs, screenshots, or committed environment files.

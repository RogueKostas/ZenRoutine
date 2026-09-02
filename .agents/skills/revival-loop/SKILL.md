---
name: revival-loop
description: Run a bounded, resumable implementation-review-verification loop for ZenRoutine milestones. Use for multi-step revival work, feature slices, upgrades, or backlog execution; do not use for a one-line edit or a read-only question.
---

# Revival Loop

Move one approved ZenRoutine milestone from a clear outcome to verified completion while keeping the main agent focused on decisions and integration.

## Start from durable context

1. Read AGENTS.md and docs/REVIVAL_PLAN.md.
2. Inspect current code and git state. Treat code and test results as authoritative when documentation is stale.
3. Select one ready milestone or the user-named slice. Do not silently start later milestones.
4. State the outcome, constraints, and observable acceptance checks before editing.

If the requested outcome is still ambiguous, resolve the smallest product decision needed before implementation. Do not turn an unclear product idea into a large speculative build.

## Orchestrate deliberately

When the task contains at least two independent, useful investigations, delegate up to three bounded subagents. Prefer subagents for repository mapping, test/log analysis, dependency research, and post-change review.

- Give each subagent a distinct question, scope, and expected evidence.
- Keep requirements, trade-offs, and final integration in the main thread.
- Use one writer for overlapping files. Parallel code edits are allowed only for disjoint file sets with explicit ownership.
- Require summaries and actionable findings, not raw command logs.
- Verify subagent conclusions against the shared working tree before relying on them.

Small or tightly coupled tasks stay single-agent.

## Run the loop

Repeat this cycle for the selected milestone:

1. **Orient:** Recheck the current diff, relevant code, and acceptance checks.
2. **Implement:** Make the smallest coherent change that advances the outcome.
3. **Verify:** Run the narrowest relevant check, then the repository gate from AGENTS.md before declaring completion.
4. **Review:** Inspect the diff for correctness, data migration risk, cross-platform behavior, accessibility, and accidental scope growth. For material changes, delegate an independent read-only review when a subagent is available.
5. **Correct:** Fix supported findings and rerun affected checks.
6. **Record:** Update docs/REVIVAL_PLAN.md only when status, evidence, or a decision has genuinely changed.

Continue until the acceptance checks pass, a decision or permission is required, or the same blocker survives three well-founded attempts. Do not repeat a failing action without changing the hypothesis or method.

For work that spans many turns, recommend or use Codex Goal mode with the milestone outcome as the completion criterion. A goal preserves persistence; this skill supplies the engineering loop.

## Guardrails

- Preserve user changes and unrelated dirty-worktree edits.
- Do not commit, push, merge, publish, create external resources, or broaden permissions unless the user requested that action.
- Do not use npm audit fix --force or perform a major Expo upgrade as a side effect of unrelated work.
- Keep persisted Zustand data backward-compatible or add an explicit schema migration.
- Do not add a backend until an approved requirement needs accounts, sync, collaboration, or server-owned data.
- Report blockers with evidence, the attempted alternatives, and the smallest decision needed to resume.

## Completion report

Lead with the outcome. Include changed files, verification performed, remaining risks, and the next ready milestone. Distinguish passing automated checks from untested device behavior.

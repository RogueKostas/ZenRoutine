# ZenRoutine

## Product direction — read before changing behaviour

This app is a build of a 2019 design document. When a brief and the design
disagree, stop and say so rather than choosing.

- `docs/ITERATION-1-PLAN.md` — the current goal, its waves, and what is out of scope
- `docs/REVIEW-2026-09-14.md` — the 14 Sep review: what drifted, and the evidence
- `docs/review-2026-09-14-transcript.txt` — the full timestamped transcript
- `docs/DESIGN-2019.md` — the design itself, once #59 lands. Until then the design
  lives only in `Zen Routine-1.pdf` and its handwritten annotations are NOT in any
  extracted text you may find. Treat any spec that lacks them as incomplete.

Settled decisions: the routine is made of activity types only (no `RoutineBlock.goalId`);
goal priority is list order, not an enum; the bottom tab bar stays while screen content
becomes faithful to the design.


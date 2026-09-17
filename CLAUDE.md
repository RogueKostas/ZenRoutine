# ZenRoutine

## Product direction — read before changing behaviour

This app is a build of a 2019 design document. When a brief and the design
disagree, stop and say so rather than choosing.

- `docs/ITERATION-1-PLAN.md` — the current goal, its waves, and what is out of scope
- `docs/REVIEW-2026-09-14.md` — the 14 Sep review: what drifted, and the evidence
- `docs/review-2026-09-14-transcript.txt` — the full timestamped transcript
- `docs/DESIGN-2019.md` — **the design itself, authoritative for user-visible behaviour.**
  Every handwritten annotation is transcribed verbatim with its page; the page images are in
  `docs/design-2019/`. Look at the page image when a description is ambiguous. The PDF's
  extracted text layer and `claude_code_package/ZEN_ROUTINE_SPEC.md` omit every annotation —
  never use them as a spec.

Settled decisions: the routine is made of activity types only (no `RoutineBlock.goalId`);
goal priority is list order, not an enum; the bottom tab bar stays while screen content
becomes faithful to the design.


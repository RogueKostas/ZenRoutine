# ZenRoutine product decisions

Last reviewed: 2026-09-11
Decided by: Kostas Zarifis (director). Recorded by the orchestration loop.

These answer the five open product questions in `docs/REVIVAL_PLAN.md`. Where a decision
changes a milestone, the milestone follows this document.

## Product intent

ZenRoutine helps a person take control of their time by making the real numbers visible.

The core thesis: **people overestimate how much time they have, the way they underestimate
how much they eat.** The first time someone sees their actual week against their intended
week should be the same kind of eye-opener that a food diary is. The app's job is to deliver
that without shame, and then to help close the gap.

## The loop

The three user types in the original question are not alternatives — they are three stages of
one journey, and the app owns all three:

1. **Set** — declare goals, with the user's own estimate of the work involved.
2. **Plan** — build a weekly routine that can actually deliver those goals, and show when.
3. **Track and learn** — capture what actually happened and feed it back, so the plan and the
   forecast get more accurate over time.

The model is deliberately agile: estimate, measure velocity, re-plan. A routine is a sprint
plan; a weekly review is a retro; the forecast is a burndown.

## Decisions

### D1 — Audience: the full journey, not one persona

Serve goal-setting, routine planning and time metrics as one connected loop. Do not narrow
to a single persona; the connection between the three is the product.

### D2 — Motivation: intrinsic first, game layer second

The primary reward is achieving the goal. Streaks, quests and similar mechanics are
**deprioritised, not rejected** — they demonstrably work (Duolingo) and a lightweight layer
stays on the roadmap. Build the honest loop first; add the game layer where it reinforces
real behaviour rather than substituting for it.

### D3 — Two tracking modes, measured separately

| Mode | How | Data quality |
|---|---|---|
| **Realtime** | Pomodoro-style timer started at the moment | High |
| **Retroactive** | End-of-day "from memory" logging | Loose |

Both are first-class and **adherence is tracked separately for each**. The app should be able
to show the user that more disciplined tracking correlates with more goal completion — the
MyFitnessPal effect — while still treating loose logging as better than nothing.

**Open risk to test:** timers that announce "right, it's time now" may feel stressful or
guilt-inducing. That pressure is arguably the point, but it has to be tested rather than
assumed.

### D4 — The weekly review is a first-class ritual

- A notification invites a "review and re-adjust the week" session.
- **The review itself is timeboxed with a timer** so it cannot become perfectionist planning.
- The app proposes adjustments from observed data, not from nagging:
  *"You have not met your Tuesday fitness slot for three weeks. Shall we drop it?"*
- Framing matters: a removed slot is a realistic correction, not a personal failure, and the
  message should sit next to what the user **is** achieving.

### D5 — Forecast: exact dates, with the working shown

- Show a **specific date** ("17 Apr"), not a range. It is labelled as an estimate built from
  the user's own estimates; users understand that and still prefer a date.
- **The date is tappable.** The breakdown names what produced it:
  - how much comes from the original estimate,
  - how much from the actual completion trend,
  - how much from **drift** — scheduled hours versus hours actually done (5h planned and 5h
    done is zero drift).
- Each date carries a visible strength-of-prediction signal, so the user can tell a
  well-evidenced date from a guess.

### D6 — Accounts and multi-device from the start

Plan for authentication (including Google sign-in) and cross-device persistence now, not
later. Multi-device is needed for development and testing, never mind the product.

The offline-first guest core stays: the app must work signed out, and signing in must never
silently upload, replace or merge existing device data. The ownership, transfer and conflict
rules already written in `docs/CLOUD_BETA_TASK.md` stand.

### D7 — Monetisation: AI is the paid tier

Everything in the loop above is free. The paid subscription is **AI assistance** — suggestions
and re-planning driven by the user's own trends and goals. The app was designed before that
was possible; it is now the most valuable thing the data can buy.

### D8 — Web is a supported product surface

The Render web beta is a real surface users are pointed at, not only a development target.
It stays in the verification gate (`npm run build:web`) and in the beta test matrix.

## What this changes

- **R2** gains the two-mode tracking split and the weekly-review ritual.
- **R3** gains the tappable forecast breakdown (estimate / trend / drift) as an acceptance item.
- **R5** is no longer conditional — accounts and sync are planned work, not an option.
- A new workstream covers the AI suggestion layer and its subscription boundary.

## Still open

- Whether the timer's interruption feels motivating or stressful — needs beta evidence (D3).
- How much of the game layer to build, and when (D2).
- Which AI capabilities justify the subscription, and what runs on-device versus server-side (D7).

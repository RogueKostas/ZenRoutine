import type { Goal } from '../types';

/**
 * Goal priority is list order (#49): one list of goals of every activity type, top first.
 *
 * `Goal.order` is a dense integer, 0..n-1, and `AppState.goals` is kept sorted by it, so a goal's
 * `order` is also its array index. A dense integer was chosen over a fractional or lexicographic
 * rank: the list is tens of goals on one device with no concurrent writers (offline-first), so
 * renumbering on a move costs nothing, while fractional ranks buy only fewer rewrites and bring
 * precision exhaustion (floats) or unbounded key growth (strings) that would need rebalancing
 * anyway. Dense integers also make the invariant checkable: `goals[i].order === i`.
 *
 * The field exists as well as the array position so that order is a declared, validated part of
 * the stored shape and a backup, rather than a side effect any future `sort` could silently undo.
 */

/**
 * Where a moved goal lands, named by a neighbour rather than an index. A drag in a list filtered
 * to one activity type only knows the visible rows, and an index into the filtered list is not an
 * index into the whole list; "before/after this goal" means the same thing in both.
 */
export type GoalMoveTarget = { before: string } | { after: string };

/** Goals in list order. Stable: goals with the same `order` keep their relative array order. */
export function sortGoalsByOrder<G extends Pick<Goal, 'order'>>(goals: readonly G[]): G[] {
  return goals
    .map((goal, index) => ({ goal, index }))
    .sort((left, right) => left.goal.order - right.goal.order || left.index - right.index)
    .map(({ goal }) => goal);
}

/**
 * Number `goals` 0..n-1 in their current array order. A goal already at its index is returned as
 * the same object. Renumbering is not an edit to a goal, so `updatedAt` is left alone.
 */
export function renumberGoals<G extends Pick<Goal, 'order'>>(goals: readonly G[]): G[] {
  return goals.map((goal, index) => (goal.order === index ? goal : { ...goal, order: index }));
}

/** The order a goal added now takes: the bottom of the list (design p49–p57). */
export function nextGoalOrder(goals: readonly Pick<Goal, 'order'>[]): number {
  return goals.length;
}

/** Remove one goal; the rest keep their relative order and close the gap. */
export function removeGoalFromList<G extends Pick<Goal, 'id' | 'order'>>(
  goals: readonly G[],
  goalId: string
): G[] {
  return renumberGoals(goals.filter((goal) => goal.id !== goalId));
}

/**
 * Move `goalId` next to the target goal. `goals` must be in list order.
 *
 * Returns the input array itself when nothing moves: an unknown goal or target, a goal moved onto
 * itself, or a move to where it already is. Only the moved goal's `updatedAt` changes; the goals
 * it passes are renumbered, not edited.
 */
export function moveGoalInList<G extends Pick<Goal, 'id' | 'order' | 'updatedAt'>>(
  goals: readonly G[],
  goalId: string,
  target: GoalMoveTarget,
  now: string
): readonly G[] {
  const targetId = 'before' in target ? target.before : target.after;
  if (targetId === goalId) return goals;
  const moving = goals.find((goal) => goal.id === goalId);
  if (!moving) return goals;
  const rest = goals.filter((goal) => goal.id !== goalId);
  const targetIndex = rest.findIndex((goal) => goal.id === targetId);
  if (targetIndex < 0) return goals;

  const insertAt = 'before' in target ? targetIndex : targetIndex + 1;
  const reordered = [...rest.slice(0, insertAt), moving, ...rest.slice(insertAt)];
  if (reordered.every((goal, index) => goal === goals[index])) return goals;
  return renumberGoals(reordered).map((goal) =>
    goal.id === goalId ? { ...goal, updatedAt: now } : goal
  );
}

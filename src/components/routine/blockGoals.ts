import type { Goal } from '../../core/types';

/**
 * The estimate a goal quick-added from the Block Editor starts with (#48). The store has no default
 * of its own and `addGoal` refuses a goal without a positive estimate, so this is the 60 minutes
 * the brief allows until Wave B makes the estimate optional (#50). It can be changed on Goals.
 */
export const QUICK_ADD_GOAL_ESTIMATE_MINUTES = 60;

/**
 * The goals the Block Editor lists under "Goals for this activity type": the type's active goals,
 * in the order the Goals screen shows them (priority first, then list order). Read-only — a block
 * never names a goal (#60), so this is information about where the block's time goes, not a picker.
 */
export function activeGoalsForActivityType(
  goals: readonly Goal[],
  activityTypeId: string | null
): Goal[] {
  if (!activityTypeId) return [];
  return goals
    .filter((goal) => goal.activityTypeId === activityTypeId && goal.status === 'active')
    .sort((left, right) => left.priority - right.priority);
}

/** What the store's `addGoal` needs for a quick-added goal, or why there is nothing to add. */
export type QuickAddGoal =
  | {
      ok: true;
      goal: {
        name: string;
        description: string;
        estimatedMinutes: number;
        activityTypeId: string;
      };
    }
  | { ok: false; error: string };

/**
 * Turn the quick-add field into a new goal of the block's activity type: the name only, with the
 * default estimate. It deliberately carries nothing about the block, so adding a goal here can
 * never change the block being edited.
 */
export function quickAddGoal(name: string, activityTypeId: string | null): QuickAddGoal {
  const trimmed = name.trim();
  if (!activityTypeId) return { ok: false, error: 'Choose an activity type first.' };
  if (!trimmed) return { ok: false, error: 'Enter a name for the goal.' };
  return {
    ok: true,
    goal: {
      name: trimmed,
      description: '',
      estimatedMinutes: QUICK_ADD_GOAL_ESTIMATE_MINUTES,
      activityTypeId,
    },
  };
}

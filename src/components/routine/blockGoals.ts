import { sortGoalsByOrder } from '../../core/engine/goalOrder';
import type { Goal } from '../../core/types';

/**
 * The estimate a goal quick-added from the Block Editor starts with (#48). Since #50 the store
 * accepts a goal with no estimate, but one added here is added *to be scheduled* by this block's
 * type, so it keeps a real hour and gets a forecast straight away. It can be changed on Goals.
 */
export const QUICK_ADD_GOAL_ESTIMATE_MINUTES = 60;

/**
 * The goals the Block Editor lists under "Goals for this activity type": the type's active goals,
 * in list order (#49), which is the order the block's time goes to them. Read-only — a block
 * never names a goal (#60), so this is information about where the block's time goes, not a picker.
 * A goal with no type (#50) belongs to no block; one with no estimate is listed but takes no time.
 */
export function activeGoalsForActivityType(
  goals: readonly Goal[],
  activityTypeId: string | null
): Goal[] {
  if (!activityTypeId) return [];
  return sortGoalsByOrder(
    goals.filter((goal) => goal.activityTypeId === activityTypeId && goal.status === 'active')
  );
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

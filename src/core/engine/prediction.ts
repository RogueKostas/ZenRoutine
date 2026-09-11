import type { Goal, Routine, TrackingEntry } from '../types';
import {
  addDaysToDateKey,
  getRoutineBlockDurationMinutes,
  getTrackingEntryDurationMinutes,
  toLocalDateKey,
} from '../utils/time';

export interface PredictionResult {
  goalId: string;
  predictedCompletionDate: string | null;
  weeklyMinutesAllocated: number;
  activityWeeklyCapacity: number;
  dedicatedWeeklyMinutes: number;
  sharedWeeklyCapacity: number;
  otherLinkedWeeklyMinutes: number;
  allocationShare: number;
  competingGoalCount: number;
  remainingMinutes: number;
  weeksRemaining: number | null;
  confidenceLevel: 'low' | 'medium' | 'high';
  evidenceDays: number;
  confidenceReason: string;
}

interface ForecastEvidence {
  confidenceLevel: PredictionResult['confidenceLevel'];
  evidenceDays: number;
  confidenceReason: string;
}

interface PendingGoal {
  goal: Goal;
  remainingMinutes: number;
  weight: number;
}

/** Calculate the recurring weekly capacity for one activity type. */
export function getWeeklyMinutesForActivityType(
  routine: Routine,
  activityTypeId: string
): number {
  return routine.blocks
    .filter((block) => block.activityTypeId === activityTypeId)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
}

function priorityWeight(goal: Goal): number {
  return 6 - goal.priority;
}

function getForecastEvidence(
  trackingHistory: TrackingEntry[] | undefined,
  activityTypeId: string,
  weeklyCapacity: number,
  routineUpdatedAt: string
): ForecastEvidence {
  if (weeklyCapacity <= 0) {
    return {
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No routine time is available to this goal.',
    };
  }

  const evidenceDays = new Set(
    (trackingHistory ?? [])
      .filter((entry) =>
        entry.activityTypeId === activityTypeId &&
        Boolean(entry.endTime) &&
        Date.parse(entry.endTime!) >= Date.parse(routineUpdatedAt) &&
        getTrackingEntryDurationMinutes(entry) > 0
      )
      .map((entry) => entry.date)
  ).size;

  if (evidenceDays >= 14) {
    return {
      confidenceLevel: 'high',
      evidenceDays,
      confidenceReason: `Based on tracking across ${evidenceDays} distinct days.`,
    };
  }
  if (evidenceDays >= 7) {
    return {
      confidenceLevel: 'medium',
      evidenceDays,
      confidenceReason: `Based on tracking across ${evidenceDays} distinct days.`,
    };
  }
  return {
    confidenceLevel: 'low',
    evidenceDays,
    confidenceReason: evidenceDays === 0
      ? 'No completed tracking days since this routine changed.'
      : `Only ${evidenceDays} distinct tracking day${evidenceDays === 1 ? '' : 's'} since this routine changed.`,
  };
}

function dateAfterWeeks(weeks: number): string {
  return addDaysToDateKey(toLocalDateKey(), Math.ceil(weeks * 7));
}

/** Predict one goal in isolation. Product surfaces should use predictAllGoals. */
export function predictGoalCompletion(
  goal: Goal,
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult {
  const weeklyCapacity = getWeeklyMinutesForActivityType(routine, goal.activityTypeId);
  const dedicatedWeeklyMinutes = routine.blocks
    .filter((block) => block.activityTypeId === goal.activityTypeId && block.goalId === goal.id)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
  const sharedWeeklyCapacity = routine.blocks
    .filter((block) => block.activityTypeId === goal.activityTypeId && !block.goalId)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
  const availableWeeklyMinutes = dedicatedWeeklyMinutes + sharedWeeklyCapacity;
  const remainingMinutes = Math.max(0, goal.estimatedMinutes - goal.loggedMinutes);

  if (remainingMinutes === 0) {
    return {
      goalId: goal.id,
      predictedCompletionDate: toLocalDateKey(),
      weeklyMinutesAllocated: availableWeeklyMinutes,
      activityWeeklyCapacity: weeklyCapacity,
      dedicatedWeeklyMinutes,
      sharedWeeklyCapacity,
      otherLinkedWeeklyMinutes: Math.max(
        0,
        weeklyCapacity - dedicatedWeeklyMinutes - sharedWeeklyCapacity
      ),
      allocationShare: weeklyCapacity > 0 ? availableWeeklyMinutes / weeklyCapacity : 0,
      competingGoalCount: 0,
      remainingMinutes: 0,
      weeksRemaining: 0,
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'Already complete; no forecast is needed.',
    };
  }

  const evidence = getForecastEvidence(
    trackingHistory,
    goal.activityTypeId,
    availableWeeklyMinutes,
    routine.updatedAt
  );
  const weeksRemaining = availableWeeklyMinutes > 0
    ? remainingMinutes / availableWeeklyMinutes
    : null;
  return {
    goalId: goal.id,
    predictedCompletionDate: weeksRemaining === null ? null : dateAfterWeeks(weeksRemaining),
    weeklyMinutesAllocated: availableWeeklyMinutes,
    activityWeeklyCapacity: weeklyCapacity,
    dedicatedWeeklyMinutes,
    sharedWeeklyCapacity,
    otherLinkedWeeklyMinutes: Math.max(
      0,
      weeklyCapacity - dedicatedWeeklyMinutes - sharedWeeklyCapacity
    ),
    allocationShare: weeklyCapacity > 0 ? availableWeeklyMinutes / weeklyCapacity : 0,
    competingGoalCount: 0,
    remainingMinutes,
    weeksRemaining,
    ...evidence,
  };
}

function predictActivityGoals(
  goals: Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult[] {
  const activityTypeId = goals[0].activityTypeId;
  const weeklyCapacity = getWeeklyMinutesForActivityType(routine, activityTypeId);
  const sharedWeeklyCapacity = routine.blocks
    .filter((block) => block.activityTypeId === activityTypeId && !block.goalId)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
  const dedicatedByGoal = new Map(
    goals.map((goal) => [
      goal.id,
      routine.blocks
        .filter((block) => block.activityTypeId === activityTypeId && block.goalId === goal.id)
        .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0),
    ])
  );
  const availableWeeklyCapacity = sharedWeeklyCapacity +
    [...dedicatedByGoal.values()].reduce((sum, minutes) => sum + minutes, 0);
  const totalWeight = goals.reduce((sum, goal) => sum + priorityWeight(goal), 0);
  const initialAllocations = new Map(
    goals.map((goal) => [
      goal.id,
      (dedicatedByGoal.get(goal.id) ?? 0) + sharedWeeklyCapacity * priorityWeight(goal) / totalWeight,
    ])
  );

  if (availableWeeklyCapacity <= 0) {
    return goals.map((goal) => ({
      goalId: goal.id,
      predictedCompletionDate: null,
      weeklyMinutesAllocated: 0,
      activityWeeklyCapacity: weeklyCapacity,
      dedicatedWeeklyMinutes: 0,
      sharedWeeklyCapacity: 0,
      otherLinkedWeeklyMinutes: weeklyCapacity,
      allocationShare: 0,
      competingGoalCount: goals.length - 1,
      remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
      weeksRemaining: null,
      ...getForecastEvidence(trackingHistory, activityTypeId, 0, routine.updatedAt),
    }));
  }

  let elapsedWeeks = 0;
  let pending: PendingGoal[] = goals.map((goal) => ({
    goal,
    remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
    weight: priorityWeight(goal),
  }));
  const completionWeeks = new Map<string, number>();

  while (pending.length > 0) {
    const pendingWeight = pending.reduce((sum, item) => sum + item.weight, 0);
    const rates = new Map(pending.map((item) => [
      item.goal.id,
      (dedicatedByGoal.get(item.goal.id) ?? 0) +
        sharedWeeklyCapacity * item.weight / pendingWeight,
    ]));
    const completable = pending.filter((item) => (rates.get(item.goal.id) ?? 0) > 0);
    if (completable.length === 0) break;
    const phaseWeeks = Math.min(...completable.map((item) =>
      item.remainingMinutes / rates.get(item.goal.id)!
    ));
    elapsedWeeks += phaseWeeks;

    const nextPending: PendingGoal[] = [];
    for (const item of pending) {
      const rate = rates.get(item.goal.id) ?? 0;
      const remainingMinutes = Math.max(0, item.remainingMinutes - rate * phaseWeeks);
      if (remainingMinutes <= 1e-7) {
        completionWeeks.set(item.goal.id, elapsedWeeks);
      } else {
        nextPending.push({ ...item, remainingMinutes });
      }
    }
    pending = nextPending;
  }

  return goals.map((goal) => {
    const weeksRemaining = completionWeeks.get(goal.id) ?? null;
    const weeklyMinutesAllocated = initialAllocations.get(goal.id) ?? 0;
    const dedicatedWeeklyMinutes = dedicatedByGoal.get(goal.id) ?? 0;
    return {
      goalId: goal.id,
      predictedCompletionDate: weeksRemaining === null ? null : dateAfterWeeks(weeksRemaining),
      weeklyMinutesAllocated,
      activityWeeklyCapacity: weeklyCapacity,
      dedicatedWeeklyMinutes,
      sharedWeeklyCapacity,
      otherLinkedWeeklyMinutes: Math.max(
        0,
        weeklyCapacity - dedicatedWeeklyMinutes - sharedWeeklyCapacity
      ),
      allocationShare: weeklyCapacity > 0 ? weeklyMinutesAllocated / weeklyCapacity : 0,
      competingGoalCount: goals.length - 1,
      remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
      weeksRemaining,
      ...getForecastEvidence(
        trackingHistory,
        activityTypeId,
        weeklyMinutesAllocated,
        routine.updatedAt
      ),
    };
  });
}

/**
 * Forecast active goals with each activity's capacity shared by priority weight
 * (Very High 5 … Very Low 1) and reallocated as goals finish.
 */
export function predictAllGoals(
  goals: Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult[] {
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const byActivity = new Map<string, Goal[]>();
  for (const goal of activeGoals) {
    const group = byActivity.get(goal.activityTypeId) ?? [];
    group.push(goal);
    byActivity.set(goal.activityTypeId, group);
  }

  const predictionsByGoal = new Map<string, PredictionResult>();
  for (const activityGoals of byActivity.values()) {
    for (const prediction of predictActivityGoals(activityGoals, routine, trackingHistory)) {
      predictionsByGoal.set(prediction.goalId, prediction);
    }
  }
  return activeGoals.map((goal) => predictionsByGoal.get(goal.id)!);
}

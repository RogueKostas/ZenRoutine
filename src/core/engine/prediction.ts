import { Goal, Routine, TrackingEntry } from '../types';

export interface PredictionResult {
  goalId: string;
  predictedCompletionDate: string | null;
  weeklyMinutesAllocated: number;
  remainingMinutes: number;
  weeksRemaining: number | null;
  confidenceLevel: 'low' | 'medium' | 'high';
}

/**
 * Calculate weekly minutes allocated to an activity type in a routine
 */
export function getWeeklyMinutesForActivityType(
  routine: Routine,
  activityTypeId: string
): number {
  return routine.blocks
    .filter(block => block.activityTypeId === activityTypeId)
    .reduce((sum, block) => {
      const duration = block.endMinutes - block.startMinutes;
      const adjustedDuration = duration < 0 ? duration + 1440 : duration;
      return sum + adjustedDuration;
    }, 0);
}

/**
 * Predict when a goal will be completed based on routine allocation
 */
export function predictGoalCompletion(
  goal: Goal,
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult {
  const weeklyMinutes = getWeeklyMinutesForActivityType(routine, goal.activityTypeId);
  const remainingMinutes = goal.estimatedMinutes - goal.loggedMinutes;
  
  if (weeklyMinutes === 0 || remainingMinutes <= 0) {
    return {
      goalId: goal.id,
      predictedCompletionDate: remainingMinutes <= 0 ? new Date().toISOString().split('T')[0] : null,
      weeklyMinutesAllocated: weeklyMinutes,
      remainingMinutes: Math.max(0, remainingMinutes),
      weeksRemaining: remainingMinutes <= 0 ? 0 : null,
      confidenceLevel: 'low',
    };
  }
  
  const weeksRemaining = remainingMinutes / weeklyMinutes;
  const daysRemaining = Math.ceil(weeksRemaining * 7);
  
  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + daysRemaining);
  
  let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
  if (trackingHistory && trackingHistory.length > 0) {
    const relevantEntries = trackingHistory.filter(e => e.activityTypeId === goal.activityTypeId);
    if (relevantEntries.length >= 14) confidenceLevel = 'high';
    else if (relevantEntries.length >= 7) confidenceLevel = 'medium';
  }
  
  return {
    goalId: goal.id,
    predictedCompletionDate: completionDate.toISOString().split('T')[0],
    weeklyMinutesAllocated: weeklyMinutes,
    remainingMinutes,
    weeksRemaining,
    confidenceLevel,
  };
}

/**
 * Generate predictions for all active goals
 */
export function predictAllGoals(
  goals: Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult[] {
  return goals
    .filter(g => g.status === 'active')
    .map(goal => predictGoalCompletion(goal, routine, trackingHistory));
}

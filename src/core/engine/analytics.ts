import { Routine, TrackingEntry, ActivityType } from '../types';

export interface WeeklyBreakdown {
  activityTypeId: string;
  activityTypeName: string;
  color: string;
  plannedMinutes: number;
  actualMinutes: number;
  percentageOfWeek: number;
}

export interface WeeklyAnalytics {
  breakdown: WeeklyBreakdown[];
  totalPlannedMinutes: number;
  totalTrackedMinutes: number;
  unallocatedMinutes: number;
}

const MINUTES_IN_WEEK = 7 * 24 * 60; // 10080
export { MINUTES_IN_WEEK };

/**
 * Calculate planned time breakdown from routine
 */
export function getRoutineBreakdown(
  routine: Routine,
  activityTypes: ActivityType[]
): WeeklyBreakdown[] {
  const minutesByType = new Map<string, number>();
  
  for (const block of routine.blocks) {
    const duration = block.endMinutes - block.startMinutes;
    const adjustedDuration = duration < 0 ? duration + 1440 : duration;
    const current = minutesByType.get(block.activityTypeId) || 0;
    minutesByType.set(block.activityTypeId, current + adjustedDuration);
  }
  
  return activityTypes
    .map(at => {
      const plannedMinutes = minutesByType.get(at.id) || 0;
      return {
        activityTypeId: at.id,
        activityTypeName: at.name,
        color: at.color,
        plannedMinutes,
        actualMinutes: 0,
        percentageOfWeek: (plannedMinutes / MINUTES_IN_WEEK) * 100,
      };
    })
    .filter(b => b.plannedMinutes > 0)
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);
}

/**
 * Calculate actual tracked time for a specific week
 */
export function getTrackedBreakdown(
  trackingEntries: TrackingEntry[],
  weekStartDate: string,
  activityTypes: ActivityType[]
): WeeklyBreakdown[] {
  const weekStart = new Date(weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const entriesInWeek = trackingEntries.filter(entry => {
    const entryDate = new Date(entry.date);
    return entryDate >= weekStart && entryDate < weekEnd;
  });
  
  const minutesByType = new Map<string, number>();
  
  for (const entry of entriesInWeek) {
    if (!entry.endTime) continue;
    
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    
    const current = minutesByType.get(entry.activityTypeId) || 0;
    minutesByType.set(entry.activityTypeId, current + durationMinutes);
  }
  
  return activityTypes
    .map(at => ({
      activityTypeId: at.id,
      activityTypeName: at.name,
      color: at.color,
      plannedMinutes: 0,
      actualMinutes: minutesByType.get(at.id) || 0,
      percentageOfWeek: ((minutesByType.get(at.id) || 0) / MINUTES_IN_WEEK) * 100,
    }))
    .filter(b => b.actualMinutes > 0)
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}

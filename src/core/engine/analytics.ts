import { Routine, TrackingEntry, ActivityType } from '../types';
import {
  addDaysToDateKey,
  getRoutineBlockDurationMinutes,
  parseLocalDateKey,
} from '../utils/time';

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
    const current = minutesByType.get(block.activityTypeId) || 0;
    minutesByType.set(block.activityTypeId, current + getRoutineBlockDurationMinutes(block));
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
  weekStartDateKey: string,
  activityTypes: ActivityType[]
): WeeklyBreakdown[] {
  const weekEndKey = addDaysToDateKey(weekStartDateKey, 7);
  const weekStart = parseLocalDateKey(weekStartDateKey);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = parseLocalDateKey(weekEndKey);
  weekEnd.setHours(0, 0, 0, 0);
  
  const minutesByType = new Map<string, number>();
  
  for (const entry of trackingEntries) {
    if (!entry.endTime) continue;
    const entryStart = new Date(entry.startTime).getTime();
    const entryEnd = new Date(entry.endTime).getTime();
    if (!Number.isFinite(entryStart) || !Number.isFinite(entryEnd) || entryEnd <= entryStart) continue;
    const clippedStart = Math.max(entryStart, weekStart.getTime());
    const clippedEnd = Math.min(entryEnd, weekEnd.getTime());
    const durationMinutes = (clippedEnd - clippedStart) / 60000;
    if (durationMinutes <= 0) continue;
    
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

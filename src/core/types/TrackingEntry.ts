import { ActivityTypeId } from './ActivityType';
import { GoalId } from './Goal';
import { RoutineBlockId } from './RoutineBlock';

export type TrackingSource = 'scheduled' | 'manual' | 'notification';

/**
 * A stretch of a tracking session during which the user paused tracking (#54, design p77: "The
 * user can also pause tracking"). `end` is absent while the pause is still open; only the last
 * pause of a running entry may be open. Pauses lie inside the entry, in time order, and do not
 * overlap. A pomodoro break is not a pause: breaks are only the timer's phase (#53).
 */
export interface TrackingPause {
  start: string;                  // ISO 8601 datetime
  end?: string;                   // ISO 8601 datetime; absent while paused
}

export interface TrackingEntry {
  id: string;
  date: string;                   // ISO 8601 date only: "2026-02-02"
  startTime: string;              // ISO 8601 datetime
  endTime?: string;               // Null if still active
  activityTypeId: ActivityTypeId;
  goalId?: GoalId;
  routineBlockId?: RoutineBlockId;
  source: TrackingSource;
  /** Paused stretches (schema v9). Absent means never paused. Tracked time excludes them. */
  pauses?: TrackingPause[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TrackingEntryId = string;

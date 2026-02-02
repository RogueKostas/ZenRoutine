import { ActivityTypeId } from './ActivityType';
import { GoalId } from './Goal';
import { RoutineBlockId } from './RoutineBlock';

export type TrackingSource = 'scheduled' | 'manual' | 'notification';

export interface TrackingEntry {
  id: string;
  date: string;                   // ISO 8601 date only: "2026-02-02"
  startTime: string;              // ISO 8601 datetime
  endTime?: string;               // Null if still active
  activityTypeId: ActivityTypeId;
  goalId?: GoalId;
  routineBlockId?: RoutineBlockId;
  source: TrackingSource;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TrackingEntryId = string;

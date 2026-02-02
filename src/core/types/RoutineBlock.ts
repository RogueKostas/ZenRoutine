import { ActivityTypeId } from './ActivityType';
import { GoalId } from './Goal';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface RoutineBlock {
  id: string;
  dayOfWeek: DayOfWeek;
  startMinutes: number;   // Minutes from midnight (0-1439)
  endMinutes: number;     // Minutes from midnight (0-1439)
  activityTypeId: ActivityTypeId;
  goalId?: GoalId;        // Optional: specific goal to work on
}

export type RoutineBlockId = string;

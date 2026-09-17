import { ActivityTypeId } from './ActivityType';

export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived';

export interface Goal {
  id: string;
  name: string;
  description: string;
  estimatedMinutes: number;   // Total minutes to complete
  loggedMinutes: number;      // Minutes tracked so far
  activityTypeId: ActivityTypeId;
  status: GoalStatus;
  /**
   * The goal's position in the one goals list, from 0 at the top (#49). Priority is list order:
   * the top goal of a type gets that type's time first. The store keeps these dense (0..n-1) and
   * keeps `AppState.goals` sorted by them, so a goal's `order` is also its array index.
   */
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type GoalId = string;

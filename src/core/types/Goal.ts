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
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type GoalId = string;

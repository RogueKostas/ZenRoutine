import { ActivityTypeId } from './ActivityType';

export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived';

// Priority levels from highest (1) to lowest (5)
export type GoalPriority = 1 | 2 | 3 | 4 | 5;

export const PRIORITY_LABELS: Record<GoalPriority, string> = {
  1: 'Very High',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Very Low',
};

export const PRIORITY_COLORS: Record<GoalPriority, string> = {
  1: '#E53935', // Red
  2: '#FB8C00', // Orange
  3: '#FDD835', // Yellow
  4: '#43A047', // Green
  5: '#78909C', // Gray
};

export interface Goal {
  id: string;
  name: string;
  description: string;
  estimatedMinutes: number;   // Total minutes to complete
  loggedMinutes: number;      // Minutes tracked so far
  activityTypeId: ActivityTypeId;
  status: GoalStatus;
  priority: GoalPriority;     // 1 = highest, 5 = lowest
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type GoalId = string;

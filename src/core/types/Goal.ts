import { ActivityTypeId } from './ActivityType';

export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived';

export interface Goal {
  id: string;
  name: string;
  description: string;
  /**
   * Total minutes to complete, or absent when the user has not estimated the goal (#50: "Activity
   * Type and Estimation are optional", design p51). The "1hr" a new row shows (p50) is a display
   * placeholder, not a stored value: a plain to-do item must not claim an hour of forecastable work.
   * A goal without an estimate is never forecast and never completes itself from tracked time.
   */
  estimatedMinutes?: number;
  loggedMinutes: number;      // Minutes tracked so far
  /**
   * Absent when the goal has no activity type yet (#50; shown as `?`, p50). Such a goal gets no
   * routine time and cannot be linked to a tracking entry until it is given a type.
   */
  activityTypeId?: ActivityTypeId;
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

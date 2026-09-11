import { ActivityTypeId } from './ActivityType';
import { RoutineBlock } from './RoutineBlock';

export interface Routine {
  id: string;
  name: string;           // e.g., "Work Week", "Vacation Mode"
  isActive: boolean;      // Only one routine active at a time
  blocks: RoutineBlock[];
  /**
   * When this routine's scheduled capacity last changed, per activity type.
   * Forecast confidence counts tracking evidence from this point, so editing
   * one activity's blocks cannot invalidate another activity's evidence.
   * Absent entries (routines saved before this field existed) fall back to
   * `updatedAt`, which is the behaviour those routines were written under.
   */
  capacityChangedAt?: Record<ActivityTypeId, string>;
  createdAt: string;
  updatedAt: string;
}

export type RoutineId = string;

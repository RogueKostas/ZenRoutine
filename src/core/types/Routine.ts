import { RoutineBlock } from './RoutineBlock';

export interface Routine {
  id: string;
  name: string;           // e.g., "Work Week", "Vacation Mode"
  isActive: boolean;      // Only one routine active at a time
  blocks: RoutineBlock[];
  createdAt: string;
  updatedAt: string;
}

export type RoutineId = string;

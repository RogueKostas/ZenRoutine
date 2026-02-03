import { ActivityType } from './ActivityType';
import { Goal } from './Goal';
import { Routine } from './Routine';
import { TrackingEntry } from './TrackingEntry';

export interface AppState {
  // Data
  activityTypes: ActivityType[];
  goals: Goal[];
  routines: Routine[];
  trackingEntries: TrackingEntry[];

  // UI State
  activeRoutineId: string | null;
  currentTrackingEntryId: string | null;
  hasCompletedOnboarding: boolean;

  // Meta
  lastSyncedAt?: string;
  schemaVersion: number;
}

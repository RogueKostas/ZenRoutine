import { ActivityType } from './ActivityType';
import { Goal } from './Goal';
import { Routine } from './Routine';
import { TrackingEntry } from './TrackingEntry';

/**
 * First day of the displayed week: 0 = Sunday, 1 = Monday. Uses the same numbering as
 * `DayOfWeek`, which does not change with this setting; only display order and week
 * boundaries follow it.
 */
export type WeekStartsOn = 0 | 1;

/** User choices that are not data. Wave C adds its Pomodoro toggle here. */
export interface Preferences {
  weekStartsOn: WeekStartsOn;
}

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
  preferences: Preferences;

  // Meta
  lastSyncedAt?: string;
  schemaVersion: number;
}

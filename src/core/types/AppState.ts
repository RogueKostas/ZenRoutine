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

/** The Current Activity view's Pomodoro timer (#53). */
export interface PomodoroPreference {
  /** Off: the view shows a plain running timer. */
  enabled: boolean;
}

/** User choices that are not data. */
export interface Preferences {
  weekStartsOn: WeekStartsOn;
  /**
   * Absent until the user changes it, and absent means on (the director: "almost a default for
   * the app"). Read it through `isPomodoroEnabled`.
   */
  pomodoro?: PomodoroPreference;
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

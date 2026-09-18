import type {
  ActivityType,
  AppState,
  DayOfWeek,
  Goal,
  Routine,
  RoutineBlock,
  TrackingEntry,
} from '../core/types';
import { DEFAULT_ACTIVITY_TYPES } from '../core/engine/defaults';
import { generateId } from '../core/utils/id';
import { toLocalDateKey } from '../core/utils/time';

/**
 * The example data behind "Try it with example data" (#62).
 *
 * Built to be reviewed with, not just to fill screens: a full working week,
 * lighter weekends, and a tracking history shaped so the forecast shows all of
 * its confidence levels at once --
 *
 * - Work is tracked on every weekday of the last three weeks: 15 distinct days,
 *   which is "high" confidence for both Work goals.
 * - Fitness is tracked on every scheduled session: 9 weekday + 3 Saturday
 *   sessions = 12 days, which is "medium".
 * - Side Project has only its three most recent sessions tracked: "low".
 * - Personal Development has never been tracked: "low", with no evidence.
 *
 * Every date is relative to `now`, so the data never goes stale. The window is
 * exactly three whole weeks ending yesterday, so the day counts above hold on
 * any day of the week. Today is left untracked on purpose: nothing in the
 * history can end after the moment it was loaded.
 */

export const SAMPLE_ROUTINE_NAME = 'Example Week';

/** Whole weeks of history. Three gives Work 15 days, clear of the 14-day "high" bar. */
export const SAMPLE_HISTORY_DAYS = 21;

type SampleActivity = 'Work' | 'Side Project' | 'Fitness' | 'Personal Development' | 'Food' | 'Family Time';

export const SAMPLE_ACTIVITY_NAMES: readonly SampleActivity[] = [
  'Work',
  'Side Project',
  'Fitness',
  'Personal Development',
  'Food',
  'Family Time',
];

interface SampleBlock {
  days: readonly DayOfWeek[];
  start: string; // "HH:MM"
  end: string;
  activity: SampleActivity;
}

const WEEKDAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5];

const SAMPLE_BLOCKS: readonly SampleBlock[] = [
  { days: [1, 3, 5], start: '07:00', end: '08:00', activity: 'Fitness' },
  { days: WEEKDAYS, start: '09:00', end: '12:00', activity: 'Work' },
  { days: WEEKDAYS, start: '12:00', end: '13:00', activity: 'Food' },
  { days: WEEKDAYS, start: '13:00', end: '17:30', activity: 'Work' },
  { days: [1, 2, 3, 4], start: '19:00', end: '21:00', activity: 'Side Project' },
  { days: WEEKDAYS, start: '21:30', end: '22:00', activity: 'Personal Development' },
  // Weekends are lighter.
  { days: [6], start: '09:00', end: '10:30', activity: 'Fitness' },
  { days: [6], start: '11:00', end: '13:00', activity: 'Side Project' },
  { days: [0], start: '10:00', end: '11:00', activity: 'Personal Development' },
  { days: [0], start: '12:00', end: '16:00', activity: 'Family Time' },
];

interface SampleGoal {
  key: string;
  name: string;
  description: string;
  estimatedMinutes?: number;
  activity?: SampleActivity;
}

/**
 * In list order (#49), most important first. The two Work goals show the queue: the dashboard
 * takes Work's time first and the planning doc waits for it. The last one is a plain to-do item,
 * with no type and no estimate (#50): listed, never scheduled.
 */
const SAMPLE_GOALS: readonly SampleGoal[] = [
  {
    key: 'dashboard',
    name: 'Ship the analytics dashboard',
    description: 'Takes all the Work time until it ships.',
    estimatedMinutes: 80 * 60,
    activity: 'Work',
  },
  {
    key: 'marathon',
    name: 'Half-marathon training block',
    description: 'Three runs a week plus a long Saturday run.',
    estimatedMinutes: 24 * 60,
    activity: 'Fitness',
  },
  {
    key: 'course',
    name: 'Finish the TypeScript course',
    description: 'Only just started tracking this one.',
    estimatedMinutes: 30 * 60,
    activity: 'Side Project',
  },
  {
    key: 'planning',
    name: 'Write the Q4 planning doc',
    description: 'Next in line for Work once the dashboard ships.',
    estimatedMinutes: 12 * 60,
    activity: 'Work',
  },
  {
    key: 'reading',
    name: "Read 'Deep Work'",
    description: 'Scheduled but never tracked yet.',
    estimatedMinutes: 8 * 60,
    activity: 'Personal Development',
  },
  {
    key: 'passport',
    name: 'Renew passport',
    description: '',
  },
];

/** The example goals' names: how account sign-in tells example data from the user's own. */
export const SAMPLE_GOAL_NAMES: readonly string[] = SAMPLE_GOALS.map((goal) => goal.name);

/**
 * Which scheduled blocks in the history were actually tracked, and which goal
 * each session was linked to. Work mornings count towards the dashboard and
 * Work afternoons are unlinked, so they count as evidence for both Work goals.
 */
function trackedAs(
  block: SampleBlock,
  sideProjectSessionsSoFar: number
): { tracked: boolean; goalKey?: string } {
  switch (block.activity) {
    case 'Work':
      return block.start === '09:00' ? { tracked: true, goalKey: 'dashboard' } : { tracked: true };
    case 'Fitness':
      return { tracked: true, goalKey: 'marathon' };
    case 'Side Project':
      return sideProjectSessionsSoFar < 3
        ? { tracked: true, goalKey: 'course' }
        : { tracked: false };
    default:
      return { tracked: false };
  }
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function atMinutes(day: Date, minutesFromMidnight: number): Date {
  const result = new Date(day);
  result.setHours(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);
  return result;
}

/** The activity types the sample needs that `existing` lacks, created from the defaults. */
export function missingSampleActivityTypes(
  existing: readonly ActivityType[],
  now: Date
): ActivityType[] {
  const timestamp = now.toISOString();
  const maxSortOrder = existing.reduce((max, activity) => Math.max(max, activity.sortOrder), -1);
  return SAMPLE_ACTIVITY_NAMES
    .filter((name) => !existing.some((activity) => activity.name === name))
    .map((name, index) => {
      const template = DEFAULT_ACTIVITY_TYPES.find((activity) => activity.name === name)!;
      return {
        ...template,
        isDefault: false,
        sortOrder: maxSortOrder + 1 + index,
        id: generateId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
}

export interface SampleData {
  routine: Routine;
  /**
   * Goals with `loggedMinutes` at zero, in list order with `order` from 0; the store adds progress
   * as it records each entry, and renumbers them to follow the user's own goals.
   */
  goals: Goal[];
  trackingEntries: Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt'>[];
}

/**
 * Build the example set against `activityTypes`, which must already contain
 * every name in SAMPLE_ACTIVITY_NAMES (see `missingSampleActivityTypes`).
 */
export function buildSampleData(activityTypes: readonly ActivityType[], now: Date): SampleData {
  const idFor = (name: SampleActivity): string => {
    const activity = activityTypes.find((candidate) => candidate.name === name);
    if (!activity) throw new Error(`Sample data needs the "${name}" activity type.`);
    return activity.id;
  };

  const historyStart = new Date(now);
  historyStart.setHours(0, 0, 0, 0);
  historyStart.setDate(historyStart.getDate() - SAMPLE_HISTORY_DAYS);
  // The schedule has to predate the history, or the forecast discards all of
  // it: evidence only counts from the routine's per-activity capacity stamp.
  const scheduledSince = historyStart.toISOString();

  const blocks: (RoutineBlock & { sample: SampleBlock })[] = SAMPLE_BLOCKS.flatMap((sample) =>
    sample.days.map((dayOfWeek) => ({
      id: generateId(),
      dayOfWeek,
      startMinutes: toMinutes(sample.start),
      endMinutes: toMinutes(sample.end),
      activityTypeId: idFor(sample.activity),
      sample,
    }))
  );

  const capacityChangedAt: Record<string, string> = {};
  for (const block of blocks) capacityChangedAt[block.activityTypeId] = scheduledSince;

  const routine: Routine = {
    id: generateId(),
    name: SAMPLE_ROUTINE_NAME,
    isActive: true,
    blocks: blocks.map(({ sample: _sample, ...block }) => block),
    capacityChangedAt,
    createdAt: scheduledSince,
    updatedAt: scheduledSince,
  };

  const goalIds = new Map(SAMPLE_GOALS.map((goal) => [goal.key, generateId()]));
  const goals: Goal[] = SAMPLE_GOALS.map((goal, order) => ({
    id: goalIds.get(goal.key)!,
    name: goal.name,
    description: goal.description,
    ...(goal.estimatedMinutes !== undefined ? { estimatedMinutes: goal.estimatedMinutes } : {}),
    loggedMinutes: 0,
    ...(goal.activity !== undefined ? { activityTypeId: idFor(goal.activity) } : {}),
    status: 'active',
    order,
    createdAt: scheduledSince,
    updatedAt: scheduledSince,
  }));

  // Walk backwards from yesterday so "the three most recent sessions" is easy to count.
  const trackingEntries: SampleData['trackingEntries'] = [];
  let sideProjectSessions = 0;
  for (let daysAgo = 1; daysAgo <= SAMPLE_HISTORY_DAYS; daysAgo += 1) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - daysAgo);
    const dayBlocks = blocks
      .filter((block) => block.dayOfWeek === day.getDay())
      .sort((left, right) => right.startMinutes - left.startMinutes);
    for (const block of dayBlocks) {
      const { tracked, goalKey } = trackedAs(block.sample, sideProjectSessions);
      if (block.sample.activity === 'Side Project') sideProjectSessions += 1;
      if (!tracked) continue;
      trackingEntries.push({
        date: toLocalDateKey(day),
        startTime: atMinutes(day, block.startMinutes).toISOString(),
        endTime: atMinutes(day, block.endMinutes).toISOString(),
        activityTypeId: block.activityTypeId,
        goalId: goalKey ? goalIds.get(goalKey) : undefined,
        routineBlockId: block.id,
        source: 'scheduled',
      });
    }
  }
  trackingEntries.sort((left, right) => left.startTime.localeCompare(right.startTime));

  return { routine, goals, trackingEntries };
}

/**
 * True when there is nothing of the user's to show: no goals, no scheduled
 * blocks and no tracking. This is when Home offers the example data. Only
 * then is it certain that loading can't mix with real data.
 */
export function isFirstRunEmpty(
  state: Pick<AppState, 'goals' | 'routines' | 'trackingEntries'>
): boolean {
  return (
    state.goals.length === 0 &&
    state.trackingEntries.length === 0 &&
    state.routines.every((routine) => routine.blocks.length === 0)
  );
}

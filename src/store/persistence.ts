import type {
  ActivityType,
  AppState,
  DayOfWeek,
  Goal,
  GoalPriority,
  GoalStatus,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
} from '../core/types';
import { createDefaultActivityTypes } from '../core/engine/defaults';

export const APP_STORAGE_KEY = 'zenroutine-storage';
export const CURRENT_SCHEMA_VERSION = 4;
export const BACKUP_FORMAT = 'zenroutine-backup';
export const BACKUP_FORMAT_VERSION = 1;

const ICON_NAME_TO_EMOJI: Record<string, string> = {
  briefcase: '💼',
  rocket: '🚀',
  heart: '❤️',
  dumbbell: '💪',
  book: '📚',
  tv: '📺',
  users: '👥',
  car: '🚗',
  utensils: '🍴',
  droplet: '💧',
  moon: '🌙',
};

type UnknownRecord = Record<string, unknown>;

export interface ZenRoutineBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  schemaVersion: number;
  exportedAt: string;
  state: AppState;
}

export function createInitialState(): AppState {
  return {
    activityTypes: createDefaultActivityTypes(),
    goals: [],
    routines: [],
    trackingEntries: [],
    activeRoutineId: null,
    currentTrackingEntryId: null,
    hasCompletedOnboarding: false,
    lastSyncedAt: undefined,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function selectPersistedAppState(state: AppState): AppState {
  return {
    activityTypes: state.activityTypes,
    goals: state.goals,
    routines: state.routines,
    trackingEntries: state.trackingEntries,
    activeRoutineId: state.activeRoutineId,
    currentTrackingEntryId: state.currentTrackingEntryId,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    lastSyncedAt: state.lastSyncedAt,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${key}: expected a string`);
  }
  return value;
}

function readOptionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${key}: expected a string`);
  }
  return value;
}

function readNumber(record: UnknownRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key}: expected a finite number`);
  }
  return value;
}

function readInteger(record: UnknownRecord, key: string): number {
  const value = readNumber(record, key);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${key}: expected an integer`);
  }
  return value;
}

function readIsoDateTime(record: UnknownRecord, key: string): string {
  const value = readString(record, key);
  if (!Number.isFinite(Date.parse(value)) || !value.includes('T')) {
    throw new Error(`Invalid ${key}: expected an ISO date-time`);
  }
  return value;
}

function readOptionalIsoDateTime(record: UnknownRecord, key: string): string | undefined {
  const value = readOptionalString(record, key);
  if (value === undefined) return undefined;
  if (!Number.isFinite(Date.parse(value)) || !value.includes('T')) {
    throw new Error(`Invalid ${key}: expected an ISO date-time`);
  }
  return value;
}

function readDateKey(record: UnknownRecord, key: string): string {
  const value = readString(record, key);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ${key}: expected YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ${key}: expected a real calendar date`);
  }
  return value;
}

function readBoolean(record: UnknownRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${key}: expected a boolean`);
  }
  return value;
}

function readRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected an object`);
  return value;
}

function readArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Invalid ${key}: expected an array`);
  return value;
}

function readNullableId(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`Invalid ${key}: expected a string or null`);
  return value;
}

function parseActivityType(value: unknown, migrateLegacyIcon: boolean): ActivityType {
  const record = readRecord(value, 'activity type');
  const icon = readOptionalString(record, 'icon');
  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    color: readString(record, 'color'),
    icon: migrateLegacyIcon && icon ? ICON_NAME_TO_EMOJI[icon] ?? icon : icon,
    isDefault: readBoolean(record, 'isDefault'),
    sortOrder: readInteger(record, 'sortOrder'),
    createdAt: readIsoDateTime(record, 'createdAt'),
    updatedAt: readIsoDateTime(record, 'updatedAt'),
  };
}

const GOAL_STATUSES: GoalStatus[] = ['active', 'completed', 'paused', 'archived'];
const TRACKING_SOURCES: TrackingSource[] = ['scheduled', 'manual', 'notification'];

function parseGoal(value: unknown, addDefaultPriority: boolean, repairLegacyValues: boolean): Goal {
  const record = readRecord(value, 'goal');
  const status = readString(record, 'status');
  if (!GOAL_STATUSES.includes(status as GoalStatus)) {
    throw new Error(`Invalid goal status: ${status}`);
  }

  const rawPriority = addDefaultPriority && record.priority === undefined
    ? 3
    : readNumber(record, 'priority');
  if (![1, 2, 3, 4, 5].includes(rawPriority)) {
    throw new Error(`Invalid goal priority: ${rawPriority}`);
  }

  const updatedAt = readIsoDateTime(record, 'updatedAt');
  const rawCompletedAt = readOptionalIsoDateTime(record, 'completedAt');
  let completedAt = rawCompletedAt;
  if (status === 'completed' && completedAt === undefined) {
    if (!repairLegacyValues) {
      throw new Error('Invalid completedAt: completed goals require a timestamp');
    }
    completedAt = updatedAt;
  } else if (status !== 'completed' && completedAt !== undefined) {
    if (!repairLegacyValues) {
      throw new Error('Invalid completedAt: non-completed goals cannot have a timestamp');
    }
    completedAt = undefined;
  }

  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    description: readOptionalString(record, 'description') ?? '',
    estimatedMinutes: (() => {
      const minutes = readInteger(record, 'estimatedMinutes');
      if (minutes > 0) return minutes;
      if (repairLegacyValues) return 1;
      throw new Error('Invalid estimatedMinutes: expected a positive integer');
    })(),
    loggedMinutes: (() => {
      const minutes = readInteger(record, 'loggedMinutes');
      if (minutes >= 0) return minutes;
      if (repairLegacyValues) return 0;
      throw new Error('Invalid loggedMinutes: expected a non-negative integer');
    })(),
    activityTypeId: readString(record, 'activityTypeId'),
    status: status as GoalStatus,
    priority: rawPriority as GoalPriority,
    createdAt: readIsoDateTime(record, 'createdAt'),
    updatedAt,
    completedAt,
  };
}

function parseRoutineBlock(value: unknown): RoutineBlock {
  const record = readRecord(value, 'routine block');
  const dayOfWeek = readInteger(record, 'dayOfWeek');
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error(`Invalid routine block day: ${dayOfWeek}`);
  }
  const startMinutes = readInteger(record, 'startMinutes');
  const endMinutes = readInteger(record, 'endMinutes');
  if (startMinutes < 0 || startMinutes >= 1440 || endMinutes < 0 || endMinutes >= 1440) {
    throw new Error('Invalid routine block time: expected minutes from 0 to 1439');
  }
  if (startMinutes === endMinutes) {
    throw new Error('Invalid routine block time: start and end must differ');
  }
  return {
    id: readString(record, 'id'),
    dayOfWeek: dayOfWeek as DayOfWeek,
    startMinutes,
    endMinutes,
    activityTypeId: readString(record, 'activityTypeId'),
    goalId: readOptionalString(record, 'goalId'),
  };
}

function parseRoutine(value: unknown): Routine {
  const record = readRecord(value, 'routine');
  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    isActive: readBoolean(record, 'isActive'),
    blocks: readArray(record, 'blocks').map(parseRoutineBlock),
    createdAt: readIsoDateTime(record, 'createdAt'),
    updatedAt: readIsoDateTime(record, 'updatedAt'),
  };
}

function parseTrackingEntry(value: unknown, repairLegacyValues: boolean): TrackingEntry {
  const record = readRecord(value, 'tracking entry');
  const source = readString(record, 'source');
  if (!TRACKING_SOURCES.includes(source as TrackingSource)) {
    throw new Error(`Invalid tracking source: ${source}`);
  }
  const startTime = readIsoDateTime(record, 'startTime');
  let endTime = readOptionalIsoDateTime(record, 'endTime');
  if (endTime && Date.parse(endTime) < Date.parse(startTime)) {
    if (!repairLegacyValues) {
      throw new Error('Invalid tracking entry: endTime is before startTime');
    }
    endTime = startTime;
  }
  return {
    id: readString(record, 'id'),
    date: readDateKey(record, 'date'),
    startTime,
    endTime,
    activityTypeId: readString(record, 'activityTypeId'),
    goalId: readOptionalString(record, 'goalId'),
    routineBlockId: readOptionalString(record, 'routineBlockId'),
    source: source as TrackingSource,
    notes: readOptionalString(record, 'notes'),
    createdAt: readIsoDateTime(record, 'createdAt'),
    updatedAt: readIsoDateTime(record, 'updatedAt'),
  };
}

export function migratePersistedState(persistedState: unknown, version: number): AppState {
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported ZenRoutine schema version: ${version}`);
  }

  const record = readRecord(persistedState, 'persisted state');
  const activityTypes = readArray(record, 'activityTypes').map(
    (value) => parseActivityType(value, version < 2)
  );
  const goals = readArray(record, 'goals').map(
    (value) => parseGoal(value, version < 3, version < CURRENT_SCHEMA_VERSION)
  );
  let routines = readArray(record, 'routines').map(parseRoutine);
  let trackingEntries = readArray(record, 'trackingEntries').map(
    (value) => parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)
  );
  const activityIds = new Set(activityTypes.map((activity) => activity.id));
  const routineIds = new Set(routines.map((routine) => routine.id));
  const entryIds = new Set(trackingEntries.map((entry) => entry.id));
  const assertUniqueIds = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Invalid ${label}: duplicate ids`);
    }
  };
  assertUniqueIds(activityTypes.map((activity) => activity.id), 'activity types');
  assertUniqueIds(goals.map((goal) => goal.id), 'goals');
  assertUniqueIds(routines.map((routine) => routine.id), 'routines');
  assertUniqueIds(trackingEntries.map((entry) => entry.id), 'tracking entries');
  routines.forEach((routine) => assertUniqueIds(
    routine.blocks.map((block) => block.id),
    `routine ${routine.id} blocks`
  ));
  const allRoutineBlocks = routines.flatMap((routine) => routine.blocks);
  assertUniqueIds(allRoutineBlocks.map((block) => block.id), 'routine blocks');

  if (goals.some((goal) => !activityIds.has(goal.activityTypeId))) {
    throw new Error('Invalid goals: referenced activity type does not exist');
  }
  if (routines.some((routine) => routine.blocks.some(
    (block) => !activityIds.has(block.activityTypeId)
  ))) {
    throw new Error('Invalid routines: referenced activity type does not exist');
  }
  if (trackingEntries.some((entry) => !activityIds.has(entry.activityTypeId))) {
    throw new Error('Invalid tracking entries: referenced activity type does not exist');
  }

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const blockGoalIsInvalid = (block: RoutineBlock) => {
    if (!block.goalId) return false;
    const goal = goalsById.get(block.goalId);
    return !goal || goal.activityTypeId !== block.activityTypeId;
  };
  const entryGoalIsInvalid = (entry: TrackingEntry) => {
    if (!entry.goalId) return false;
    const goal = goalsById.get(entry.goalId);
    return !goal || goal.activityTypeId !== entry.activityTypeId;
  };
  const hasInvalidBlockGoal = routines.some((routine) => routine.blocks.some(blockGoalIsInvalid));
  const hasInvalidEntryGoal = trackingEntries.some(entryGoalIsInvalid);
  if (version < CURRENT_SCHEMA_VERSION) {
    if (hasInvalidBlockGoal) {
      routines = routines.map((routine) => ({
        ...routine,
        blocks: routine.blocks.map((block) =>
          blockGoalIsInvalid(block) ? { ...block, goalId: undefined } : block
        ),
      }));
    }
    if (hasInvalidEntryGoal) {
      trackingEntries = trackingEntries.map((entry) =>
        entryGoalIsInvalid(entry) ? { ...entry, goalId: undefined } : entry
      );
    }
  } else {
    if (hasInvalidBlockGoal) {
      throw new Error('Invalid routine block goal: goal is missing or uses another activity type');
    }
    if (hasInvalidEntryGoal) {
      throw new Error('Invalid tracking entry goal: goal is missing or uses another activity type');
    }
  }

  const routineBlocksById = new Map(
    routines.flatMap((routine) => routine.blocks).map((block) => [block.id, block])
  );
  const entryRoutineBlockIsInvalid = (entry: TrackingEntry) => {
    if (!entry.routineBlockId) return false;
    const block = routineBlocksById.get(entry.routineBlockId);
    return !block ||
      block.activityTypeId !== entry.activityTypeId ||
      Boolean(block.goalId && block.goalId !== entry.goalId);
  };
  const hasInvalidEntryRoutineBlock = trackingEntries.some(entryRoutineBlockIsInvalid);
  if (version < CURRENT_SCHEMA_VERSION) {
    if (hasInvalidEntryRoutineBlock) {
      trackingEntries = trackingEntries.map((entry) =>
        entryRoutineBlockIsInvalid(entry)
          ? { ...entry, routineBlockId: undefined }
          : entry
      );
    }
  } else if (hasInvalidEntryRoutineBlock) {
    throw new Error(
      'Invalid tracking entry routineBlockId: block is missing or does not match the entry'
    );
  }

  let activeRoutineId = readNullableId(record, 'activeRoutineId');
  let currentTrackingEntryId = readNullableId(record, 'currentTrackingEntryId');
  const hasInvalidActiveRoutine = activeRoutineId !== null && !routineIds.has(activeRoutineId);
  const openEntries = trackingEntries.filter((entry) => entry.endTime === undefined);
  if (version < CURRENT_SCHEMA_VERSION) {
    if (hasInvalidActiveRoutine) activeRoutineId = null;
    const selectedOpenEntry = openEntries.find(
      (entry) => entry.id === currentTrackingEntryId
    ) ?? openEntries.at(-1);
    currentTrackingEntryId = selectedOpenEntry?.id ?? null;
    trackingEntries = trackingEntries.map((entry) =>
      entry.endTime === undefined && entry.id !== currentTrackingEntryId
        ? { ...entry, endTime: entry.startTime }
        : entry
    );
  } else {
    if (hasInvalidActiveRoutine) {
      throw new Error('Invalid activeRoutineId: routine does not exist');
    }
    if (openEntries.length > 1) {
      throw new Error('Invalid tracking entries: only one entry can be open');
    }
    if (
      (openEntries.length === 0 && currentTrackingEntryId !== null) ||
      (openEntries.length === 1 && currentTrackingEntryId !== openEntries[0].id) ||
      (currentTrackingEntryId !== null && !entryIds.has(currentTrackingEntryId))
    ) {
      throw new Error('Invalid currentTrackingEntryId: it must identify the only open entry');
    }
  }

  const hasCompletedOnboarding = typeof record.hasCompletedOnboarding === 'boolean'
    ? record.hasCompletedOnboarding
    : version < CURRENT_SCHEMA_VERSION
      ? false
      : (() => {
          throw new Error('Invalid hasCompletedOnboarding: expected a boolean');
        })();

  return {
    activityTypes,
    goals,
    routines,
    trackingEntries,
    activeRoutineId,
    currentTrackingEntryId,
    hasCompletedOnboarding,
    lastSyncedAt: readOptionalIsoDateTime(record, 'lastSyncedAt'),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function encodeBackup(state: AppState, exportedAt = new Date().toISOString()): string {
  const backup: ZenRoutineBackup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    state: selectPersistedAppState(state),
  };
  return JSON.stringify(backup, null, 2);
}

export function decodeBackup(serialized: string): AppState {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const backup = readRecord(value, 'backup');
  if (backup.format !== BACKUP_FORMAT || backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('The selected file is not a supported ZenRoutine backup.');
  }
  if (typeof backup.schemaVersion !== 'number') {
    throw new Error('The backup does not include a schema version.');
  }
  readIsoDateTime(backup, 'exportedAt');
  return migratePersistedState(backup.state, backup.schemaVersion);
}

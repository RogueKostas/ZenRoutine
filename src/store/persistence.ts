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
/**
 * Side-car key holding tracking entries that hydration could not read. It is deliberately a
 * separate key from APP_STORAGE_KEY: the store overwrites its own blob on the next write, so
 * anything quarantined has to be copied somewhere the store does not own before that happens.
 */
export const QUARANTINE_STORAGE_KEY = 'zenroutine-quarantine';
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

/** A persisted tracking entry that could not be read, set aside instead of being lost. */
export interface QuarantinedTrackingEntry {
  /** Position in the persisted trackingEntries array, so two bad records stay distinguishable. */
  index: number;
  /** The record's own id when that much was readable, else null. */
  id: string | null;
  /** Why it could not be read, taken from the parse error. */
  reason: string;
  /** The record exactly as it was stored. Quarantining must never destroy user data. */
  record: unknown;
}

export const QUARANTINE_ARCHIVE_FORMAT = 'zenroutine-quarantine-archive';
/**
 * Cap on retained generations, so a device that somehow quarantines on every launch cannot grow
 * the side-car without bound. Past the cap the OLDEST generation is dropped. Realistically
 * unreachable: with stopTracking fixed there is no known repeating source of bad records.
 */
export const MAX_QUARANTINE_GENERATIONS = 20;

/** One hydration's worth of quarantined records. */
export interface QuarantineGeneration {
  quarantinedAt: string;
  schemaVersion: number;
  entries: QuarantinedTrackingEntry[];
}

export interface QuarantineArchive {
  format: typeof QUARANTINE_ARCHIVE_FORMAT;
  generations: QuarantineGeneration[];
  /**
   * Verbatim prior contents of the side-car, kept when they could not be understood. The side-car
   * is the last copy of records already gone from the store's own blob, so an archive we cannot
   * parse still must not be thrown away.
   */
  unreadable?: string;
}

/**
 * Read a side-car archive. Total function by design: this runs on the hydration path, and a
 * malformed archive must never be able to throw there — that would re-create the exact failure
 * mode quarantining exists to prevent.
 */
export function parseQuarantineArchive(serialized: string | null): QuarantineArchive {
  const empty: QuarantineArchive = { format: QUARANTINE_ARCHIVE_FORMAT, generations: [] };
  if (serialized === null || serialized === '') return empty;

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { ...empty, unreadable: serialized };
  }
  if (!isRecord(value) || value.format !== QUARANTINE_ARCHIVE_FORMAT) {
    return { ...empty, unreadable: serialized };
  }
  if (!Array.isArray(value.generations)) return { ...empty, unreadable: serialized };

  const generations = value.generations.filter(
    (generation): generation is QuarantineGeneration =>
      isRecord(generation) && Array.isArray(generation.entries)
  );
  const unreadable = typeof value.unreadable === 'string' ? value.unreadable : undefined;
  return { format: QUARANTINE_ARCHIVE_FORMAT, generations, ...(unreadable ? { unreadable } : {}) };
}

export function appendQuarantineGeneration(
  archive: QuarantineArchive,
  entries: readonly QuarantinedTrackingEntry[],
  quarantinedAt = new Date().toISOString()
): QuarantineArchive {
  const generations = [
    ...archive.generations,
    { quarantinedAt, schemaVersion: CURRENT_SCHEMA_VERSION, entries: [...entries] },
  ];
  return {
    ...archive,
    generations: generations.slice(-MAX_QUARANTINE_GENERATIONS),
  };
}

export interface MigrationOptions {
  /**
   * When supplied, tracking entries that fail to parse are pushed here and skipped rather than
   * aborting the whole migration. Omit it to keep the strict all-or-nothing behaviour that
   * backup import depends on: an import is a deliberate act on a file the user can re-choose,
   * so it should fail loudly rather than quietly drop records.
   */
  quarantine?: QuarantinedTrackingEntry[];
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

/**
 * Per-activity capacity timestamps are derived forecast metadata that the app
 * writes for itself; they are never authored by the user and always have a
 * defined fallback (`Routine.updatedAt`). A malformed entry therefore drops
 * back to that fallback rather than failing hydration and locking the user out
 * of their own data. Routines saved before this field existed simply have none.
 */
function readCapacityChangedAt(
  record: UnknownRecord,
  key: string
): Record<string, string> | undefined {
  const value = record[key];
  if (!isRecord(value)) return undefined;
  const capacityChangedAt: Record<string, string> = {};
  for (const [activityTypeId, changedAt] of Object.entries(value)) {
    if (
      typeof changedAt === 'string' &&
      changedAt.includes('T') &&
      Number.isFinite(Date.parse(changedAt))
    ) {
      capacityChangedAt[activityTypeId] = changedAt;
    }
  }
  return Object.keys(capacityChangedAt).length > 0 ? capacityChangedAt : undefined;
}

function parseRoutine(value: unknown): Routine {
  const record = readRecord(value, 'routine');
  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    isActive: readBoolean(record, 'isActive'),
    blocks: readArray(record, 'blocks').map(parseRoutineBlock),
    capacityChangedAt: readCapacityChangedAt(record, 'capacityChangedAt'),
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

export function migratePersistedState(
  persistedState: unknown,
  version: number,
  options?: MigrationOptions
): AppState {
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported ZenRoutine schema version: ${version}`);
  }

  const quarantine = options?.quarantine;
  const record = readRecord(persistedState, 'persisted state');
  const activityTypes = readArray(record, 'activityTypes').map(
    (value) => parseActivityType(value, version < 2)
  );
  const goals = readArray(record, 'goals').map(
    (value) => parseGoal(value, version < 3, version < CURRENT_SCHEMA_VERSION)
  );
  let routines = readArray(record, 'routines').map(parseRoutine);
  // A single unreadable tracking entry must not be able to take the whole store down with it.
  // Everything above stays strict: activity types, goals and routines are the skeleton the rest
  // of the state hangs off, and a store missing one of those is not a store worth opening.
  // Tracking entries are a flat list where each record stands alone, so one bad row can be set
  // aside while the remaining history loads normally. `trackingEntries` not being an array at
  // all still throws — that is blob-level corruption, not one bad row.
  let trackingEntries: TrackingEntry[] = readArray(record, 'trackingEntries')
    .flatMap<TrackingEntry>((value, index) => {
      try {
        return [parseTrackingEntry(value, version < CURRENT_SCHEMA_VERSION)];
      } catch (error) {
        if (!quarantine) throw error;
        quarantine.push({
          index,
          id: isRecord(value) && typeof value.id === 'string' ? value.id : null,
          reason: error instanceof Error ? error.message : 'Unreadable tracking entry',
          record: value,
        });
        return [];
      }
    });
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
  if (
    currentTrackingEntryId !== null &&
    quarantine !== undefined &&
    quarantine.length > 0 &&
    !entryIds.has(currentTrackingEntryId)
  ) {
    // The running timer pointed at a record that is no longer here, and this pass quarantined
    // something. Clearing the pointer is what makes quarantining actually work: leaving it would
    // trip the strict currentTrackingEntryId check below and brick hydration for exactly the
    // reason we are trying to fix.
    //
    // This deliberately asks "does the pointer still resolve?" rather than "is the pointer in the
    // quarantine list?". A record whose own `id` was unreadable is quarantined with `id: null`, so
    // matching on the list would miss precisely the entry that needs the pointer cleared. Gated on
    // quarantine.length > 0 so that a launch which repaired nothing keeps the strict check intact:
    // a dangling pointer with no bad record to blame is real corruption and should still be loud.
    currentTrackingEntryId = null;
  }
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

import type {
  ActivityType,
  AppState,
  DayOfWeek,
  Goal,
  GoalPriority,
  GoalStatus,
  Preferences,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
} from '../core/types';
import { createDefaultActivityTypes } from '../core/engine/defaults';
import { DEFAULT_WEEK_STARTS_ON } from '../core/utils/time';

export const APP_STORAGE_KEY = 'zenroutine-storage';
/**
 * Side-car key holding tracking entries that hydration could not read. It is deliberately a
 * separate key from APP_STORAGE_KEY: the store overwrites its own blob on the next write, so
 * anything quarantined has to be copied somewhere the store does not own before that happens.
 */
export const QUARANTINE_STORAGE_KEY = 'zenroutine-quarantine';
/**
 * v6 (#60) removed `RoutineBlock.goalId`; see BLOCK_GOAL_REMOVED_SCHEMA_VERSION. v5 (#44) added
 * `preferences`. v4 was the first version written under the strict invariants below; see
 * STRICT_SCHEMA_VERSION.
 */
export const CURRENT_SCHEMA_VERSION = 6;
/**
 * The first schema version whose routine blocks cannot name a goal (#60: the routine is made of
 * activity types only). Every blob below it may carry `goalId` on a block, and the v5 -> v6 step
 * drops it — never honours it — whatever it points at. A subtractive migration, so like v5 it
 * gates only itself and leaves the repair gate where it was.
 */
export const BLOCK_GOAL_REMOVED_SCHEMA_VERSION = 6;
/**
 * The first schema version whose blobs were written by the strict store, and so the version the
 * lenient legacy repairs stop at. Deliberately NOT `CURRENT_SCHEMA_VERSION`: bumping the schema
 * for an additive field must not start silently rewriting records in a v4 blob that was already
 * valid. Every `version < STRICT_SCHEMA_VERSION` gate below is a repair gate; additive migrations
 * compare against their own version.
 */
export const STRICT_SCHEMA_VERSION = 4;
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

/**
 * Where the `endTime` given to a force-closed legacy open entry came from.
 *
 * The distinction is the whole point of reporting a repair at all: `lastUpdated` is a reconstruction
 * from real evidence, while `none` means the migration found nothing that outlived `startTime` and
 * the entry genuinely closes at zero. A user looking at a corrected history needs to know which.
 */
export type RepairEvidence =
  /** The record's own `updatedAt` was later than its `startTime`, so the entry was alive that long. */
  | 'lastUpdated'
  /** `updatedAt` ran past the moment the user started tracking something else; clamped back to it. */
  | 'nextEntryStart'
  /** Nothing recorded outlived `startTime`. The entry closes with zero duration, honestly. */
  | 'none';

/**
 * A tracking entry hydration kept in live state but had to alter. The mirror of
 * `QuarantinedTrackingEntry`, and deliberately a *separate* channel from it rather than a reuse of
 * the same array: a quarantined record is gone from live state and preserved verbatim, a repaired
 * record is present in live state and no longer verbatim. Those need different sentences to the
 * user — "we couldn't read it, so it was set aside" is simply false about a repaired entry — and
 * folding them together would make the existing quarantine notice lie.
 */
export interface RepairedTrackingEntry {
  /** Position in the persisted trackingEntries array, as for a quarantined record. */
  index: number;
  /** Repaired entries parsed cleanly, so the id is always readable — unlike a quarantined one. */
  id: string;
  /** What was wrong and what was done about it, in terms the side-car can be read back with. */
  reason: string;
  /** The endTime this migration chose. */
  closedAt: string;
  /** What `closedAt` was derived from. */
  evidence: RepairEvidence;
  /**
   * The record exactly as it was stored. A repair is a reconstruction, not a fact, so the original
   * has to outlive it: the app blob is rewritten without it on the very next write, and then this
   * is the only evidence left of what the user's device actually held.
   */
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
  /**
   * Entries this hydration kept but altered. Optional because generations written before repairs
   * were reported have none, and a reader must not treat their absence as corruption.
   */
  repairs?: RepairedTrackingEntry[];
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
  quarantinedAt = new Date().toISOString(),
  repairs: readonly RepairedTrackingEntry[] = []
): QuarantineArchive {
  const generations = [
    ...archive.generations,
    {
      quarantinedAt,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      entries: [...entries],
      // Omitted entirely when empty, so a quarantine-only generation serialises exactly as it did
      // before repairs existed and the archive stays diffable against older devices.
      ...(repairs.length > 0 ? { repairs: [...repairs] } : {}),
    },
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
  /**
   * When supplied, legacy repairs that alter a record the user authored are pushed here so the
   * caller can tell them about it.
   *
   * Note the asymmetry with `quarantine`: omitting that sink makes an unreadable record *throw*,
   * but omitting this one does not make a repair throw. The repair is the legacy path's job and
   * happens either way — a v1 blob has no other route into the app. The sink only decides whether
   * anybody gets told. Backup import (`decodeBackup`) passes no options and relies on exactly
   * this: a legacy backup still imports, it just has no UI to announce the repair to.
   */
  repairs?: RepairedTrackingEntry[];
}

export function createDefaultPreferences(): Preferences {
  return { weekStartsOn: DEFAULT_WEEK_STARTS_ON };
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
    preferences: createDefaultPreferences(),
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
    preferences: state.preferences,
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

/**
 * The v5 -> v6 step (#60): a block's `goalId` is dropped before the block is read.
 *
 * Dropped unread, not validated first: a block's goal link carries no meaning any more, so a
 * dangling or mistyped one is no reason to fail hydration or an import. The goal itself, and any
 * tracking entry's own `goalId`, are untouched — only the plan stops naming goals.
 */
function dropBlockGoal(record: UnknownRecord): UnknownRecord {
  if (!('goalId' in record)) return record;
  const { goalId: _dropped, ...block } = record;
  return block;
}

function parseRoutineBlock(value: unknown, version: number): RoutineBlock {
  const stored = readRecord(value, 'routine block');
  // At v6 and later the key is simply unknown, and unknown keys are ignored like everywhere else
  // in this file: the block below is built field by field, so nothing unread survives the parse.
  const record = version < BLOCK_GOAL_REMOVED_SCHEMA_VERSION ? dropBlockGoal(stored) : stored;
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

/**
 * Preferences arrived in v5 (#44). A blob or backup written before that has none and gets the
 * defaults, which is the whole v4 -> v5 migration. At v5 a missing or unreadable preference also
 * falls back to its default, field by field, rather than failing hydration: like
 * `capacityChangedAt`, a preference has a defined fallback and is never worth locking the user
 * out of their own data. Unknown keys are dropped, so a future field is opted in here deliberately.
 */
function readPreferences(record: UnknownRecord): Preferences {
  const defaults = createDefaultPreferences();
  const value = record.preferences;
  if (!isRecord(value)) return defaults;
  return {
    weekStartsOn:
      value.weekStartsOn === 0 || value.weekStartsOn === 1
        ? value.weekStartsOn
        : defaults.weekStartsOn,
  };
}

function parseRoutine(value: unknown, version: number): Routine {
  const record = readRecord(value, 'routine');
  return {
    id: readString(record, 'id'),
    name: readString(record, 'name'),
    isActive: readBoolean(record, 'isActive'),
    blocks: readArray(record, 'blocks').map((block) => parseRoutineBlock(block, version)),
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

const REPAIR_REASON: Record<RepairEvidence, string> = {
  lastUpdated:
    'Open tracking entry closed at its last-updated time: only one entry can be open',
  nextEntryStart:
    'Open tracking entry closed at the next entry\'s start time: only one entry can be open',
  none:
    'Open tracking entry closed at its start time: nothing recorded outlived it',
};

/**
 * Pick the `endTime` for a legacy open entry that has to be closed so that one timer can stay
 * running, and say where that time came from.
 *
 * Two rules, and they are deliberately asymmetric:
 *
 * 1. **Never destroy evidenced duration.** `updatedAt` is stamped every time the app touches the
 *    record, so a value later than `startTime` is a moment the entry demonstrably still existed.
 *    Closing before it throws away time the user actually worked — the defect this repairs, which
 *    closed every stranded entry at `startTime` and zeroed it.
 * 2. **Never invent duration.** Another entry starting later proves the open one was *over* by
 *    then; it does not prove it ran that long. So a following entry is only ever an upper bound
 *    that clamps `updatedAt` back, never a source that extends it. Treating it as a source would
 *    be the same error as (1) with the sign flipped — writing minutes the user never worked into
 *    their history, which then feed goal progress.
 *
 * When neither rule yields anything — `updatedAt` at or before `startTime`, which is what a blob
 * written by a version that never updated the record looks like — the entry closes at `startTime`
 * with `evidence: 'none'`. That is a zero duration, but it is an *honest* zero rather than a
 * discarded one, and the repair report says so. A blanket "never close at startTime" is not
 * available: with no evidence at all, any later time would be invented.
 *
 * The bound is taken across every entry, not only entries for the same activity. The v4 invariant
 * ("only one entry can be open") is what makes a later start meaningful at all — it is evidence
 * about the *timer*, not about the activity — and a same-activity-only bound would be strictly
 * looser with no better justification. Clamping can only ever shorten, so a bound drawn from an
 * overlapping retroactive manual entry is conservative rather than wrong.
 */
function closeStrandedOpenEntry(
  entry: TrackingEntry,
  allEntries: readonly TrackingEntry[]
): { endTime: string; evidence: RepairEvidence } {
  const startedAt = Date.parse(entry.startTime);
  const lastUpdated = Date.parse(entry.updatedAt);
  // Both are validated ISO date-times by the time this runs, so neither parse can be NaN; the
  // comparison is written to fail closed regardless.
  if (!(lastUpdated > startedAt)) {
    return { endTime: entry.startTime, evidence: 'none' };
  }

  const nextStart = allEntries.reduce<{ at: number; iso: string } | null>((earliest, other) => {
    if (other.id === entry.id) return earliest;
    const otherStart = Date.parse(other.startTime);
    if (!(otherStart > startedAt)) return earliest;
    return earliest === null || otherStart < earliest.at
      ? { at: otherStart, iso: other.startTime }
      : earliest;
  }, null);

  if (nextStart !== null && nextStart.at < lastUpdated) {
    return { endTime: nextStart.iso, evidence: 'nextEntryStart' };
  }
  return { endTime: entry.updatedAt, evidence: 'lastUpdated' };
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
  /**
   * Only records dropped by *this* call may be blamed for this call's dangling pointers.
   *
   * The sink is shared across a whole hydration: persist runs `migrate` and then `merge`, both
   * pushing into the same array, and it is reset once per attempt rather than once per stage.
   * Without this offset a record dropped during `migrate` could excuse a pointer that only went
   * dangling during `merge` — a different stage looking at different data — which is a wider
   * gate than the blame relationship is meant to be. Scoping the read, rather than resetting the
   * array, keeps the accumulated report intact for the user.
   */
  const quarantineStartIndex = quarantine?.length ?? 0;
  const record = readRecord(persistedState, 'persisted state');
  const activityTypes = readArray(record, 'activityTypes').map(
    (value) => parseActivityType(value, version < 2)
  );
  const goals = readArray(record, 'goals').map(
    (value) => parseGoal(value, version < 3, version < STRICT_SCHEMA_VERSION)
  );
  const routines = readArray(record, 'routines').map((routine) => parseRoutine(routine, version));
  // A single unreadable tracking entry must not be able to take the whole store down with it.
  // Everything above stays strict: activity types, goals and routines are the skeleton the rest
  // of the state hangs off, and a store missing one of those is not a store worth opening.
  // Tracking entries are a flat list where each record stands alone, so one bad row can be set
  // aside while the remaining history loads normally. `trackingEntries` not being an array at
  // all still throws — that is blob-level corruption, not one bad row.
  //
  // `entryOrigins` remembers where each surviving entry came from, so that an entry set aside
  // further down for a *linkage* failure rather than a parse failure still reaches the side-car
  // with its original index and its record exactly as it was stored.
  const entryOrigins = new Map<string, { index: number; record: unknown }>();
  let trackingEntries: TrackingEntry[] = readArray(record, 'trackingEntries')
    .flatMap<TrackingEntry>((value, index) => {
      try {
        const entry = parseTrackingEntry(value, version < STRICT_SCHEMA_VERSION);
        entryOrigins.set(entry.id, { index, record: value });
        return [entry];
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

  /**
   * Set aside tracking entries whose references no longer resolve.
   *
   * A linkage failure is not a defect in the record: the entry parsed perfectly, with valid
   * dates and a valid source. What broke is the store around it — a goal, routine block or
   * activity type is no longer in the blob, because of a torn AsyncStorage write during a
   * delete, a hand-edited blob, or a restore that dropped a record. Throwing on that made every
   * subsequent launch fail identically, leaving the destructive reset as the user's only exit
   * (issue #3's failure mode reached by a different corruption shape). So a stale reference is
   * routed to the same side-car a parse failure is: out of live state, and never destroyed.
   *
   * With no sink this still throws. That is the backup-import path, a deliberate act on a file
   * the user can re-choose, and it must fail loudly rather than quietly shed records.
   */
  const quarantineEntries = (
    referenceIsStale: (entry: TrackingEntry) => boolean,
    reason: string
  ): void => {
    const stale = trackingEntries.filter(referenceIsStale);
    if (stale.length === 0) return;
    if (!quarantine) throw new Error(reason);
    for (const entry of stale) {
      const origin = entryOrigins.get(entry.id);
      quarantine.push({
        // The parse loop records an origin for every entry that reaches live state, and the
        // repair steps in between rewrite references without touching ids, so a miss here is
        // unreachable. The fallbacks exist because a lookup miss must not become a throw on the
        // hydration path — that is the failure mode this whole mechanism exists to remove.
        index: origin?.index ?? -1,
        id: entry.id,
        reason,
        record: origin?.record ?? entry,
      });
    }
    const staleIds = new Set(stale.map((entry) => entry.id));
    trackingEntries = trackingEntries.filter((entry) => !staleIds.has(entry.id));
  };

  if (goals.some((goal) => !activityIds.has(goal.activityTypeId))) {
    throw new Error('Invalid goals: referenced activity type does not exist');
  }
  if (routines.some((routine) => routine.blocks.some(
    (block) => !activityIds.has(block.activityTypeId)
  ))) {
    throw new Error('Invalid routines: referenced activity type does not exist');
  }
  // Unlike the goalId and routineBlockId checks below, this one has no lenient repair to fall
  // back to at legacy versions: activityTypeId is required on a TrackingEntry, so there is no
  // clearing it the way an optional reference can be cleared. Quarantining *is* the repair, and
  // it therefore applies at every version — a legacy blob has no better answer available either.
  quarantineEntries(
    (entry) => !activityIds.has(entry.activityTypeId),
    'Invalid tracking entry: referenced activity type does not exist'
  );

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  // There is no routine-block counterpart to this check any more. Blocks used to be checked the
  // same way — cleared below v4, a thrown error from v4 on — but #60 drops a block's goalId in
  // `parseRoutineBlock` before this point, so a dangling block goal is no longer something the
  // blob can hold in live state, and refusing to open over a field that is being discarded anyway
  // would lock the user out for nothing.
  const entryGoalIsInvalid = (entry: TrackingEntry) => {
    if (!entry.goalId) return false;
    const goal = goalsById.get(entry.goalId);
    return !goal || goal.activityTypeId !== entry.activityTypeId;
  };
  if (version < STRICT_SCHEMA_VERSION) {
    // Legacy repair is kept, and is deliberately preferred over quarantining: clearing an
    // optional reference keeps the entry — and its minutes — in the user's history, which is
    // strictly better than setting the whole record aside. It is only available here because a
    // pre-v4 blob is expected to be sloppy; at current version a silent rewrite of a record the
    // user did not touch is exactly what the version gate exists to prevent.
    if (trackingEntries.some(entryGoalIsInvalid)) {
      trackingEntries = trackingEntries.map((entry) =>
        entryGoalIsInvalid(entry) ? { ...entry, goalId: undefined } : entry
      );
    }
  } else {
    quarantineEntries(
      entryGoalIsInvalid,
      'Invalid tracking entry goal: goal is missing or uses another activity type'
    );
  }

  const routineBlocksById = new Map(
    routines.flatMap((routine) => routine.blocks).map((block) => [block.id, block])
  );
  /**
   * An entry's block must exist and be of the entry's activity type. It used to also have to agree
   * with a goal-linked block's goal; with blocks no longer naming goals (#60) that half is gone,
   * rather than judged against the goalId the v5 -> v6 step dropped. An entry started from a block
   * may be for any goal of that type, or none, so a pre-v6 disagreement is not a fault to repair
   * or quarantine over — the entry keeps both its goal and its block.
   */
  const entryRoutineBlockIsInvalid = (entry: TrackingEntry) => {
    if (!entry.routineBlockId) return false;
    const block = routineBlocksById.get(entry.routineBlockId);
    return !block || block.activityTypeId !== entry.activityTypeId;
  };
  if (version < STRICT_SCHEMA_VERSION) {
    if (trackingEntries.some(entryRoutineBlockIsInvalid)) {
      trackingEntries = trackingEntries.map((entry) =>
        entryRoutineBlockIsInvalid(entry)
          ? { ...entry, routineBlockId: undefined }
          : entry
      );
    }
  } else {
    quarantineEntries(
      entryRoutineBlockIsInvalid,
      'Invalid tracking entry routineBlockId: block is missing or does not match the entry'
    );
  }

  // Computed here rather than alongside activityIds and routineIds: the linkage phase above
  // removes entries, and the pointer checks below have to be judged against what actually
  // survived into live state, not against what the blob started with.
  const entryIds = new Set(trackingEntries.map((entry) => entry.id));
  let activeRoutineId = readNullableId(record, 'activeRoutineId');
  let currentTrackingEntryId = readNullableId(record, 'currentTrackingEntryId');
  /**
   * Can something this pass quarantined actually be blamed for the pointer no longer resolving?
   * Only a dropped record that *could have been* the record the pointer named counts:
   *
   * - `id` matched the pointer — the entry the timer named is exactly what was dropped.
   * - `id` is null — the record failed on the id field itself, so what it was called is unknown
   *   and it cannot be ruled out. This is the case that matching on ids alone would miss, and it
   *   is why the check is not a plain `quarantine.some((dropped) => dropped.id === pointer)`.
   *
   * A dropped record with a readable id that is some *other* entry explains nothing about this
   * pointer, and must not buy it a silent clear.
   *
   * Read from `quarantineStartIndex` on, so only this stage's drops can answer for this stage's
   * pointer. See the note there.
   */
  const quarantineCanExplainPointer = (pointer: string) =>
    quarantine !== undefined &&
    quarantine
      .slice(quarantineStartIndex)
      .some((dropped) => dropped.id === pointer || dropped.id === null);
  if (
    currentTrackingEntryId !== null &&
    !entryIds.has(currentTrackingEntryId) &&
    quarantineCanExplainPointer(currentTrackingEntryId)
  ) {
    // The running timer pointed at a record that is no longer here, and a record this pass
    // quarantined can be blamed for that. Clearing the pointer is what makes quarantining
    // actually work: leaving it would trip the strict currentTrackingEntryId check below and
    // brick hydration for exactly the reason we are trying to fix.
    //
    // Gated on the blame relationship, not merely on something having been quarantined: a
    // dangling pointer with no bad record to blame is real corruption and should still be loud.
    currentTrackingEntryId = null;
  }
  const hasInvalidActiveRoutine = activeRoutineId !== null && !routineIds.has(activeRoutineId);
  const openEntries = trackingEntries.filter((entry) => entry.endTime === undefined);
  if (version < STRICT_SCHEMA_VERSION) {
    if (hasInvalidActiveRoutine) activeRoutineId = null;
    const selectedOpenEntry = openEntries.find(
      (entry) => entry.id === currentTrackingEntryId
    ) ?? openEntries.at(-1);
    currentTrackingEntryId = selectedOpenEntry?.id ?? null;
    /**
     * Close every open entry except the one that stays resumable.
     *
     * This used to be `endTime: entry.startTime` unconditionally, which recorded a zero duration
     * for work the user really did and said nothing about it (issue #4). The contract now is:
     * close at the last moment there is evidence for, and report every entry closed this way.
     *
     * The close times are all computed against `trackingEntries` *before* any of them is applied,
     * so the bound each stranded entry is clamped by is the persisted history, not a history this
     * loop has already been rewriting. Otherwise the result would depend on iteration order.
     */
    const stranded = openEntries.filter((entry) => entry.id !== currentTrackingEntryId);
    if (stranded.length > 0) {
      const closures = new Map(
        stranded.map((entry) => [entry.id, closeStrandedOpenEntry(entry, trackingEntries)])
      );
      const repairs = options?.repairs;
      if (repairs) {
        for (const entry of stranded) {
          const closure = closures.get(entry.id)!;
          const origin = entryOrigins.get(entry.id);
          repairs.push({
            // As in `quarantineEntries`: every entry that reached live state has an origin, and the
            // fallbacks exist only so a lookup miss cannot become a throw on the hydration path.
            index: origin?.index ?? -1,
            id: entry.id,
            reason: REPAIR_REASON[closure.evidence],
            closedAt: closure.endTime,
            evidence: closure.evidence,
            record: origin?.record ?? entry,
          });
        }
      }
      trackingEntries = trackingEntries.map((entry) => {
        const closure = closures.get(entry.id);
        return closure ? { ...entry, endTime: closure.endTime } : entry;
      });
    }
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
    : version < STRICT_SCHEMA_VERSION
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
    preferences: readPreferences(record),
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

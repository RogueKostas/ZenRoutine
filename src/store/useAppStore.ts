import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  ActivityType,
  Goal,
  GoalStatus,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
  DayOfWeek,
  Preferences,
  WeekStartsOn,
  toRoutineBlock,
} from '../core/types';
import { generateId } from '../core/utils/id';
import { createDefaultActivityTypes } from '../core/engine/defaults';
import {
  moveGoalInList,
  nextGoalOrder,
  removeGoalFromList,
  renumberGoals,
} from '../core/engine/goalOrder';
import type { GoalMoveTarget } from '../core/engine/goalOrder';
import {
  getTrackingEntryDurationMinutes,
  isTrackingEntryPaused,
  parseLocalDateKey,
  toLocalDateKey,
} from '../core/utils/time';
import {
  findOverlappingBlocks,
  validateRoutineBlock,
} from '../core/engine/validation';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  QUARANTINE_STORAGE_KEY,
  appendQuarantineGeneration,
  createInitialState,
  decodeBackup,
  describeInvalidPauses,
  encodeBackup,
  migratePersistedState,
  parseQuarantineArchive,
  selectPersistedAppState,
} from './persistence';
import {
  SAMPLE_ROUTINE_NAME,
  buildSampleData,
  missingSampleActivityTypes,
} from './sampleData';
import type {
  QuarantineArchive,
  QuarantinedTrackingEntry,
  RepairedTrackingEntry,
} from './persistence';

export type ImportResult =
  | { ok: true }
  | { ok: false; error: string };

/** `reason` is a sentence fit to show the user. */
export type RoutineBlocksUpdateResult =
  | { ok: true }
  | { ok: false; reason: string };

/** A goal edit. `null` removes the optional type or estimate (#50); leaving a key out keeps it. */
export type GoalUpdate = Partial<
  Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'activityTypeId' | 'estimatedMinutes'>
> & {
  activityTypeId?: string | null;
  estimatedMinutes?: number | null;
};

export type HydrationSnapshot =
  | { status: 'idle' | 'loading' | 'ready'; error: null }
  | { status: 'error'; error: string };

const hydrationListeners = new Set<() => void>();
let hydrationSnapshot: HydrationSnapshot = { status: 'idle', error: null };
let hydrationRun: Promise<void> | null = null;
let hydrationFailure: unknown = null;

// Reference-stable empty result. getQuarantinedTrackingEntries feeds useSyncExternalStore, which
// treats a fresh [] on every read as a changed snapshot and re-renders forever.
const NO_QUARANTINE: readonly QuarantinedTrackingEntry[] = [];
let quarantinedTrackingEntries: readonly QuarantinedTrackingEntry[] = NO_QUARANTINE;
// Shared sink for one hydration attempt. Both persist stages can drop records — `migrate` for a
// blob stamped with an older schema version, `merge` for the strict re-read that always runs —
// and the user should be told about all of them, not just the last stage to find one.
let pendingQuarantine: QuarantinedTrackingEntry[] = [];

// The repair channel, kept separate from the quarantine one all the way to the screen. A repaired
// entry is *in* live state with an altered endTime; a quarantined one is absent and preserved
// verbatim. Same plumbing, opposite facts, so they cannot share a report without one of the two
// user-facing sentences being false. Reference-stable empty value for the same reason as above.
const NO_REPAIRS: readonly RepairedTrackingEntry[] = [];
let repairedTrackingEntries: readonly RepairedTrackingEntry[] = NO_REPAIRS;
let pendingRepairs: RepairedTrackingEntry[] = [];

/**
 * Tracking entries the last hydration could not read and therefore left out of live state.
 * Deliberately kept off HydrationSnapshot so the existing hydration contract is unchanged.
 */
export function getQuarantinedTrackingEntries(): readonly QuarantinedTrackingEntry[] {
  return quarantinedTrackingEntries;
}

/**
 * Tracking entries the last hydration kept but altered — currently only legacy open timers that
 * had to be closed so one could stay running. These are in live state; what changed is recorded
 * here and durably in the side-car, so the repair is not a silent rewrite of the user's history.
 */
export function getRepairedTrackingEntries(): readonly RepairedTrackingEntry[] {
  return repairedTrackingEntries;
}

/**
 * Drop both reports after the state they described has been replaced wholesale (reset or import).
 * The durable QUARANTINE_STORAGE_KEY copy is left alone — this clears the notices, not the data.
 */
function clearHydrationReports(): void {
  if (quarantinedTrackingEntries === NO_QUARANTINE && repairedTrackingEntries === NO_REPAIRS) {
    return;
  }
  quarantinedTrackingEntries = NO_QUARANTINE;
  repairedTrackingEntries = NO_REPAIRS;
  hydrationListeners.forEach((listener) => listener());
}

/**
 * Read the quarantine side-car. A storage failure here yields an empty archive rather than
 * throwing, so a launch that cannot read the side-car still opens; the cost is that the append
 * below starts a fresh archive, which is the best available outcome when the old one is
 * unreachable anyway.
 */
async function readQuarantineArchive(): Promise<QuarantineArchive> {
  try {
    return parseQuarantineArchive(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY));
  } catch (error) {
    console.warn('ZenRoutine could not read the quarantine archive', error);
    return parseQuarantineArchive(null);
  }
}

/**
 * Stable identity for a value read back out of JSON, used to recognise the same quarantined
 * record arriving again on a later launch. Object keys are sorted, so the identity does not
 * depend on the property order the stored blob happened to use.
 */
function quarantineFingerprint(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return `[${value.map(quarantineFingerprint).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${quarantineFingerprint(nested)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Copy quarantined records to the side-car, skipping records an earlier generation already holds.
 *
 * This is the chosen fix for the generation-rotation half of #18 — option 2, an idempotent
 * side-car — and it is preferred over cleaning the record out of the app blob (option 1) because
 * it does not depend on a write succeeding. A quarantine that cannot be cleaned up (a full disk,
 * a blob write that fails) is exactly the case where the record is re-read on every launch, so a
 * fix that only works when the cleanup write lands does not cover its own worst case. Skipping
 * costs a read the hydration path already performs and writes nothing at all in the repeat case.
 *
 * Consequence for the cap in `appendQuarantineGeneration`: a given set of bad records can consume
 * at most one generation however many times it is re-read, so twenty cold starts over one
 * uncleaned record can no longer rotate an unrelated earlier generation off the end. (The comment
 * on MAX_QUARANTINE_GENERATIONS calling the cap "realistically unreachable" was wrong when it was
 * written — re-quarantining on every launch was the repeating source it said did not exist. It
 * lives in persistence.ts, which this lane must not edit; correcting it is owed there.)
 *
 * Deliberately compares whole generations rather than individual records: a launch that sees a
 * second record go bad reports both together, which is a genuinely new event worth its own
 * generation. What is suppressed is only the identical set arriving again.
 *
 * When it does write, it appends rather than replacing. Overwriting would mean a second
 * quarantine event destroys what the first one saved, and by then those records may already be
 * gone from the store's own blob — precisely the silent data loss the side-car exists to stop.
 */
async function persistHydrationReports(
  entries: readonly QuarantinedTrackingEntry[],
  repairs: readonly RepairedTrackingEntry[] = []
): Promise<void> {
  if (entries.length === 0 && repairs.length === 0) return;
  const archive = await readQuarantineArchive();
  // Fingerprints the pair, so a launch that quarantines the same records but repairs something new
  // is still recognised as a new event. `?? []` is what lets a generation written before repairs
  // existed compare equal to a quarantine-only generation written now.
  const fingerprint = quarantineFingerprint([entries, repairs]);
  const alreadyArchived = archive.generations.some(
    (generation) =>
      quarantineFingerprint([generation.entries, generation.repairs ?? []]) === fingerprint
  );
  if (alreadyArchived) return;
  await AsyncStorage.setItem(
    QUARANTINE_STORAGE_KEY,
    JSON.stringify(appendQuarantineGeneration(archive, entries, undefined, repairs))
  );
}

function publishHydrationSnapshot(next: HydrationSnapshot): void {
  hydrationSnapshot = next;
  hydrationListeners.forEach((listener) => listener());
}

export function getHydrationSnapshot(): HydrationSnapshot {
  return hydrationSnapshot;
}

export function subscribeHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

function createDefaultRoutine(now = new Date().toISOString()): Routine {
  return {
    id: generateId(),
    name: 'My Week',
    isActive: true,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createInitializedState(): AppState {
  return ensureRequiredDefaults(createInitialState());
}

function ensureRequiredDefaults(state: AppState): AppState {
  const needsActivities = state.activityTypes.length === 0;
  const needsRoutine = state.routines.length === 0;
  if (!needsActivities && !needsRoutine) return state;
  const routine = needsRoutine ? createDefaultRoutine() : undefined;
  return {
    ...state,
    activityTypes: needsActivities ? createDefaultActivityTypes() : state.activityTypes,
    routines: routine ? [routine] : state.routines,
    activeRoutineId: routine?.id ?? state.activeRoutineId,
  };
}

/**
 * `goal` with its optional type and estimate set to exactly these values (#50). An unset field is
 * left off the object rather than stored as `undefined`, so an edited goal has the same shape as
 * one read back from storage.
 */
function withGoalTypeAndEstimate(
  goal: Goal,
  activityTypeId: string | undefined,
  estimatedMinutes: number | undefined
): Goal {
  const { activityTypeId: _type, estimatedMinutes: _estimate, ...rest } = goal;
  return {
    ...rest,
    ...(activityTypeId !== undefined ? { activityTypeId } : {}),
    ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
  };
}

/**
 * A goal's progress after its logged time or estimate changes. With no estimate (#50) there is
 * nothing to meet: the goal never completes itself, and removing an estimate does not reopen a
 * goal that is done.
 */
function applyGoalProgressChange(
  goal: Goal,
  nextLoggedMinutes: number,
  nextEstimatedMinutes: number | undefined,
  now: string
): Goal {
  const loggedMinutes = Math.max(0, nextLoggedMinutes);
  const previouslyMetEstimate =
    goal.estimatedMinutes !== undefined && goal.loggedMinutes >= goal.estimatedMinutes;
  const meetsEstimate = nextEstimatedMinutes !== undefined && loggedMinutes >= nextEstimatedMinutes;
  let status = goal.status;
  let completedAt = goal.status === 'completed' ? goal.completedAt : undefined;

  if (meetsEstimate && status !== 'completed') {
    status = 'completed';
    completedAt = now;
  } else if (
    nextEstimatedMinutes !== undefined &&
    !meetsEstimate &&
    previouslyMetEstimate &&
    status === 'completed'
  ) {
    status = 'active';
    completedAt = undefined;
  }

  return {
    ...withGoalTypeAndEstimate(goal, goal.activityTypeId, nextEstimatedMinutes),
    loggedMinutes,
    status,
    completedAt: status === 'completed' ? completedAt ?? now : undefined,
    updatedAt: now,
  };
}

function applyGoalDeltas(
  goals: Goal[],
  deltas: ReadonlyMap<string, number>,
  now: string
): Goal[] {
  if (deltas.size === 0) return goals;
  return goals.map((goal) => {
    const delta = deltas.get(goal.id);
    if (delta === undefined || delta === 0) return goal;
    return applyGoalProgressChange(
      goal,
      goal.loggedMinutes + delta,
      goal.estimatedMinutes,
      now
    );
  });
}

function contributionDelta(
  before: TrackingEntry | undefined,
  after: TrackingEntry | undefined
): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (entry: TrackingEntry | undefined, multiplier: 1 | -1) => {
    if (!entry?.goalId) return;
    const minutes = getTrackingEntryDurationMinutes(entry);
    if (minutes === 0) return;
    deltas.set(entry.goalId, (deltas.get(entry.goalId) ?? 0) + multiplier * minutes);
  };
  add(before, -1);
  add(after, 1);
  return deltas;
}

function blockReferencesAreValid(
  state: AppState,
  block: Pick<RoutineBlock, 'activityTypeId'>
): boolean {
  return state.activityTypes.some((activity) => activity.id === block.activityTypeId);
}

/**
 * Record which activity types just had their scheduled capacity changed.
 *
 * Forecast confidence counts tracking evidence since the schedule that
 * produced it changed. Stamping the whole routine made every goal's evidence
 * collapse whenever any unrelated block moved, so capacity changes are
 * recorded per activity type instead.
 *
 * `routine` must be the pre-mutation routine: activity types that predate this
 * field are seeded with the routine's previous `updatedAt` — the cutoff they
 * were already being read under — so that stamping one activity type does not
 * push the others onto a fresh `updatedAt` through the fallback.
 */
function withCapacityChangedAt(
  routine: Routine,
  changedActivityTypeIds: Iterable<string>,
  now: string
): Record<string, string> {
  const capacityChangedAt: Record<string, string> = { ...routine.capacityChangedAt };
  for (const block of routine.blocks) {
    if (capacityChangedAt[block.activityTypeId] === undefined) {
      capacityChangedAt[block.activityTypeId] = routine.updatedAt;
    }
  }
  for (const activityTypeId of changedActivityTypeIds) {
    capacityChangedAt[activityTypeId] = now;
  }
  return capacityChangedAt;
}

/**
 * The block fields that can move an activity type's scheduled capacity.
 *
 * Editing any of these has to restamp `capacityChangedAt`; editing anything
 * else -- or nothing at all -- must not, because a stamp resets every goal on
 * that activity type to zero tracking evidence. Listed explicitly rather than
 * derived from `RoutineBlock` so that a field added later is opted in
 * deliberately instead of silently collapsing confidence.
 *
 * - `activityTypeId`: moves the whole block between capacity pools.
 * - `dayOfWeek`, `startMinutes`, `endMinutes`: change when, and for how long,
 *   the block is scheduled. (Weekly capacity today sums across the week, so
 *   `dayOfWeek` alone does not change the minute total -- but it does change
 *   the schedule the tracking evidence was gathered against, which is what
 *   confidence measures.)
 *
 * `id` is deliberately absent: it identifies the block, it is not capacity.
 * That is every other field a block has, now that blocks no longer name a goal
 * (#60).
 */
const CAPACITY_RELEVANT_BLOCK_FIELDS: readonly (keyof RoutineBlock)[] = [
  'activityTypeId',
  'dayOfWeek',
  'startMinutes',
  'endMinutes',
];

/**
 * Everything about one block that a forecast can see, as a comparable string.
 *
 * Derived from `CAPACITY_RELEVANT_BLOCK_FIELDS` rather than listing the fields
 * again, so a field opted into that list is compared here too instead of being
 * silently ignored when two routines are compared across an activation.
 */
function blockCapacitySignature(block: RoutineBlock): string {
  return CAPACITY_RELEVANT_BLOCK_FIELDS
    .map((field) => `${field}=${block[field] ?? ''}`)
    .join(',');
}

/** One activity type's whole schedule within a routine, order-independent. */
function activityScheduleSignature(
  routine: Routine | undefined,
  activityTypeId: string
): string {
  return (routine?.blocks ?? [])
    .filter((block) => block.activityTypeId === activityTypeId)
    .map(blockCapacitySignature)
    .sort()
    .join('|');
}

/**
 * Which activity types genuinely change capacity when `incoming` replaces
 * `outgoing` as the active routine.
 *
 * Only the active routine is ever read for a forecast, so activating a routine
 * does change which capacity applies -- but only for the activity types whose
 * schedule actually differs between the two. Switching between routines that
 * schedule Fitness identically must leave Fitness's evidence alone, exactly as
 * re-saving an unchanged block does; switching to a routine that drops Fitness
 * to two hours must reset it. Comparing is what tells those apart.
 *
 * Restricted to the activity types `incoming` schedules: for anything else its
 * weekly capacity is zero, and a forecast never reads a cutoff it has no
 * capacity for.
 *
 * `outgoing` is looked up by `activeRoutineId` because that -- not the
 * `isActive` flag -- is what `useActiveRoutine` resolves, so it is the schedule
 * the evidence was really gathered under.
 */
function activationCapacityChanges(
  outgoing: Routine | undefined,
  incoming: Routine
): string[] {
  const activityTypeIds = new Set(incoming.blocks.map((block) => block.activityTypeId));
  return [...activityTypeIds].filter(
    (activityTypeId) =>
      activityScheduleSignature(outgoing, activityTypeId) !==
      activityScheduleSignature(incoming, activityTypeId)
  );
}

/**
 * What `updateRoutine` is allowed to change.
 *
 * `blocks` and `capacityChangedAt` are excluded because they are capacity, and
 * capacity is only ever written by the four block mutations, which stamp as
 * they go; letting a caller pass either would clobber the map wholesale.
 * `isActive` is excluded because it has a companion, `activeRoutineId`, that
 * only `setActiveRoutine` maintains -- writing the flag here would leave the
 * two disagreeing about which routine a forecast reads.
 */
type RoutineUpdate = Partial<
  Omit<Routine, 'id' | 'createdAt' | 'updatedAt' | 'blocks' | 'isActive' | 'capacityChangedAt'>
>;

/**
 * The fields `updateRoutine` copies across, listed rather than taken from
 * `Object.keys(data)` so that the runtime enforces what `RoutineUpdate`
 * declares. A plain JavaScript caller cannot smuggle `capacityChangedAt`
 * through, and a field added to `Routine` later has to be opted in here
 * deliberately instead of becoming writable by accident.
 */
const UPDATABLE_ROUTINE_FIELDS: readonly (keyof RoutineUpdate)[] = ['name'];

/** The updatable keys of `data` that differ from the value already stored. */
function changedRoutineFields(routine: Routine, data: RoutineUpdate): (keyof RoutineUpdate)[] {
  return UPDATABLE_ROUTINE_FIELDS.filter(
    (field) => data[field] !== undefined && data[field] !== routine[field]
  );
}

/** The latest of some ISO date-times, as written. Unparseable values are ignored. */
function latestMoment(moments: readonly string[]): string {
  let latest = moments[moments.length - 1];
  for (const moment of moments) {
    if (Date.parse(moment) > Date.parse(latest)) latest = moment;
  }
  return latest;
}

function trackingEntryIsValid(state: AppState, entry: TrackingEntry): boolean {
  try {
    parseLocalDateKey(entry.date);
  } catch {
    return false;
  }
  const start = Date.parse(entry.startTime);
  const end = entry.endTime ? Date.parse(entry.endTime) : undefined;
  if (!Number.isFinite(start) || (end !== undefined && (!Number.isFinite(end) || end <= start))) {
    return false;
  }
  if (describeInvalidPauses(entry) !== null) return false;
  const activityExists = state.activityTypes.some(
    (activity) => activity.id === entry.activityTypeId
  );
  if (!activityExists) return false;
  if (entry.goalId) {
    const goal = state.goals.find((candidate) => candidate.id === entry.goalId);
    if (goal?.activityTypeId !== entry.activityTypeId) return false;
  }
  if (entry.routineBlockId) {
    const routineBlock = state.routines
      .flatMap((routine) => routine.blocks)
      .find((block) => block.id === entry.routineBlockId);
    if (!routineBlock || routineBlock.activityTypeId !== entry.activityTypeId) return false;
  }
  return true;
}

// Action types
interface AppActions {
  // Activity Type Actions
  addActivityType: (data: Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateActivityType: (id: string, data: Partial<Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteActivityType: (id: string) => void;
  reorderActivityTypes: (ids: string[]) => void;

  // Goal Actions
  /**
   * Adds the goal at the bottom of the list. Only the name is required (#50): the type and the
   * estimate may be left out.
   */
  addGoal: (data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'loggedMinutes' | 'status' | 'order'>) => string | null;
  /**
   * Cannot move a goal: list position changes only through `moveGoal`. `null` removes the type or
   * the estimate; a type cannot change, or be removed, while tracking entries are linked to the goal.
   */
  updateGoal: (id: string, data: GoalUpdate) => void;
  /** The other goals keep their relative order. */
  deleteGoal: (id: string) => void;
  /**
   * Reprioritise: move a goal to just before or after another goal in the one goals list (#49).
   * Named by neighbour, not index, so a drag in a list filtered to one activity type can say where
   * the row landed without knowing where the hidden goals are. Hidden goals keep their places
   * relative to each other.
   */
  moveGoal: (goalId: string, target: GoalMoveTarget) => void;
  logMinutesToGoal: (id: string, minutes: number) => void;
  setGoalStatus: (id: string, status: GoalStatus) => void;

  // Routine Actions
  addRoutine: (name: string) => string;
  updateRoutine: (id: string, data: RoutineUpdate) => void;
  deleteRoutine: (id: string) => void;
  setActiveRoutine: (id: string | null) => void;
  duplicateRoutine: (id: string, newName: string) => string | null;

  // Routine Block Actions
  addRoutineBlock: (routineId: string, block: Omit<RoutineBlock, 'id'>) => string | null;
  updateRoutineBlock: (routineId: string, blockId: string, data: Partial<Omit<RoutineBlock, 'id'>>) => void;
  /**
   * Several block edits as one write, validated together (a shared boundary moves two blocks at
   * once, and neither edit is valid alone). All or nothing: on refusal nothing changes.
   */
  updateRoutineBlocks: (
    routineId: string,
    updates: ReadonlyArray<{ id: string; data: Partial<Omit<RoutineBlock, 'id'>> }>
  ) => RoutineBlocksUpdateResult;
  deleteRoutineBlock: (routineId: string, blockId: string) => void;
  copyDayBlocks: (routineId: string, fromDay: DayOfWeek, toDays: DayOfWeek[]) => void;

  // Tracking Entry Actions
  startTracking: (data: {
    activityTypeId: string;
    goalId?: string;
    routineBlockId?: string;
    source: TrackingSource;
    notes?: string;
  }) => string | null;
  /**
   * Stops the entry. A pause that is still open closes at the stop time, so paused time is never
   * counted (#54).
   */
  stopTracking: (id?: string) => void;
  /**
   * Pauses the running entry (#54, p77). Does nothing when it is already paused or has ended: at
   * most one pause is ever open. A pomodoro break is not a pause and never calls this.
   */
  pauseTracking: (id?: string) => void;
  /** Closes the running entry's open pause. Does nothing when it is not paused. */
  resumeTracking: (id?: string) => void;
  addCompletedEntry: (
    data: Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt' | 'endTime'> & {
      endTime: string;
    }
  ) => string | null;
  updateTrackingEntry: (id: string, data: Partial<Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteTrackingEntry: (id: string) => void;

  // State Management
  resetState: () => Promise<void>;
  initializeDefaults: () => void;
  completeOnboarding: () => void;
  setWeekStartsOn: (weekStartsOn: WeekStartsOn) => void;
  /** Settings → Pomodoro timer (#53). Off leaves a plain running timer. */
  setPomodoroEnabled: (enabled: boolean) => void;
  exportData: () => string;
  importData: (serialized: string) => Promise<ImportResult>;

  // Debug helpers
  _addSampleData: () => boolean;
}

export type AppStore = AppState & AppActions;

const appStorage = createJSONStorage<AppState>(() => AsyncStorage);

async function persistSnapshot(state: AppState): Promise<void> {
  if (!appStorage) {
    throw new Error('Local storage is unavailable.');
  }
  await appStorage.setItem(APP_STORAGE_KEY, {
    state: selectPersistedAppState(state),
    version: CURRENT_SCHEMA_VERSION,
  });
}

export const useAppStore = create<AppStore>()(
  persist<AppStore, [], [], AppState>(
    (set, get) => ({
      // Initial State
      ...createInitialState(),

      // ============================================
      // Activity Type Actions
      // ============================================
      addActivityType: (data) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newActivityType: ActivityType = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          activityTypes: [...state.activityTypes, newActivityType],
        }));
        return id;
      },

      updateActivityType: (id, data) => {
        set((state) => ({
          activityTypes: state.activityTypes.map((at) =>
            at.id === id
              ? { ...at, ...data, updatedAt: new Date().toISOString() }
              : at
          ),
        }));
      },

      deleteActivityType: (id) => {
        const state = get();
        // Prevent deletion if activity type is in use
        const isInUseByGoal = state.goals.some((g) => g.activityTypeId === id);
        const isInUseByRoutine = state.routines.some((r) =>
          r.blocks.some((b) => b.activityTypeId === id)
        );
        const isInUseByEntry = state.trackingEntries.some(
          (e) => e.activityTypeId === id
        );

        if (isInUseByGoal || isInUseByRoutine || isInUseByEntry) {
          console.warn('Cannot delete activity type that is in use');
          return;
        }

        set((state) => ({
          activityTypes: state.activityTypes.filter((at) => at.id !== id),
        }));
      },

      reorderActivityTypes: (ids) => {
        set((state) => ({
          activityTypes: state.activityTypes
            .map((at) => ({
              ...at,
              sortOrder: ids.indexOf(at.id),
              updatedAt: new Date().toISOString(),
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      },

      // ============================================
      // Goal Actions
      // ============================================
      addGoal: (data) => {
        const state = get();
        if (
          !data.name.trim() ||
          (data.estimatedMinutes !== undefined &&
            (!Number.isInteger(data.estimatedMinutes) || data.estimatedMinutes <= 0)) ||
          (data.activityTypeId !== undefined &&
            !state.activityTypes.some((activity) => activity.id === data.activityTypeId))
        ) {
          return null;
        }
        const id = generateId();
        const now = new Date().toISOString();
        set((state) => {
          // Built field by field so a stray key (a caller still passing `priority`) is not stored.
          const newGoal: Goal = withGoalTypeAndEstimate(
            {
              id,
              name: data.name,
              description: data.description ?? '',
              loggedMinutes: 0,
              status: 'active',
              order: nextGoalOrder(state.goals),
              createdAt: now,
              updatedAt: now,
            },
            data.activityTypeId,
            data.estimatedMinutes
          );
          return { goals: [...state.goals, newGoal] };
        });
        return id;
      },

      updateGoal: (id, data) => {
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== id) return goal;
            const now = new Date().toISOString();
            // `null` removes the field; a missing key keeps the goal's own value.
            const estimatedMinutes = data.estimatedMinutes === null
              ? undefined
              : data.estimatedMinutes ?? goal.estimatedMinutes;
            const loggedMinutes = data.loggedMinutes ?? goal.loggedMinutes;
            const activityTypeId = data.activityTypeId === null
              ? undefined
              : data.activityTypeId ?? goal.activityTypeId;
            const changesLinkedActivity = activityTypeId !== goal.activityTypeId &&
              state.trackingEntries.some((entry) => entry.goalId === goal.id);
            if (
              !(data.name ?? goal.name).trim() ||
              (estimatedMinutes !== undefined &&
                (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) ||
              !Number.isInteger(loggedMinutes) ||
              !Number.isFinite(loggedMinutes) ||
              (activityTypeId !== undefined &&
                !state.activityTypes.some((activity) => activity.id === activityTypeId)) ||
              changesLinkedActivity
            ) {
              return goal;
            }
            const explicitlyRequestedStatus = data.status;
            const merged = withGoalTypeAndEstimate(
              {
                ...goal,
                ...data,
                activityTypeId,
                estimatedMinutes,
                // Position is the list's, not the goal's to edit: only `moveGoal` changes it.
                order: goal.order,
                completedAt: goal.completedAt,
                updatedAt: now,
              },
              activityTypeId,
              estimatedMinutes
            );

            if (explicitlyRequestedStatus) {
              return {
                ...merged,
                loggedMinutes: Math.max(0, loggedMinutes),
                status: explicitlyRequestedStatus,
                completedAt: explicitlyRequestedStatus === 'completed'
                  ? goal.status === 'completed'
                    ? goal.completedAt ?? now
                    : now
                  : undefined,
              };
            }

            return withGoalTypeAndEstimate(
              {
                ...merged,
                ...applyGoalProgressChange(
                  goal,
                  loggedMinutes,
                  estimatedMinutes,
                  now
                ),
                name: data.name ?? goal.name,
                description: data.description ?? goal.description,
                createdAt: goal.createdAt,
              },
              activityTypeId,
              estimatedMinutes
            );
          }),
        }));
      },

      deleteGoal: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          goals: removeGoalFromList(state.goals, id),
          trackingEntries: state.trackingEntries.map((entry) =>
            entry.goalId === id
              ? { ...entry, goalId: undefined, updatedAt: now }
              : entry
          ),
        }));
      },

      /**
       * A reorder moves forecast dates but not capacity, so it stamps nothing on the routine.
       * Confidence evidence is scoped by `getCapacityChangedAt`, which only block edits and
       * activation move; priority edits never stamped it either (#6, #23, #24). A goal's evidence
       * is its own and the unlinked tracking on its type, and neither depends on where it sits.
       */
      moveGoal: (goalId, target) => {
        set((state) => {
          const goals = moveGoalInList(state.goals, goalId, target, new Date().toISOString());
          return goals === state.goals ? state : { goals: [...goals] };
        });
      },

      logMinutesToGoal: (id, minutes) => {
        if (!Number.isInteger(minutes) || minutes === 0) return;
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== id) return goal;
            return applyGoalProgressChange(
              goal,
              goal.loggedMinutes + minutes,
              goal.estimatedMinutes,
              new Date().toISOString()
            );
          }),
        }));
      },

      setGoalStatus: (id, status) => {
        set((state) => ({
          goals: state.goals.map((goal) =>
            goal.id === id
              ? {
                  ...goal,
                  status,
                  completedAt:
                    status === 'completed'
                      ? goal.status === 'completed'
                        ? goal.completedAt ?? new Date().toISOString()
                        : new Date().toISOString()
                      : undefined,
                  updatedAt: new Date().toISOString(),
                }
              : goal
          ),
        }));
      },

      // ============================================
      // Routine Actions
      // ============================================
      addRoutine: (name) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newRoutine: Routine = {
          id,
          name,
          isActive: false,
          blocks: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return id;
      },

      updateRoutine: (id, data) => {
        set((state) => {
          const routine = state.routines.find((candidate) => candidate.id === id);
          if (!routine) return state;
          const changedFields = changedRoutineFields(routine, data);
          // A rename that renames nothing must write nothing, for the same
          // reason re-saving an unchanged block does: `updatedAt` is the
          // capacity fallback, so any write here is a write to confidence.
          if (changedFields.length === 0) return state;
          const patch = Object.fromEntries(
            changedFields.map((field) => [field, data[field]])
          ) as RoutineUpdate;

          const now = new Date().toISOString();
          return {
            routines: state.routines.map((r) =>
              r.id === id
                ? {
                    ...r,
                    ...patch,
                    // Nothing this action can change is capacity, so nothing is
                    // stamped -- but `updatedAt` moves, and every activity type
                    // this routine has never stamped reads `updatedAt` through
                    // `getCapacityChangedAt`'s fallback. Seeding pins those to
                    // the cutoff they were already being read under.
                    capacityChangedAt: withCapacityChangedAt(r, [], now),
                    updatedAt: now,
                  }
                : r
            ),
          };
        });
      },

      deleteRoutine: (id) => {
        set((state) => {
          const removedBlockIds = new Set(
            state.routines.find((routine) => routine.id === id)?.blocks.map((block) => block.id) ?? []
          );
          const now = new Date().toISOString();
          return {
            routines: state.routines.filter((routine) => routine.id !== id),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId && removedBlockIds.has(entry.routineBlockId)
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
            activeRoutineId:
              state.activeRoutineId === id ? null : state.activeRoutineId,
          };
        });
      },

      setActiveRoutine: (id) => {
        const current = get();
        if (id !== null && !current.routines.some((routine) => routine.id === id)) return;

        const outgoing = current.routines.find(
          (routine) => routine.id === current.activeRoutineId
        );
        const incoming = current.routines.find((routine) => routine.id === id);
        const activatedChanges = incoming
          ? activationCapacityChanges(outgoing, incoming)
          : [];
        const now = new Date().toISOString();

        set((state) => ({
          routines: state.routines.map((routine) => {
            const isActive = routine.id === id;
            // Every routine that is not changing hands keeps its identity. The
            // old code rebuilt all of them with a fresh `updatedAt`, which
            // collapsed the forecast evidence of every routine that had an
            // activity type not yet in its map -- issue #7 with no block
            // touched, on routines the user never even named.
            if (routine.isActive === isActive) return routine;
            return {
              ...routine,
              isActive,
              // The two that do change hands still get a new `updatedAt`, so
              // they still have to be seeded or the fallback does the same
              // damage. The routine being activated additionally stamps the
              // activity types whose schedule really differs from the one
              // going out; the one being deactivated stamps nothing, because
              // its own blocks did not move and nothing reads it until it is
              // activated again, which compares afresh.
              capacityChangedAt: withCapacityChangedAt(
                routine,
                isActive ? activatedChanges : [],
                now
              ),
              updatedAt: now,
            };
          }),
          activeRoutineId: id,
        }));
      },

      duplicateRoutine: (id, newName) => {
        const state = get();
        const sourceRoutine = state.routines.find((r) => r.id === id);
        if (!sourceRoutine) return null;

        const newId = generateId();
        const now = new Date().toISOString();
        const newRoutine: Routine = {
          ...sourceRoutine,
          id: newId,
          name: newName,
          isActive: false,
          blocks: sourceRoutine.blocks.map((b) => ({
            ...b,
            id: generateId(),
          })),
          // The copy has the source's schedule, so it inherits the source's
          // cutoffs. Seeding rather than spreading matters because `updatedAt`
          // moves to now: an activity type the source never stamped would
          // otherwise fall through the fallback onto a fresh timestamp and the
          // copy would be born with no evidence for a schedule it did not change.
          capacityChangedAt: withCapacityChangedAt(sourceRoutine, [], now),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return newId;
      },

      // ============================================
      // Routine Block Actions
      // ============================================
      addRoutineBlock: (routineId, block) => {
        const state = get();
        const routine = state.routines.find((r) => r.id === routineId);
        if (!routine) return null;

        const blockId = generateId();
        const newBlock = toRoutineBlock({
          ...block,
          id: blockId,
        });
        if (
          !validateRoutineBlock(newBlock).isValid ||
          !blockReferencesAreValid(state, newBlock) ||
          findOverlappingBlocks(routine.blocks, newBlock).length > 0
        ) {
          return null;
        }

        const now = new Date().toISOString();
        const capacityChangedAt = withCapacityChangedAt(
          routine,
          [newBlock.activityTypeId],
          now
        );
        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: [...r.blocks, newBlock],
                  capacityChangedAt,
                  updatedAt: now,
                }
              : r
          ),
        }));
        return blockId;
      },

      updateRoutineBlock: (routineId, blockId, data) => {
        const state = get();
        const routine = state.routines.find((candidate) => candidate.id === routineId);
        const block = routine?.blocks.find((candidate) => candidate.id === blockId);
        if (!routine || !block) return;
        const updatedBlock = toRoutineBlock({ ...block, ...data, id: block.id });
        if (
          !validateRoutineBlock(updatedBlock).isValid ||
          !blockReferencesAreValid(state, updatedBlock) ||
          findOverlappingBlocks(routine.blocks, updatedBlock).length > 0
        ) {
          return;
        }

        const changedFields = (Object.keys(updatedBlock) as (keyof RoutineBlock)[]).filter(
          (field) => updatedBlock[field] !== block[field]
        );
        // Reopening a block and tapping Save without touching anything is the
        // commonest edit there is, and BlockEditor sends the whole block every
        // time. Writing nothing is the only way that save can leave forecasts
        // alone -- not a new updatedAt, and above all not a capacity stamp.
        if (changedFields.length === 0) return;

        const now = new Date().toISOString();
        const capacityMoved = changedFields.some((field) =>
          CAPACITY_RELEVANT_BLOCK_FIELDS.includes(field)
        );
        // Both sides matter: the new activity type gains capacity and, when the
        // type moved, the old one loses it.
        const capacityChangedAt = withCapacityChangedAt(
          routine,
          capacityMoved ? [block.activityTypeId, updatedBlock.activityTypeId] : [],
          now
        );
        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: r.blocks.map((b) =>
                    b.id === blockId ? updatedBlock : b
                  ),
                  capacityChangedAt,
                  updatedAt: now,
                }
              : r
          ),
        }));
      },

      updateRoutineBlocks: (routineId, updates) => {
        const state = get();
        const routine = state.routines.find((candidate) => candidate.id === routineId);
        if (!routine) return { ok: false, reason: 'That routine no longer exists.' };

        const changed = new Map<string, { before: RoutineBlock; after: RoutineBlock }>();
        for (const { id, data } of updates) {
          const before = routine.blocks.find((candidate) => candidate.id === id);
          if (!before) return { ok: false, reason: 'That activity no longer exists.' };
          const base = changed.get(id)?.after ?? before;
          changed.set(id, { before, after: toRoutineBlock({ ...base, ...data, id }) });
        }
        const candidateBlocks = routine.blocks.map((block) => changed.get(block.id)?.after ?? block);
        for (const { after } of changed.values()) {
          const validation = validateRoutineBlock(after);
          if (!validation.isValid) return { ok: false, reason: validation.errors[0].message };
          if (!blockReferencesAreValid(state, after)) {
            return { ok: false, reason: 'That activity type no longer exists.' };
          }
          if (findOverlappingBlocks(candidateBlocks, after).length > 0) {
            return { ok: false, reason: 'That would overlap another activity.' };
          }
        }

        const capacityTypeIds: string[] = [];
        for (const { before, after } of changed.values()) {
          const fields = (Object.keys(after) as (keyof RoutineBlock)[]).filter(
            (field) => after[field] !== before[field]
          );
          if (fields.some((field) => CAPACITY_RELEVANT_BLOCK_FIELDS.includes(field))) {
            capacityTypeIds.push(before.activityTypeId, after.activityTypeId);
          } else if (fields.length === 0) {
            changed.delete(before.id);
          }
        }
        // As with a single edit: nothing changed, nothing written.
        if (changed.size === 0) return { ok: true };

        const now = new Date().toISOString();
        const capacityChangedAt = withCapacityChangedAt(routine, capacityTypeIds, now);
        set((current) => ({
          routines: current.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: r.blocks.map((b) => changed.get(b.id)?.after ?? b),
                  capacityChangedAt,
                  updatedAt: now,
                }
              : r
          ),
        }));
        return { ok: true };
      },

      deleteRoutineBlock: (routineId, blockId) => {
        set((state) => {
          const targetRoutine = state.routines.find((routine) => routine.id === routineId);
          const deletedBlock = targetRoutine?.blocks.find((block) => block.id === blockId);
          if (!targetRoutine || !deletedBlock) return state;
          const now = new Date().toISOString();
          const capacityChangedAt = withCapacityChangedAt(
            targetRoutine,
            [deletedBlock.activityTypeId],
            now
          );
          return {
            routines: state.routines.map((routine) =>
              routine.id === routineId
                ? {
                    ...routine,
                    blocks: routine.blocks.filter((block) => block.id !== blockId),
                    capacityChangedAt,
                    updatedAt: now,
                  }
                : routine
            ),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId === blockId
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
          };
        });
      },

      copyDayBlocks: (routineId, fromDay, toDays) => {
        set((state) => {
          const routine = state.routines.find((r) => r.id === routineId);
          if (!routine) return state;

          const sourceBlocks = routine.blocks.filter((b) => b.dayOfWeek === fromDay);
          const newBlocks: RoutineBlock[] = [];

          for (const toDay of toDays) {
            for (const sourceBlock of sourceBlocks) {
              newBlocks.push({
                ...sourceBlock,
                id: generateId(),
                dayOfWeek: toDay,
              });
            }
          }

          // Remove existing blocks on target days
          const filteredBlocks = routine.blocks.filter(
            (b) => !toDays.includes(b.dayOfWeek)
          );
          const removedBlockIds = new Set(
            routine.blocks
              .filter((block) => toDays.includes(block.dayOfWeek))
              .map((block) => block.id)
          );
          const candidateBlocks = [...filteredBlocks, ...newBlocks];
          const isValid = candidateBlocks.every((block, index) =>
            validateRoutineBlock(block).isValid &&
            blockReferencesAreValid(state, block) &&
            findOverlappingBlocks(candidateBlocks.slice(0, index), block).length === 0
          );
          if (!isValid) return state;
          const now = new Date().toISOString();
          const capacityChangedAt = withCapacityChangedAt(
            routine,
            [
              ...routine.blocks
                .filter((block) => removedBlockIds.has(block.id))
                .map((block) => block.activityTypeId),
              ...newBlocks.map((block) => block.activityTypeId),
            ],
            now
          );

          return {
            routines: state.routines.map((r) =>
              r.id === routineId
                ? {
                    ...r,
                    blocks: candidateBlocks,
                    capacityChangedAt,
                    updatedAt: now,
                  }
                : r
            ),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId && removedBlockIds.has(entry.routineBlockId)
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
          };
        });
      },

      // ============================================
      // Tracking Entry Actions
      // ============================================
      startTracking: (data) => {
        const state = get();
        const activityExists = state.activityTypes.some(
          (activity) => activity.id === data.activityTypeId
        );
        const goalIsValid = !data.goalId || state.goals.some(
          (goal) => goal.id === data.goalId && goal.activityTypeId === data.activityTypeId
        );
        const routineBlock = data.routineBlockId
          ? state.routines
              .flatMap((routine) => routine.blocks)
              .find((block) => block.id === data.routineBlockId)
          : undefined;
        const routineBlockIsValid = !data.routineBlockId ||
          routineBlock?.activityTypeId === data.activityTypeId;
        if (!activityExists || !goalIsValid || !routineBlockIsValid) return null;

        // Stop any currently running tracking
        if (state.currentTrackingEntryId) {
          get().stopTracking();
        }

        const id = generateId();
        const now = new Date().toISOString();
        const newEntry: TrackingEntry = {
          id,
          date: toLocalDateKey(new Date()),
          startTime: now,
          endTime: undefined,
          activityTypeId: data.activityTypeId,
          goalId: data.goalId,
          routineBlockId: data.routineBlockId,
          source: data.source,
          notes: data.notes,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          trackingEntries: [...state.trackingEntries, newEntry],
          currentTrackingEntryId: id,
        }));
        return id;
      },

      stopTracking: (id) => {
        const state = get();
        const entryId = id || state.currentTrackingEntryId;
        if (!entryId) return;

        const entry = state.trackingEntries.find((e) => e.id === entryId);
        if (!entry || entry.endTime) return;

        const now = new Date().toISOString();

        // Device clocks move backwards: an NTP resync, a manual correction, or a timezone/clock
        // fix after reconnecting can all make `now` earlier than this entry's startTime. Writing
        // endTime < startTime persists a record that the strict hydration path refuses to parse,
        // which bricks the store on every subsequent launch (issue #3).
        //
        // Of the defensible answers — clamp, discard, or store flagged — this clamps to a
        // zero-length entry, because:
        //   * Discarding is the one outcome that cannot be undone. Offline-first, this device
        //     holds the only copy of the user's history (docs/PRODUCT.md D6), and the session
        //     really did happen.
        //   * A zero-length entry contributes no minutes (getTrackingEntryDurationMinutes
        //     returns 0), so a bad clock can never invent or erase goal progress.
        //   * It survives the strict parse path unchanged, which is the whole point: that path
        //     rejects endTime < startTime but accepts endTime === startTime, so the clamped
        //     record loads on every future launch instead of blocking them.
        //   * It is exactly what parseTrackingEntry's lenient repair already does with a
        //     backwards-clock entry, so the two layers produce the same shape.
        //   * The user can still correct the end time by hand afterwards.
        // The timer stops either way: leaving the entry open because the clock misbehaved would
        // strand the user in a session they cannot end.
        //
        // Note the one asymmetry with the siblings this mirrors. trackingEntryIsValid demands
        // endTime > startTime, so addCompletedEntry and updateTrackingEntry would refuse a
        // zero-length entry outright. stopTracking cannot refuse: its two choices are to write
        // something or to leave the timer running forever. A clamped zero-length entry is
        // therefore the one record shape stopTracking may produce that its siblings would reject,
        // and it is deliberate. It is still readable by the parser, and it contributes nothing:
        // getTrackingEntryDurationMinutes returns 0 for end <= start.
        //
        // Pauses (#54) extend the same rule: the entry cannot end before a pause it records began
        // or ended, so the clamp is to the latest recorded moment, not only to startTime. An open
        // pause then closes at the stop time, which leaves the paused stretch out of the duration.
        const endTime = latestMoment([
          entry.startTime,
          ...(entry.pauses ?? []).flatMap((pause) => (pause.end ? [pause.start, pause.end] : [pause.start])),
          now,
        ]);
        const completedEntry: TrackingEntry = {
          ...entry,
          endTime,
          ...(entry.pauses
            ? { pauses: entry.pauses.map((pause) => (pause.end ? pause : { ...pause, end: endTime })) }
            : {}),
          updatedAt: now,
        };

        set((state) => ({
          trackingEntries: state.trackingEntries.map((e) =>
            e.id === entryId ? completedEntry : e
          ),
          goals: applyGoalDeltas(
            state.goals,
            contributionDelta(entry, completedEntry),
            now
          ),
          currentTrackingEntryId:
            state.currentTrackingEntryId === entryId
              ? null
              : state.currentTrackingEntryId,
        }));
      },

      pauseTracking: (id) => {
        set((state) => {
          const entryId = id || state.currentTrackingEntryId;
          const entry = state.trackingEntries.find((candidate) => candidate.id === entryId);
          if (!entry || entry.endTime || isTrackingEntryPaused(entry)) return state;
          const now = new Date().toISOString();
          const pauses = entry.pauses ?? [];
          // As in stopTracking, a clock that moved backwards must not write a pause that starts
          // before the entry or the last pause ended.
          const start = latestMoment([
            entry.startTime,
            ...pauses.flatMap((pause) => (pause.end ? [pause.end] : [])),
            now,
          ]);
          const paused: TrackingEntry = { ...entry, pauses: [...pauses, { start }], updatedAt: now };
          return {
            trackingEntries: state.trackingEntries.map((candidate) =>
              candidate.id === entry.id ? paused : candidate
            ),
          };
        });
      },

      resumeTracking: (id) => {
        set((state) => {
          const entryId = id || state.currentTrackingEntryId;
          const entry = state.trackingEntries.find((candidate) => candidate.id === entryId);
          if (!entry?.pauses || !isTrackingEntryPaused(entry)) return state;
          const now = new Date().toISOString();
          const pauses = entry.pauses.map((pause, index) =>
            index === entry.pauses!.length - 1
              ? { ...pause, end: latestMoment([pause.start, now]) }
              : pause
          );
          const resumed: TrackingEntry = { ...entry, pauses, updatedAt: now };
          return {
            trackingEntries: state.trackingEntries.map((candidate) =>
              candidate.id === entry.id ? resumed : candidate
            ),
          };
        });
      },

      addCompletedEntry: (data) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newEntry: TrackingEntry = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };
        if (!trackingEntryIsValid(get(), newEntry)) return null;

        set((state) => ({
          trackingEntries: [...state.trackingEntries, newEntry],
          goals: applyGoalDeltas(
            state.goals,
            contributionDelta(undefined, newEntry),
            now
          ),
        }));

        return id;
      },

      updateTrackingEntry: (id, data) => {
        set((state) => {
          const entry = state.trackingEntries.find((candidate) => candidate.id === id);
          if (!entry) return state;
          const now = new Date().toISOString();
          const updatedEntry: TrackingEntry = { ...entry, ...data, updatedAt: now };
          if (entry.endTime && !updatedEntry.endTime) return state;
          if (!trackingEntryIsValid(state, updatedEntry)) return state;
          return {
            trackingEntries: state.trackingEntries.map((candidate) =>
              candidate.id === id ? updatedEntry : candidate
            ),
            goals: applyGoalDeltas(
              state.goals,
              contributionDelta(entry, updatedEntry),
              now
            ),
            currentTrackingEntryId:
              state.currentTrackingEntryId === id && updatedEntry.endTime
                ? null
                : state.currentTrackingEntryId,
          };
        });
      },

      deleteTrackingEntry: (id) => {
        set((state) => {
          const entry = state.trackingEntries.find((candidate) => candidate.id === id);
          if (!entry) return state;
          const now = new Date().toISOString();
          return {
            trackingEntries: state.trackingEntries.filter((candidate) => candidate.id !== id),
            goals: applyGoalDeltas(
              state.goals,
              contributionDelta(entry, undefined),
              now
            ),
            currentTrackingEntryId:
              state.currentTrackingEntryId === id
                ? null
                : state.currentTrackingEntryId,
          };
        });
      },

      // ============================================
      // State Management
      // ============================================
      resetState: async () => {
        // "Reset All Data" deletes goals, routines and history; how the user likes their week
        // drawn is a setting, not data, so it survives. Import, by contrast, restores the
        // backup's own preferences.
        const nextState = { ...createInitializedState(), preferences: get().preferences };
        await persistSnapshot(nextState);
        set(nextState);
        clearHydrationReports();
      },

      initializeDefaults: () => {
        const state = get();
        const needsActivities = state.activityTypes.length === 0;
        const needsRoutine = state.routines.length === 0;
        if (!needsActivities && !needsRoutine) return;

        const defaultRoutine = needsRoutine ? createDefaultRoutine() : undefined;
        set({
          activityTypes: needsActivities
            ? createDefaultActivityTypes()
            : state.activityTypes,
          routines: defaultRoutine ? [defaultRoutine] : state.routines,
          activeRoutineId: defaultRoutine?.id ?? state.activeRoutineId,
        });
      },

      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
      },

      setWeekStartsOn: (weekStartsOn) => {
        if (weekStartsOn !== 0 && weekStartsOn !== 1) return;
        set((state) => ({ preferences: { ...state.preferences, weekStartsOn } }));
      },

      setPomodoroEnabled: (enabled) => {
        if (typeof enabled !== 'boolean') return;
        set((state) => ({ preferences: { ...state.preferences, pomodoro: { enabled } } }));
      },

      exportData: () => encodeBackup(selectPersistedAppState(get())),

      importData: async (serialized) => {
        let imported: AppState;
        try {
          imported = ensureRequiredDefaults(decodeBackup(serialized));
          await persistSnapshot(imported);
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to import this backup.',
          };
        }
        set(imported);
        clearHydrationReports();
        return { ok: true };
      },

      // ============================================
      // Debug Helpers
      // ============================================
      /**
       * Load the example set (src/store/sampleData.ts). Purely additive: nothing
       * the user already has is removed, renamed or edited, with one exception
       * that holds nothing -- an active routine with no blocks is filled in
       * place rather than left behind as an empty duplicate.
       *
       * - Missing sample activity types are added; existing ones are reused.
       * - If the active routine already has blocks, it stays active and the
       *   example routine is added inactive. The app has no routine switcher,
       *   so activating it would hide the user's own schedule.
       * - Loading a second time does nothing (detected by the routine name), so
       *   a double tap cannot double the tracking history.
       *
       * Returns whether anything was loaded.
       */
      _addSampleData: () => {
        const state = get();
        if (state.routines.some((routine) => routine.name === SAMPLE_ROUTINE_NAME)) {
          return false;
        }
        const now = new Date();
        const activityTypes = [
          ...state.activityTypes,
          ...missingSampleActivityTypes(state.activityTypes, now),
        ];
        const sample = buildSampleData(activityTypes, now);

        const activeRoutine = state.routines.find(
          (routine) => routine.id === state.activeRoutineId
        );
        let routines: Routine[];
        let activeRoutineId = state.activeRoutineId;
        if (activeRoutine && activeRoutine.blocks.length === 0) {
          routines = state.routines.map((routine) =>
            routine.id === activeRoutine.id
              ? { ...sample.routine, id: routine.id, createdAt: routine.createdAt }
              : routine
          );
        } else if (activeRoutine) {
          routines = [...state.routines, { ...sample.routine, isActive: false }];
        } else {
          routines = [
            ...state.routines.map((routine) =>
              routine.isActive ? { ...routine, isActive: false } : routine
            ),
            sample.routine,
          ];
          activeRoutineId = sample.routine.id;
        }

        const timestamp = now.toISOString();
        let next: AppState = {
          ...selectPersistedAppState(state),
          activityTypes,
          routines,
          activeRoutineId,
          // The example goals go to the bottom of the list, in their own order.
          goals: renumberGoals([...state.goals, ...sample.goals]),
        };
        const entries: TrackingEntry[] = [];
        let goals = next.goals;
        for (const data of sample.trackingEntries) {
          const entry: TrackingEntry = {
            ...data,
            id: generateId(),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          if (!trackingEntryIsValid(next, entry)) continue;
          entries.push(entry);
          goals = applyGoalDeltas(goals, contributionDelta(undefined, entry), timestamp);
        }
        next = {
          ...next,
          goals,
          trackingEntries: [...state.trackingEntries, ...entries],
        };
        set(next);
        return true;
      },
    }),
    {
      name: APP_STORAGE_KEY,
      storage: appStorage,
      version: CURRENT_SCHEMA_VERSION,
      skipHydration: true,
      partialize: selectPersistedAppState,
      migrate: async (persistedState, version) => {
        const migrated = migratePersistedState(
          persistedState,
          version,
          { quarantine: pendingQuarantine, repairs: pendingRepairs }
        );
        // Only the migrate path rewrites the app blob during hydration, and it does so with the
        // quarantined record already stripped out. Measured order before this await existed
        // (issue #19): READ storage, WRITE storage [stripped], READ quarantine, WRITE quarantine
        // -- between those middle two steps the record is in no durable location at all.
        //
        // Awaiting the side-car write *here* closes that window by construction rather than
        // narrowing it. zustand 5.0.11 detects a promise returned from `migrate` and chains it
        // (node_modules/zustand/esm/middleware.mjs:392-396) before the `set` and the `setItem`
        // that rewrite the blob (:419-421), so the blob cannot be rewritten until this resolves.
        //
        // A failure propagates here, unlike on the merge path below, and that asymmetry is the
        // point. Rejecting aborts the rehydrate chain at :431 before that `setItem`, so the app
        // blob keeps the record and the user gets the retryable hydration error. Swallowing it
        // would let zustand strip the record anyway -- the failure #19 demonstrated rather than
        // hypothesised, where a rejecting side-car write on a v3 blob left the record in neither
        // key, with a console.warn as its only trace and hydration still reporting `ready`.
        // Refusing to open is the lesser harm when this device holds the only copy of the user's
        // history (docs/PRODUCT.md D6), and a full disk is something the user can act on.
        //
        // Legacy repairs ride the same await for the same reason, and they need it more: a
        // repaired entry's original record is only in the app blob, and the `setItem` below is
        // exactly what replaces it with the repaired version. This is the one chance to copy it.
        await persistHydrationReports(pendingQuarantine, pendingRepairs);
        return migrated;
      },
      merge: (persistedState, currentState) => {
        if (persistedState === undefined) return currentState;
        // Every save stamps CURRENT_SCHEMA_VERSION, so this is always the strict path and the
        // lenient repairs inside migratePersistedState never run here. Passing a quarantine sink
        // is what keeps one bad tracking entry from making the app permanently unopenable.
        const migrated = migratePersistedState(
          persistedState,
          CURRENT_SCHEMA_VERSION,
          { quarantine: pendingQuarantine, repairs: pendingRepairs }
        );
        quarantinedTrackingEntries =
          pendingQuarantine.length > 0 ? pendingQuarantine : NO_QUARANTINE;
        // Repairs only ever come from the `migrate` stage — this call is strict, so the
        // `version < CURRENT_SCHEMA_VERSION` branch that repairs open entries cannot run here.
        // Publishing from `merge` anyway is what carries a migrate-stage repair to the screen,
        // since `merge` is the later of the two stages and the sink is shared across both.
        repairedTrackingEntries = pendingRepairs.length > 0 ? pendingRepairs : NO_REPAIRS;
        return { ...currentState, ...migrated };
      },
      onRehydrateStorage: () => {
        hydrationFailure = null;
        pendingQuarantine = [];
        pendingRepairs = [];
        quarantinedTrackingEntries = NO_QUARANTINE;
        repairedTrackingEntries = NO_REPAIRS;
        return (_state, error) => {
          hydrationFailure = error ?? null;
        };
      },
    }
  )
);

export function initializeAppStore(options?: { force?: boolean }): Promise<void> {
  if (hydrationRun) return hydrationRun;
  if (hydrationSnapshot.status === 'ready' && !options?.force) {
    return Promise.resolve();
  }

  publishHydrationSnapshot({ status: 'loading', error: null });
  hydrationRun = (async () => {
    try {
      await useAppStore.persist.rehydrate();
      if (hydrationFailure || !useAppStore.persist.hasHydrated()) {
        throw hydrationFailure instanceof Error
          ? hydrationFailure
          : new Error('ZenRoutine could not read its local data.');
      }
      // Quarantined records are out of live state, so the very next store write would overwrite
      // the only blob that still holds them. Copy them somewhere the store does not own, before
      // anything below can trigger that write.
      //
      // This covers the merge path, where zustand reads the blob and writes nothing
      // (middleware.mjs:405 short-circuits when the version matches), so the record is still in
      // the app blob throughout and a failed side-car write loses nothing. That is why a failure
      // is swallowed here but not in `migrate`: re-bricking hydration would defeat the point of
      // quarantining when there is nothing to lose by opening.
      //
      // The migrate path has already written the side-car by the time we get here, and
      // `persistQuarantinedEntries` recognises the identical generation and writes nothing, so
      // one hydration still produces exactly one generation.
      //
      // Note what keeps the merge path safe: this write happens before `persistSnapshot` below,
      // which is the first thing in hydration that can rewrite the blob. That is an ordering
      // property of this function, not something the type system enforces — a store write added
      // above this point would reopen the #19 window on the merge path too. `merge` cannot take
      // the `migrate` treatment because zustand calls it synchronously (middleware.mjs:416).
      const quarantined = getQuarantinedTrackingEntries();
      const repaired = getRepairedTrackingEntries();
      if (quarantined.length > 0 || repaired.length > 0) {
        try {
          await persistHydrationReports(quarantined, repaired);
        } catch (error) {
          console.warn('ZenRoutine could not save its hydration report', error);
        }
      }

      const current = selectPersistedAppState(useAppStore.getState());
      const initialized = ensureRequiredDefaults(current);
      if (initialized !== current) {
        await persistSnapshot(initialized);
        useAppStore.setState(initialized);
      }
      publishHydrationSnapshot({ status: 'ready', error: null });
    } catch (error) {
      publishHydrationSnapshot({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'ZenRoutine could not read its local data.',
      });
    }
  })().finally(() => {
    hydrationRun = null;
  });
  return hydrationRun;
}

export async function resetAppStoreAfterHydrationError(): Promise<void> {
  if (hydrationSnapshot.status !== 'error') return;
  await useAppStore.getState().resetState();
  hydrationFailure = null;
  publishHydrationSnapshot({ status: 'ready', error: null });
}

// Selector hooks for common queries
// Note: For derived data (filter/find), we select the base data and derive in the component
// to avoid creating new object references that cause infinite re-renders

export const useActivityTypes = () => useAppStore((s) => s.activityTypes);
/**
 * Every goal, in list order (#49): the top goal first. The store keeps `goals` sorted — hydration
 * sorts by `order`, `addGoal` appends, `moveGoal` and `deleteGoal` renumber — so this is the
 * stored array itself, with a stable reference, and needs no sorted copy.
 */
export const useGoals = () => useAppStore((s) => s.goals);
export const useRoutines = () => useAppStore((s) => s.routines);
export const useTrackingEntries = () => useAppStore((s) => s.trackingEntries);

/**
 * Active goals in list order (Home's "Active Goals"). A goal with no type or estimate (#50) is
 * still an active goal and is listed like any other.
 */
export function selectActiveGoals(goals: readonly Goal[]): Goal[] {
  return goals.filter((g) => g.status === 'active');
}

// For derived selectors, we select primitive/stable values and compute in the hook
export const useActiveGoals = () => {
  const goals = useAppStore((s) => s.goals);
  // useMemo would be ideal here, but to keep it simple we'll accept the filter on each render
  // The key fix is that we're selecting `goals` (stable reference) not the filtered result
  return selectActiveGoals(goals);
};

export const useActiveRoutine = () => {
  const routines = useAppStore((s) => s.routines);
  const activeRoutineId = useAppStore((s) => s.activeRoutineId);
  return routines.find((r) => r.id === activeRoutineId);
};

export const useCurrentTracking = () => {
  const trackingEntries = useAppStore((s) => s.trackingEntries);
  const currentTrackingEntryId = useAppStore((s) => s.currentTrackingEntryId);
  if (!currentTrackingEntryId) return null;
  return trackingEntries.find((e) => e.id === currentTrackingEntryId);
};

export const useHasCompletedOnboarding = () => useAppStore((s) => s.hasCompletedOnboarding);
export const useWeekStartsOn = () => useAppStore((s) => s.preferences.weekStartsOn);

/** Whether the Pomodoro timer is on (#53). A store that never chose has it on. */
export function isPomodoroEnabled(preferences: Pick<Preferences, 'pomodoro'>): boolean {
  return preferences.pomodoro?.enabled ?? true;
}
export const usePomodoroEnabled = () => useAppStore((s) => isPomodoroEnabled(s.preferences));

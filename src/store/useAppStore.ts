import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  ActivityType,
  Goal,
  GoalStatus,
  GoalPriority,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
  DayOfWeek,
} from '../core/types';
import { generateId } from '../core/utils/id';
import { createDefaultActivityTypes } from '../core/engine/defaults';
import {
  getTrackingEntryDurationMinutes,
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
  encodeBackup,
  migratePersistedState,
  parseQuarantineArchive,
  selectPersistedAppState,
} from './persistence';
import type { QuarantineArchive, QuarantinedTrackingEntry } from './persistence';

export type ImportResult =
  | { ok: true }
  | { ok: false; error: string };

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

/**
 * Tracking entries the last hydration could not read and therefore left out of live state.
 * Deliberately kept off HydrationSnapshot so the existing hydration contract is unchanged.
 */
export function getQuarantinedTrackingEntries(): readonly QuarantinedTrackingEntry[] {
  return quarantinedTrackingEntries;
}

/**
 * Drop the report after the state it described has been replaced wholesale (reset or import).
 * The durable QUARANTINE_STORAGE_KEY copy is left alone — this clears the notice, not the data.
 */
function clearQuarantineReport(): void {
  if (quarantinedTrackingEntries === NO_QUARANTINE) return;
  quarantinedTrackingEntries = NO_QUARANTINE;
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

function applyGoalProgressChange(
  goal: Goal,
  nextLoggedMinutes: number,
  nextEstimatedMinutes: number,
  now: string
): Goal {
  const loggedMinutes = Math.max(0, nextLoggedMinutes);
  const previouslyMetEstimate = goal.loggedMinutes >= goal.estimatedMinutes;
  const meetsEstimate = loggedMinutes >= nextEstimatedMinutes;
  let status = goal.status;
  let completedAt = goal.status === 'completed' ? goal.completedAt : undefined;

  if (meetsEstimate && status !== 'completed') {
    status = 'completed';
    completedAt = now;
  } else if (!meetsEstimate && previouslyMetEstimate && status === 'completed') {
    status = 'active';
    completedAt = undefined;
  }

  return {
    ...goal,
    estimatedMinutes: nextEstimatedMinutes,
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
  block: Pick<RoutineBlock, 'activityTypeId' | 'goalId'>
): boolean {
  if (!state.activityTypes.some((activity) => activity.id === block.activityTypeId)) {
    return false;
  }
  if (!block.goalId) return true;
  const goal = state.goals.find((candidate) => candidate.id === block.goalId);
  return goal?.activityTypeId === block.activityTypeId;
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
 * - `goalId`: moves that time between the activity type's dedicated and shared
 *   pools, which changes every competing goal's allocation.
 *
 * `id` is deliberately absent: it identifies the block, it is not capacity.
 */
const CAPACITY_RELEVANT_BLOCK_FIELDS: readonly (keyof RoutineBlock)[] = [
  'activityTypeId',
  'dayOfWeek',
  'startMinutes',
  'endMinutes',
  'goalId',
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
    if (routineBlock.goalId && routineBlock.goalId !== entry.goalId) return false;
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
  addGoal: (data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'loggedMinutes' | 'status' | 'priority'> & { priority?: GoalPriority }) => string | null;
  updateGoal: (id: string, data: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteGoal: (id: string) => void;
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
  stopTracking: (id?: string) => void;
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
  exportData: () => string;
  importData: (serialized: string) => Promise<ImportResult>;

  // Debug helpers
  _addSampleData: () => void;
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
          !Number.isInteger(data.estimatedMinutes) ||
          data.estimatedMinutes <= 0 ||
          !state.activityTypes.some((activity) => activity.id === data.activityTypeId) ||
          (data.priority !== undefined && ![1, 2, 3, 4, 5].includes(data.priority))
        ) {
          return null;
        }
        const id = generateId();
        const now = new Date().toISOString();
        const newGoal: Goal = {
          ...data,
          id,
          loggedMinutes: 0,
          status: 'active',
          priority: data.priority ?? 3, // Default to Medium priority
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          goals: [...state.goals, newGoal],
        }));
        return id;
      },

      updateGoal: (id, data) => {
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== id) return goal;
            const now = new Date().toISOString();
            const estimatedMinutes = data.estimatedMinutes ?? goal.estimatedMinutes;
            const loggedMinutes = data.loggedMinutes ?? goal.loggedMinutes;
            const activityTypeId = data.activityTypeId ?? goal.activityTypeId;
            const priority = data.priority ?? goal.priority;
            const changesLinkedActivity = activityTypeId !== goal.activityTypeId && (
              state.routines.some((routine) => routine.blocks.some(
                (block) => block.goalId === goal.id
              )) ||
              state.trackingEntries.some((entry) => entry.goalId === goal.id)
            );
            if (
              !(data.name ?? goal.name).trim() ||
              !Number.isInteger(estimatedMinutes) ||
              estimatedMinutes <= 0 ||
              !Number.isInteger(loggedMinutes) ||
              !Number.isFinite(loggedMinutes) ||
              ![1, 2, 3, 4, 5].includes(priority) ||
              !state.activityTypes.some((activity) => activity.id === activityTypeId) ||
              changesLinkedActivity
            ) {
              return goal;
            }
            const explicitlyRequestedStatus = data.status;
            const merged = {
              ...goal,
              ...data,
              completedAt: goal.completedAt,
              updatedAt: now,
            };

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

            return {
              ...merged,
              ...applyGoalProgressChange(
                goal,
                loggedMinutes,
                estimatedMinutes,
                now
              ),
              name: data.name ?? goal.name,
              description: data.description ?? goal.description,
              activityTypeId,
              priority,
              createdAt: goal.createdAt,
            };
          }),
        }));
      },

      deleteGoal: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          // Also update any routine blocks that reference this goal
          routines: state.routines.map((r) => ({
            ...r,
            blocks: r.blocks.map((b) =>
              b.goalId === id ? { ...b, goalId: undefined } : b
            ),
          })),
          trackingEntries: state.trackingEntries.map((entry) =>
            entry.goalId === id
              ? { ...entry, goalId: undefined, updatedAt: now }
              : entry
          ),
        }));
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
        const newBlock: RoutineBlock = {
          ...block,
          id: blockId,
        };
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
        const updatedBlock: RoutineBlock = { ...block, ...data };
        if (
          !validateRoutineBlock(updatedBlock).isValid ||
          !blockReferencesAreValid(state, updatedBlock) ||
          findOverlappingBlocks(routine.blocks, updatedBlock).length > 0
        ) {
          return;
        }

        const changedFields = (Object.keys(data) as (keyof RoutineBlock)[]).filter(
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
        // type or the goal link moved, the old one loses it.
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
        const routineBlockIsValid = !data.routineBlockId || (
          routineBlock?.activityTypeId === data.activityTypeId &&
          (!routineBlock.goalId || routineBlock.goalId === data.goalId)
        );
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
        const startedAt = Date.parse(entry.startTime);
        const endTime = Number.isFinite(startedAt) && Date.parse(now) < startedAt
          ? entry.startTime
          : now;
        const completedEntry: TrackingEntry = {
          ...entry,
          endTime,
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
        const nextState = createInitializedState();
        await persistSnapshot(nextState);
        set(nextState);
        clearQuarantineReport();
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
        clearQuarantineReport();
        return { ok: true };
      },

      // ============================================
      // Debug Helpers
      // ============================================
      _addSampleData: () => {
        const state = get();
        const workActivity = state.activityTypes.find((at) => at.name === 'Work');
        const fitnessActivity = state.activityTypes.find((at) => at.name === 'Fitness');
        const sideProjectActivity = state.activityTypes.find((at) => at.name === 'Side Project');

        if (!workActivity || !fitnessActivity || !sideProjectActivity) return;

        // Add sample goals
        const goal1Id = get().addGoal({
          name: 'Complete TypeScript Course',
          description: 'Finish the advanced TypeScript patterns course',
          estimatedMinutes: 1200,
          activityTypeId: sideProjectActivity.id,
          priority: 2, // High priority
        });

        const goal2Id = get().addGoal({
          name: 'Run 100 miles',
          description: 'Cumulative running goal for the month',
          estimatedMinutes: 600,
          activityTypeId: fitnessActivity.id,
          priority: 1, // Very High priority
        });
        if (!goal1Id || !goal2Id) return;

        // Add sample routine
        const routineId = get().addRoutine('Work Week');

        // Add blocks to routine
        const blocks: Omit<RoutineBlock, 'id'>[] = [
          // Monday - Friday work blocks
          ...[1, 2, 3, 4, 5].flatMap((day) => [
            {
              dayOfWeek: day as DayOfWeek,
              startMinutes: 540, // 9:00 AM
              endMinutes: 720,   // 12:00 PM
              activityTypeId: workActivity.id,
            },
            {
              dayOfWeek: day as DayOfWeek,
              startMinutes: 780, // 1:00 PM
              endMinutes: 1020,  // 5:00 PM
              activityTypeId: workActivity.id,
            },
          ]),
          // Morning workout Monday, Wednesday, Friday
          ...[1, 3, 5].map((day) => ({
            dayOfWeek: day as DayOfWeek,
            startMinutes: 420, // 7:00 AM
            endMinutes: 480,   // 8:00 AM
            activityTypeId: fitnessActivity.id,
            goalId: goal2Id,
          })),
          // Side project evenings
          ...[1, 2, 3, 4].map((day) => ({
            dayOfWeek: day as DayOfWeek,
            startMinutes: 1140, // 7:00 PM
            endMinutes: 1260,   // 9:00 PM
            activityTypeId: sideProjectActivity.id,
            goalId: goal1Id,
          })),
        ];

        blocks.forEach((block) => {
          get().addRoutineBlock(routineId, block);
        });

        // Set as active routine
        get().setActiveRoutine(routineId);

        // Add some sample tracking entries
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        get().addCompletedEntry({
          date: toLocalDateKey(yesterday),
          startTime: new Date(yesterday.setHours(9, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(12, 0, 0, 0)).toISOString(),
          activityTypeId: workActivity.id,
          source: 'scheduled',
        });

        get().addCompletedEntry({
          date: toLocalDateKey(yesterday),
          startTime: new Date(yesterday.setHours(7, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(8, 0, 0, 0)).toISOString(),
          activityTypeId: fitnessActivity.id,
          goalId: goal2Id,
          source: 'manual',
        });
      },
    }),
    {
      name: APP_STORAGE_KEY,
      storage: appStorage,
      version: CURRENT_SCHEMA_VERSION,
      skipHydration: true,
      partialize: selectPersistedAppState,
      migrate: (persistedState, version) =>
        migratePersistedState(persistedState, version, { quarantine: pendingQuarantine }),
      merge: (persistedState, currentState) => {
        if (persistedState === undefined) return currentState;
        // Every save stamps CURRENT_SCHEMA_VERSION, so this is always the strict path and the
        // lenient repairs inside migratePersistedState never run here. Passing a quarantine sink
        // is what keeps one bad tracking entry from making the app permanently unopenable.
        const migrated = migratePersistedState(
          persistedState,
          CURRENT_SCHEMA_VERSION,
          { quarantine: pendingQuarantine }
        );
        quarantinedTrackingEntries =
          pendingQuarantine.length > 0 ? pendingQuarantine : NO_QUARANTINE;
        return { ...currentState, ...migrated };
      },
      onRehydrateStorage: () => {
        hydrationFailure = null;
        pendingQuarantine = [];
        quarantinedTrackingEntries = NO_QUARANTINE;
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
      // anything below can trigger that write. A failure here must not re-brick hydration — the
      // whole point of quarantining is that the app still opens — so it is reported in the
      // session's in-memory report and nowhere else.
      //
      // This appends a generation rather than replacing the side-car. Overwriting would mean a
      // second quarantine event destroys what the first one saved, and by then those records are
      // already gone from the store's own blob — which is precisely the silent data loss this
      // whole lane exists to stop.
      const quarantined = getQuarantinedTrackingEntries();
      if (quarantined.length > 0) {
        try {
          await AsyncStorage.setItem(
            QUARANTINE_STORAGE_KEY,
            JSON.stringify(appendQuarantineGeneration(
              await readQuarantineArchive(),
              quarantined
            ))
          );
        } catch (error) {
          console.warn('ZenRoutine could not save quarantined tracking entries', error);
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
export const useGoals = () => useAppStore((s) => s.goals);
export const useRoutines = () => useAppStore((s) => s.routines);
export const useTrackingEntries = () => useAppStore((s) => s.trackingEntries);

// For derived selectors, we select primitive/stable values and compute in the hook
export const useActiveGoals = () => {
  const goals = useAppStore((s) => s.goals);
  // useMemo would be ideal here, but to keep it simple we'll accept the filter on each render
  // The key fix is that we're selecting `goals` (stable reference) not the filtered result
  return goals.filter((g) => g.status === 'active');
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

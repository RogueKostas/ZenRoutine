import { ActivityTypeId } from './ActivityType';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

/**
 * One scheduled slot in a routine. A block names an activity type and nothing else: the routine
 * is made of activity types only (#60, docs/DESIGN-2019.md decision 1). Goals draw on their type's
 * pooled time in priority order; the plan never names a goal. Tracking entries still may.
 */
export interface RoutineBlock {
  id: string;
  dayOfWeek: DayOfWeek;
  startMinutes: number;   // Minutes from midnight (0-1439)
  endMinutes: number;     // Minutes from midnight (0-1439)
  activityTypeId: ActivityTypeId;
}

export type RoutineBlockId = string;

/**
 * Copy exactly the fields a routine block has, dropping anything else a caller spread in.
 *
 * The type alone cannot keep `goalId` out: a spread of an older object, a plain JavaScript caller
 * or a stale persisted record all get past the compiler. Every place that writes a block into
 * state goes through here, so a stray key never reaches the store or the persisted blob.
 */
export function toRoutineBlock(block: RoutineBlock): RoutineBlock {
  return {
    id: block.id,
    dayOfWeek: block.dayOfWeek,
    startMinutes: block.startMinutes,
    endMinutes: block.endMinutes,
    activityTypeId: block.activityTypeId,
  };
}

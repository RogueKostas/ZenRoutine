import type { ActivityType, Goal } from '../types';
import { formatDuration, formatGoalTimeLabel, parseDuration, parseLocalDateKey } from '../utils/time';
import type { GoalMoveTarget } from './goalOrder';

/**
 * The Goals list (design §4.4, pp. 47–67) as pure functions: which rows show, what a new row gets,
 * how estimates read, and where a dragged row lands. The screen only wires these to views.
 */

/** The filter box: one activity type's id, or `null` for every goal ("All"). */
export type GoalListFilter = string | null;

/** A goal with both of the fields the forecast needs (#50: either may be missing). */
export type SchedulableGoal = Goal & { activityTypeId: string; estimatedMinutes: number };

export function isSchedulableGoal(goal: Goal): goal is SchedulableGoal {
  return (
    typeof goal.activityTypeId === 'string' &&
    goal.activityTypeId.length > 0 &&
    typeof goal.estimatedMinutes === 'number' &&
    Number.isFinite(goal.estimatedMinutes) &&
    goal.estimatedMinutes > 0
  );
}

/**
 * A tracking entry may name a goal only when the goal has the entry's activity type. A goal with
 * no type therefore cannot take tracked time until it is given one.
 */
export function goalAcceptsTrackingFor(
  goal: Pick<Goal, 'activityTypeId'>,
  activityTypeId: string
): boolean {
  return goal.activityTypeId !== undefined && goal.activityTypeId === activityTypeId;
}

/**
 * Goals with tracked time linked to them. Their type is fixed (the store refuses to change it, so
 * the linked entries keep matching their goal); the type picker says so instead of failing quietly.
 */
export function goalIdsWithLinkedTracking(entries: readonly { goalId?: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) if (entry.goalId) ids.add(entry.goalId);
  return ids;
}

/** A filter naming a type that no longer exists falls back to "All". */
export function resolveGoalListFilter(
  filter: GoalListFilter,
  activityTypes: readonly Pick<ActivityType, 'id'>[]
): GoalListFilter {
  return filter !== null && activityTypes.some((type) => type.id === filter) ? filter : null;
}

/**
 * The rows the list shows, in list order. Filtered: only that type's goals (p64). Archived goals
 * are left out unless asked for; they stay reachable from the list's footer.
 */
export function goalsInList<G extends Pick<Goal, 'activityTypeId' | 'status'>>(
  goals: readonly G[],
  filter: GoalListFilter,
  showArchived = false
): G[] {
  return goals.filter(
    (goal) =>
      (filter === null || goal.activityTypeId === filter) &&
      (showArchived || goal.status !== 'archived')
  );
}

/** The type column shows only in the unfiltered list (p64–p67 drop it). */
export function showsTypeColumn(filter: GoalListFilter): boolean {
  return filter === null;
}

export type NewGoalFromAddRow =
  | { ok: true; goal: { name: string; description: string; activityTypeId?: string } }
  | { ok: false; error: string };

/**
 * The add row (p47–p50, p67): a name and nothing else. "Adding Goals in filtered lists
 * automatically gives the goal the activity type of the filter" (p67); under "All" the goal has
 * no type. No estimate is stored: the `1hr` the row then shows is a placeholder.
 */
export function newGoalFromAddRow(name: string, filter: GoalListFilter): NewGoalFromAddRow {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Type a name, then press Enter.' };
  return {
    ok: true,
    goal: filter === null
      ? { name: trimmed, description: '' }
      : { name: trimmed, description: '', activityTypeId: filter },
  };
}

/** What an unestimated row shows, muted (p50). Not stored; see `Goal.estimatedMinutes`. */
export const PLACEHOLDER_ESTIMATE_LABEL = '1hr';

/** The estimate column in the design's style: `20min`, `1hr`, `10hrs`, `1h 30m`. */
export function formatGoalEstimate(minutes: number | undefined): { text: string; placeholder: boolean } {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return { text: PLACEHOLDER_ESTIMATE_LABEL, placeholder: true };
  }
  const total = Math.round(minutes);
  if (total < 60) return { text: `${total}min`, placeholder: false };
  if (total % 60 === 0) {
    const hours = total / 60;
    return { text: `${hours}${hours === 1 ? 'hr' : 'hrs'}`, placeholder: false };
  }
  return { text: formatDuration(total), placeholder: false };
}

export type EstimateDraft =
  | { kind: 'set'; minutes: number; echo: string }
  | { kind: 'clear'; echo: string }
  | { kind: 'error'; error: string };

/**
 * The inline estimate field (p55–p58). A bare number is hours (`10` → 10hrs); `12h`, `90m` and
 * `1h30` work too. Emptying the field removes the estimate, which is allowed (#50).
 */
export function readEstimateDraft(text: string): EstimateDraft {
  if (!text.trim()) return { kind: 'clear', echo: 'No estimate' };
  const parsed = parseDuration(text);
  if ('error' in parsed) return { kind: 'error', error: parsed.error };
  return { kind: 'set', minutes: parsed.minutes, echo: `= ${formatDuration(parsed.minutes)}` };
}

/** The text an estimate field starts with when opened: the stored value, or `1` for a new row (p56). */
export function estimateDraftStart(minutes: number | undefined): string {
  if (minutes === undefined) return '1';
  return formatDuration(minutes).replace(' ', '');
}

/** Logged over estimate, 0–100, or `null` when there is no estimate to measure against. */
export function goalProgressPercent(goal: Pick<Goal, 'loggedMinutes' | 'estimatedMinutes'>): number | null {
  const estimate = goal.estimatedMinutes;
  if (estimate === undefined || !(estimate > 0)) return null;
  return Math.min(100, Math.max(0, (goal.loggedMinutes / estimate) * 100));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-03` → `3 Oct`, with the year only when it is not `todayKey`'s. */
export function formatForecastDay(dateKey: string, todayKey: string): string {
  const date = parseLocalDateKey(dateKey);
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return dateKey.slice(0, 4) === todayKey.slice(0, 4) ? label : `${label} ${date.getFullYear()}`;
}

/**
 * The small line under a row's name. Secondary by design: the row itself is the design's
 * checkbox · name · type · estimate. `forecastDay` is the forecast's date key, `null` when the
 * forecast found no routine time, and `undefined` when the goal was not forecast at all.
 */
export function goalRowHint(
  goal: Pick<Goal, 'status' | 'activityTypeId' | 'estimatedMinutes' | 'loggedMinutes'>,
  forecastDay: string | null | undefined,
  todayKey: string
): string | null {
  if (goal.status === 'archived') return 'Archived';
  const logged = goal.loggedMinutes > 0 ? formatGoalTimeLabel(goal.loggedMinutes, goal.estimatedMinutes) : null;
  const parts: string[] = [];
  if (goal.status === 'paused') parts.push('Paused');
  if (goal.activityTypeId === undefined) {
    if (goal.status !== 'completed') parts.push('No type: not scheduled, and time can’t be tracked to it');
  } else if (logged) {
    parts.push(logged);
  }
  if (goal.status === 'active' && goal.activityTypeId !== undefined) {
    if (goal.estimatedMinutes === undefined) parts.push('No estimate, so no forecast');
    else if (forecastDay === null) parts.push('No routine time for this type');
    else if (forecastDay !== undefined) parts.push(`Done by ${formatForecastDay(forecastDay, todayKey)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------------------------
// Reordering (p65–p67: "Drag and move rows around to reprioritise")
// ---------------------------------------------------------------------------------------------

export interface RowLayout {
  /** Top of the row within the list. */
  y: number;
  height: number;
}

/**
 * Where a row dragged by `dy` would land, as an index into the visible rows *after* the move.
 * The dragged row's centre is compared with the centres of the other rows: every row whose centre
 * it has passed is counted as above it. Rows may differ in height.
 */
export function dropIndexForDrag(layouts: readonly RowLayout[], from: number, dy: number): number {
  const dragged = layouts[from];
  if (!dragged || !Number.isFinite(dy)) return from;
  const centre = dragged.y + dragged.height / 2 + dy;
  let index = 0;
  layouts.forEach((layout, i) => {
    if (i !== from && layout.y + layout.height / 2 < centre) index += 1;
  });
  return index;
}

/**
 * How far a row that is not being dragged moves to make room, while the dragged row (visible index
 * `from`, height `draggedHeight`) hovers over index `to` (p66: the row below is pushed down).
 */
export function rowShiftDuringDrag(index: number, from: number, to: number, draggedHeight: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -draggedHeight;
  if (to < from && index >= to && index < from) return draggedHeight;
  return 0;
}

/**
 * The `moveGoal` call for moving visible row `from` to visible index `to`. Named by a visible
 * neighbour, so hidden rows of other types keep their places when the list is filtered.
 * `null` when nothing moves.
 */
export function moveTargetForDrop(
  visibleIds: readonly string[],
  from: number,
  to: number
): GoalMoveTarget | null {
  if (from === to || !visibleIds[from]) return null;
  const clamped = Math.max(0, Math.min(visibleIds.length - 1, to));
  if (clamped === from) return null;
  return clamped < from ? { before: visibleIds[clamped] } : { after: visibleIds[clamped] };
}

/** "Move up" / "Move down" (the keyboard and screen-reader route): one visible row at a time. */
export function moveTargetForStep(
  visibleIds: readonly string[],
  goalId: string,
  step: -1 | 1
): GoalMoveTarget | null {
  const from = visibleIds.indexOf(goalId);
  if (from < 0) return null;
  return moveTargetForDrop(visibleIds, from, from + step);
}

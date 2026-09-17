import { getRoutineBreakdown } from '../../core/engine/analytics';
import type { ActivityType, Routine } from '../../core/types';

// Pure maths for the breakdown pie and the ranked bars (DESIGN-2019 §4.3, p42–p43).
// Angles are degrees clockwise from 12 o'clock.

export interface BreakdownDatum {
  id: string;
  name: string;
  color: string;
  minutes: number;
}

/** Planned weekly minutes per activity type for a routine, largest first (p42). */
export function plannedBreakdown(
  routine: Routine | null | undefined,
  activityTypes: ActivityType[]
): BreakdownDatum[] {
  if (!routine) return [];
  return getRoutineBreakdown(routine, activityTypes).map((row) => ({
    id: row.activityTypeId,
    name: row.activityTypeName,
    color: row.color,
    minutes: row.plannedMinutes,
  }));
}

export interface PieSlice extends BreakdownDatum {
  /** Share of the total, 0–1. */
  fraction: number;
  /** Whole-number percentage for the legend. */
  percent: number;
  startAngle: number;
  sweep: number;
}

/**
 * One slice per datum with minutes > 0, in the given order, starting at 12 o'clock.
 * The sweeps add up to exactly 360 (the last slice takes the remainder).
 */
export function pieSlices(data: readonly BreakdownDatum[]): PieSlice[] {
  const rows = data.filter((row) => Number.isFinite(row.minutes) && row.minutes > 0);
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  if (total <= 0) return [];
  let angle = 0;
  return rows.map((row, index) => {
    const fraction = row.minutes / total;
    const sweep = index === rows.length - 1 ? 360 - angle : fraction * 360;
    const slice: PieSlice = {
      ...row,
      fraction,
      percent: Math.round(fraction * 100),
      startAngle: angle,
      sweep,
    };
    angle += sweep;
    return slice;
  });
}

export interface PieWedge {
  key: string;
  color: string;
  startAngle: number;
  /** 0 < sweep ≤ 180, so a wedge can be drawn as a rotated half-disc inside a half-circle clip. */
  sweep: number;
}

/** Slices split into wedges of at most 180°. */
export function pieWedges(slices: readonly PieSlice[]): PieWedge[] {
  const wedges: PieWedge[] = [];
  for (const slice of slices) {
    let start = slice.startAngle;
    let remaining = slice.sweep;
    let part = 0;
    while (remaining > 0) {
      const sweep = Math.min(180, remaining);
      wedges.push({ key: `${slice.id}:${part}`, color: slice.color, startAngle: start, sweep });
      start += sweep;
      remaining -= sweep;
      part += 1;
    }
  }
  return wedges;
}

export interface BreakdownBar extends BreakdownDatum {
  /** Bar length relative to the longest bar, 0–1 (p43: "Bar length is proportional to hours"). */
  widthFraction: number;
}

/** Bars ranked longest first (p43). */
export function rankedBars(data: readonly BreakdownDatum[]): BreakdownBar[] {
  const rows = data
    .filter((row) => Number.isFinite(row.minutes) && row.minutes > 0)
    .sort((left, right) => right.minutes - left.minutes || left.name.localeCompare(right.name));
  const longest = rows[0]?.minutes ?? 0;
  return rows.map((row) => ({ ...row, widthFraction: longest > 0 ? row.minutes / longest : 0 }));
}

/** `35hrs`, `8.5hrs`, `45min` — the p43 bar labels. */
export function formatWeeklyHours(minutes: number): string {
  if (!(minutes > 0)) return '0hrs';
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}hrs`;
}

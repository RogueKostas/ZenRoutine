import type { ActivityType, DayOfWeek, RoutineBlock } from '../../core/types';

// Pure layout maths for the day ribbon (DESIGN-2019 §4.2 p23–p41, §4.6 p73–p77).
// Horizontal positions are fractions (0–1) of the visible window, except label placement,
// which needs pixels because collisions depend on the rendered width.

const MINUTES_PER_DAY = 1440;

/** The visible part of the day, in minutes from midnight. `endMinutes` may be 1440. */
export interface RibbonWindow {
  startMinutes: number;
  endMinutes: number;
}

/** 7am–11pm: the design's default active hours (p09, p13). */
export const DEFAULT_RIBBON_WINDOW: RibbonWindow = { startMinutes: 7 * 60, endMinutes: 23 * 60 };

/** A window that is not 0 ≤ start < end ≤ 1440 falls back to the default. */
export function normalizeRibbonWindow(window?: RibbonWindow): RibbonWindow {
  if (
    !window ||
    !Number.isFinite(window.startMinutes) ||
    !Number.isFinite(window.endMinutes) ||
    window.startMinutes < 0 ||
    window.endMinutes > MINUTES_PER_DAY ||
    window.startMinutes >= window.endMinutes
  ) {
    return DEFAULT_RIBBON_WINDOW;
  }
  return window;
}

function toFraction(minutes: number, window: RibbonWindow): number {
  return (minutes - window.startMinutes) / (window.endMinutes - window.startMinutes);
}

/** Clip a same-day span to the window; null when nothing of it is visible. */
function clipSpan(
  startMinutes: number,
  endMinutes: number,
  window: RibbonWindow
): { startMinutes: number; endMinutes: number } | null {
  const start = Math.max(startMinutes, window.startMinutes);
  const end = Math.min(endMinutes, window.endMinutes);
  return end > start ? { startMinutes: start, endMinutes: end } : null;
}

// ============================================
// Segments
// ============================================

export interface RibbonSegment {
  key: string;
  block: RoutineBlock;
  /** Visible start and end, clipped to the window, in minutes from the displayed midnight. */
  startMinutes: number;
  endMinutes: number;
  /** Left edge and width as fractions of the window. */
  x: number;
  width: number;
  /** True when the block carries on past this segment's left or right edge (window or midnight). */
  clippedStart: boolean;
  clippedEnd: boolean;
  /** True for the morning tail of the previous day's overnight block. */
  carryover: boolean;
}

interface DaySpan {
  startMinutes: number;
  endMinutes: number;
  carryover: boolean;
}

/**
 * The part of `block` that falls on the displayed day, in that day's minutes.
 * An overnight block (end < start) runs to midnight on its own day and from midnight on the
 * next day. With `day` omitted every block is taken to belong to the displayed day.
 * Stored `DayOfWeek` is 0 = Sunday.
 */
export function blockSpansOnDay(block: RoutineBlock, day?: DayOfWeek): DaySpan[] {
  const overnight = block.endMinutes < block.startMinutes;
  const spans: DaySpan[] = [];
  if (day === undefined || block.dayOfWeek === day) {
    const end = overnight ? MINUTES_PER_DAY : block.endMinutes;
    if (end > block.startMinutes) {
      spans.push({ startMinutes: block.startMinutes, endMinutes: end, carryover: false });
    }
  }
  if (day !== undefined && overnight && block.dayOfWeek === (day + 6) % 7 && block.endMinutes > 0) {
    spans.push({ startMinutes: 0, endMinutes: block.endMinutes, carryover: true });
  }
  return spans;
}

/** Map a day's blocks to visible segments, ordered by start time (carry-overs first on a tie). */
export function layoutRibbonSegments(
  blocks: readonly RoutineBlock[],
  options: { day?: DayOfWeek; window?: RibbonWindow } = {}
): RibbonSegment[] {
  const window = normalizeRibbonWindow(options.window);
  const segments: RibbonSegment[] = [];
  for (const block of blocks) {
    const overnight = block.endMinutes < block.startMinutes;
    for (const span of blockSpansOnDay(block, options.day)) {
      const clipped = clipSpan(span.startMinutes, span.endMinutes, window);
      if (!clipped) continue;
      const x = toFraction(clipped.startMinutes, window);
      segments.push({
        key: span.carryover ? `${block.id}:carryover` : block.id,
        block,
        startMinutes: clipped.startMinutes,
        endMinutes: clipped.endMinutes,
        x,
        width: toFraction(clipped.endMinutes, window) - x,
        clippedStart: clipped.startMinutes > span.startMinutes || span.carryover,
        clippedEnd: clipped.endMinutes < span.endMinutes || (overnight && !span.carryover),
        carryover: span.carryover,
      });
    }
  }
  return segments.sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      Number(right.carryover) - Number(left.carryover) ||
      left.key.localeCompare(right.key)
  );
}

// ============================================
// Overlays (grey "untracked" spans, #54 — supplied by the caller, never computed here)
// ============================================

export type RibbonOverlayStyle = 'untracked';

export interface RibbonOverlay {
  key?: string;
  /** Minutes from the displayed midnight. end < start means "until midnight". */
  startMinutes: number;
  endMinutes: number;
  style: RibbonOverlayStyle;
}

export interface RibbonOverlaySegment {
  key: string;
  style: RibbonOverlayStyle;
  startMinutes: number;
  endMinutes: number;
  x: number;
  width: number;
}

export function layoutRibbonOverlays(
  overlays: readonly RibbonOverlay[],
  window?: RibbonWindow
): RibbonOverlaySegment[] {
  const visibleWindow = normalizeRibbonWindow(window);
  const result: RibbonOverlaySegment[] = [];
  overlays.forEach((overlay, index) => {
    const end = overlay.endMinutes < overlay.startMinutes ? MINUTES_PER_DAY : overlay.endMinutes;
    const clipped = clipSpan(overlay.startMinutes, end, visibleWindow);
    if (!clipped) return;
    const x = toFraction(clipped.startMinutes, visibleWindow);
    result.push({
      key: overlay.key ?? `overlay-${index}`,
      style: overlay.style,
      ...clipped,
      x,
      width: toFraction(clipped.endMinutes, visibleWindow) - x,
    });
  });
  return result;
}

// ============================================
// Hour ticks
// ============================================

export interface RibbonTick {
  minutes: number;
  x: number;
  /** `8`, `9` … `12`, `1` … — the design's bare 12-hour numbers (p24). Empty when thinned out. */
  label: string;
}

/** Below this many pixels per labelled hour, labels thin to every other hour (~480px wide). */
export const MIN_TICK_LABEL_SPACING_PX = 30;
/** Hour labels this close to either end are dropped so they don't run into `7am` / `11pm`. */
export const TICK_EDGE_CLEARANCE_PX = 24;

export function formatRibbonHour(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 12;
  return String(hour === 0 ? 12 : hour);
}

/** The labels under the ribbon's ends: `7am`, `11pm`, `7:30am`, `12am`. */
export function formatRibbonEdgeLabel(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const suffix = hours24 < 12 ? 'am' : 'pm';
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return mins === 0 ? `${hour}${suffix}` : `${hour}:${String(mins).padStart(2, '0')}${suffix}`;
}

/** Label every `step` hours: 1 where there is room, 2 on narrow widths, more when very tight. */
export function tickLabelStep(widthPx: number, window?: RibbonWindow): number {
  const visible = normalizeRibbonWindow(window);
  const hours = (visible.endMinutes - visible.startMinutes) / 60;
  if (!(widthPx > 0)) return 1;
  const pxPerHour = widthPx / hours;
  for (const step of [1, 2, 3, 4, 6]) {
    if (pxPerHour * step >= MIN_TICK_LABEL_SPACING_PX) return step;
  }
  return 12;
}

/**
 * One tick per whole hour strictly inside the window. With `widthPx`, labels are thinned
 * (counting whole hours from the window start, so on 7–23 the narrow set is 9, 11, 1 … 9) and
 * dropped near the ends. The tick marks themselves are always returned.
 */
export function layoutRibbonTicks(window?: RibbonWindow, widthPx?: number): RibbonTick[] {
  const visible = normalizeRibbonWindow(window);
  const step = widthPx === undefined ? 1 : tickLabelStep(widthPx, visible);
  const ticks: RibbonTick[] = [];
  const firstHour = Math.floor(visible.startMinutes / 60) + 1;
  for (let hour = firstHour; hour * 60 < visible.endMinutes; hour++) {
    const minutes = hour * 60;
    const x = toFraction(minutes, visible);
    const hoursFromStart = Math.round((minutes - visible.startMinutes) / 60);
    const nearEdge =
      widthPx !== undefined &&
      (x * widthPx < TICK_EDGE_CLEARANCE_PX || (1 - x) * widthPx < TICK_EDGE_CLEARANCE_PX);
    const labelled = hoursFromStart % step === 0 && !nearEdge;
    ticks.push({ minutes, x, label: labelled ? formatRibbonHour(minutes) : '' });
  }
  return ticks;
}

// ============================================
// Labels above the ribbon, on leader lines, at alternating heights (p24)
// ============================================

export interface RibbonLabelInput {
  key: string;
  text: string;
  /** Where the leader line meets the ribbon: the segment's centre, in pixels. */
  anchorPx: number;
}

export interface RibbonLabelOptions {
  widthPx: number;
  /** Rough average glyph width at the label font size. */
  charWidthPx?: number;
  /** Labels never grow past this; longer text is truncated by the renderer. */
  maxLabelPx?: number;
  /** A label squeezed below this is hidden rather than drawn as an ellipsis. */
  minLabelPx?: number;
  /** Horizontal space kept between labels on the same tier. */
  gapPx?: number;
  /** Space kept between a label and a higher label's leader line. */
  leaderClearancePx?: number;
  /** Tier 0 sits nearest the ribbon. */
  maxTiers?: number;
}

export interface RibbonLabel {
  key: string;
  text: string;
  anchorPx: number;
  leftPx: number;
  widthPx: number;
  tier: number;
  /** True when the label box is narrower than its text wants. */
  truncated: boolean;
}

export const RIBBON_LABEL_DEFAULTS = {
  charWidthPx: 6,
  maxLabelPx: 120,
  minLabelPx: 24,
  gapPx: 4,
  leaderClearancePx: 2,
  maxTiers: 3,
} as const;

/** Estimated rendered width of `text`, capped at `maxLabelPx`. */
export function estimateLabelWidth(
  text: string,
  charWidthPx: number = RIBBON_LABEL_DEFAULTS.charWidthPx,
  maxLabelPx: number = RIBBON_LABEL_DEFAULTS.maxLabelPx
): number {
  return Math.min(maxLabelPx, Math.ceil(text.length * charWidthPx) + 2);
}

interface PendingLabel {
  key: string;
  text: string;
  anchor: number;
  desired: number;
}

type LabelOptions = Required<RibbonLabelOptions>;

/**
 * Stack labels in tiers above the ribbon so crowded neighbours alternate heights (p24).
 *
 * Tiers fill from the ribbon upwards, left to right. On a tier a label may not overlap another
 * label (plus `gapPx`) and may not cover the leader line of any label that is still unplaced or
 * sits higher. So a label box only ever covers the leaders of labels below it, and no leader
 * passes through a label. Labels that fit on no tier at full width then take the widest gap
 * left on any tier (truncated) if it is at least `minLabelPx`; the rest are left out.
 * Deterministic: input order is irrelevant.
 */
export function layoutRibbonLabels(
  inputs: readonly RibbonLabelInput[],
  options: RibbonLabelOptions
): RibbonLabel[] {
  const opts: LabelOptions = { ...RIBBON_LABEL_DEFAULTS, ...options };
  const width = Math.max(0, opts.widthPx);
  let pending: PendingLabel[] = [...inputs]
    .filter((input) => input.text.length > 0)
    .sort((left, right) => left.anchorPx - right.anchorPx || left.key.localeCompare(right.key))
    .map((input) => ({
      key: input.key,
      text: input.text,
      anchor: Math.min(width, Math.max(0, input.anchorPx)),
      desired: estimateLabelWidth(input.text, opts.charWidthPx, opts.maxLabelPx),
    }));
  const placed: RibbonLabel[] = [];

  const place = (label: PendingLabel, tier: number, free: { left: number; right: number }) => {
    const labelWidth = Math.min(label.desired, free.right - free.left);
    placed.push({
      key: label.key,
      text: label.text,
      anchorPx: label.anchor,
      leftPx: Math.min(Math.max(label.anchor - labelWidth / 2, free.left), free.right - labelWidth),
      widthPx: labelWidth,
      tier,
      truncated: labelWidth < label.desired,
    });
  };

  for (let tier = 0; tier < opts.maxTiers; tier++) {
    for (const label of [...pending]) {
      const free = freeIntervalAround(label, tier, placed, pending, width, opts);
      if (free && free.right - free.left >= label.desired) {
        place(label, tier, free);
        pending = pending.filter((candidate) => candidate !== label);
      }
    }
  }

  for (const label of [...pending]) {
    pending = pending.filter((candidate) => candidate !== label);
    let best: { tier: number; left: number; right: number } | null = null;
    for (let tier = 0; tier < opts.maxTiers; tier++) {
      const free = freeIntervalAround(label, tier, placed, pending, width, opts);
      if (!free || free.right - free.left < opts.minLabelPx) continue;
      if (!best || free.right - free.left > best.right - best.left) best = { tier, ...free };
    }
    if (best) place(label, best.tier, best);
  }

  return placed.sort((left, right) => left.anchorPx - right.anchorPx || left.key.localeCompare(right.key));
}

/** The open interval on `tier` around `label`'s anchor, or null if the tier is blocked. */
function freeIntervalAround(
  label: PendingLabel,
  tier: number,
  placed: readonly RibbonLabel[],
  pending: readonly PendingLabel[],
  width: number,
  opts: LabelOptions
): { left: number; right: number } | null {
  const anchor = label.anchor;
  const obstacles: Array<[number, number]> = [];
  for (const other of placed) {
    if (other.tier < tier) {
      // Our leader would pass through this lower label. (That label already kept its
      // clearance from our anchor when it was placed, so the raw box is the test.)
      if (anchor >= other.leftPx && anchor <= other.leftPx + other.widthPx) return null;
    } else if (other.tier === tier) {
      obstacles.push([other.leftPx - opts.gapPx, other.leftPx + other.widthPx + opts.gapPx]);
    } else {
      obstacles.push([other.anchorPx - opts.leaderClearancePx, other.anchorPx + opts.leaderClearancePx]);
    }
  }
  for (const other of pending) {
    // A label sharing our exact anchor can never have both; the first placed wins.
    if (other === label || other.anchor === anchor) continue;
    obstacles.push([other.anchor - opts.leaderClearancePx, other.anchor + opts.leaderClearancePx]);
  }

  let left = 0;
  let right = width;
  for (const [obstacleLeft, obstacleRight] of obstacles) {
    if (anchor >= obstacleLeft && anchor <= obstacleRight) return null;
    if (obstacleRight < anchor) left = Math.max(left, obstacleRight);
    else right = Math.min(right, obstacleLeft);
  }
  return right > left ? { left, right } : null;
}

// ============================================
// "You are here (in time)" marker (p73–p77)
// ============================================

/** Minutes since local midnight, including seconds, for `now`. */
export function minutesIntoDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

/** The marker's position as a fraction of the window, or null when `now` is outside it. */
export function nowMarkerFraction(now: Date | null | undefined, window?: RibbonWindow): number | null {
  if (!now || !Number.isFinite(now.getTime())) return null;
  const visible = normalizeRibbonWindow(window);
  const minutes = minutesIntoDay(now);
  if (minutes < visible.startMinutes || minutes > visible.endMinutes) return null;
  return toFraction(minutes, visible);
}

// ============================================
// Label text and vertical geometry
// ============================================

export type RibbonLabelMode = 'type' | 'custom' | 'none';

/** Text above a segment for the given mode; empty when it should have no label. */
export function ribbonSegmentLabel(
  block: RoutineBlock,
  mode: RibbonLabelMode,
  activityTypes: readonly ActivityType[],
  labelFor?: (block: RoutineBlock) => string | null | undefined
): string {
  if (mode === 'none') return '';
  const typeName = activityTypes.find((type) => type.id === block.activityTypeId)?.name ?? '';
  if (mode === 'custom') return labelFor?.(block)?.trim() || typeName;
  return typeName;
}

export const LABEL_TIER_HEIGHT = 15;
export const LABEL_TIERS = RIBBON_LABEL_DEFAULTS.maxTiers;
export const MARKER_HEAD = 10;
const LEADER_MIN = 6;
const TICK_AREA_HEIGHT = 18;

/** Vertical layout in pixels: where the bar sits and how tall the whole ribbon is. */
export function ribbonGeometry(compact: boolean, barHeight?: number) {
  const bar = barHeight ?? (compact ? 24 : 14);
  const labelArea = compact ? 0 : LABEL_TIERS * LABEL_TIER_HEIGHT + LEADER_MIN;
  const markerHeadroom = compact ? 0 : MARKER_HEAD / 2;
  const barTop = markerHeadroom + labelArea;
  const total = barTop + bar + (compact ? 0 : TICK_AREA_HEIGHT);
  return { bar, labelArea, barTop, total, markerHeadroom };
}

// ============================================
// Hit-testing (tap to edit, p36)
// ============================================

/**
 * The segment under `fraction`. Where segments overlap, the one drawn last (on top) wins.
 * With no direct hit, the nearest segment within `tolerance` (a fraction) is returned, so a
 * finger can still pick a five-minute block.
 */
export function hitTestSegment(
  segments: readonly RibbonSegment[],
  fraction: number,
  tolerance: number = 0
): RibbonSegment | null {
  if (!Number.isFinite(fraction)) return null;
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const end = segment.x + segment.width;
    // The window's right edge belongs to the segment that ends there.
    if (fraction >= segment.x && (fraction < end || (fraction === 1 && end >= 1))) return segment;
  }

  let nearest: RibbonSegment | null = null;
  let nearestDistance = Infinity;
  for (const segment of segments) {
    const distance =
      fraction < segment.x ? segment.x - fraction : fraction - (segment.x + segment.width);
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = segment;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// ============================================
// Tap on empty time (p13: "Press and Release anywhere to add a new Activity")
// ============================================

/** Minutes from midnight at `fraction` (clamped to 0–1) of the window. */
export function minutesAtFraction(fraction: number, window?: RibbonWindow): number {
  const visible = normalizeRibbonWindow(window);
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return visible.startMinutes + clamped * (visible.endMinutes - visible.startMinutes);
}

/**
 * Horizontal press position in pixels from the pressed element's left edge. Native press events
 * carry `locationX`; on react-native-web `onPress` fires from the DOM click, which has `offsetX`.
 */
export function pressLocationX(nativeEvent: { locationX?: unknown; offsetX?: unknown }): number | null {
  for (const value of [nativeEvent.locationX, nativeEvent.offsetX]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/** Screen-reader label for an editable segment: "Work, 9am to 12pm, Monday". */
export function ribbonSegmentAccessibilityLabel(
  typeName: string,
  block: Pick<RoutineBlock, 'startMinutes' | 'endMinutes'>,
  dayName?: string
): string {
  const parts = [
    typeName,
    `${formatRibbonEdgeLabel(block.startMinutes)} to ${formatRibbonEdgeLabel(block.endMinutes)}`,
  ];
  if (dayName) parts.push(dayName);
  return parts.join(', ');
}

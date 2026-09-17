import type { DayOfWeek, RoutineBlock } from '../../core/types';
import { DEFAULT_RIBBON_WINDOW, RibbonWindow, blockSpansOnDay } from './ribbonLayout';

// Pure maths for direct manipulation of the day ribbon (DESIGN-2019 §4.2 p31–p35):
// dragging activity extents, and zooming / panning the visible window.

const MINUTES_PER_DAY = 1440;

/** Dragged edges land on quarter hours. */
export const EDGE_SNAP_MINUTES = 15;
/** A drag never shrinks a block below this. */
export const MIN_BLOCK_MINUTES = 15;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function snapMinutes(minutes: number, step: number = EDGE_SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

// ============================================
// Edges
// ============================================

/**
 * The same-day extent of a block a drag can change, or null. A block ending at midnight is stored
 * with `endMinutes` 0 and has extent end 1440. Overnight blocks are not draggable (their far edge
 * is on another day) but still limit their neighbours.
 */
export function draggableExtent(block: RoutineBlock): { startMinutes: number; endMinutes: number } | null {
  const end = block.endMinutes === 0 ? MINUTES_PER_DAY : block.endMinutes;
  return end > block.startMinutes ? { startMinutes: block.startMinutes, endMinutes: end } : null;
}

/** A grabbable boundary. When both blocks are set it is shared (p34–p35) and moves both. */
export interface RibbonEdge {
  key: string;
  minutes: number;
  /** The block that ends here; dragging moves its end. */
  endOf: RoutineBlock | null;
  /** The block that starts here; dragging moves its start. */
  startOf: RoutineBlock | null;
}

export function isSharedEdge(edge: RibbonEdge): boolean {
  return edge.endOf !== null && edge.startOf !== null;
}

/** Every draggable edge of `day`'s blocks, ordered by time; touching ends and starts merge. */
export function ribbonEdges(blocks: readonly RoutineBlock[], day: DayOfWeek): RibbonEdge[] {
  const byMinute = new Map<number, RibbonEdge>();
  const edgeAt = (minutes: number) => {
    let edge = byMinute.get(minutes);
    if (!edge) {
      edge = { key: `edge-${minutes}`, minutes, endOf: null, startOf: null };
      byMinute.set(minutes, edge);
    }
    return edge;
  };
  for (const block of blocks) {
    if (block.dayOfWeek !== day) continue;
    const extent = draggableExtent(block);
    if (!extent) continue;
    // If two blocks claim the same side of one minute the data already overlaps; keep the first.
    const start = edgeAt(extent.startMinutes);
    if (!start.startOf) start.startOf = block;
    const end = edgeAt(extent.endMinutes);
    if (!end.endOf) end.endOf = block;
  }
  return [...byMinute.values()].sort((left, right) => left.minutes - right.minutes);
}

/**
 * How far `edge` may move: the block that ends here keeps at least `minLength`, as does the block
 * that starts here, and a free side stops at the nearest other activity on the day (overnight
 * spans included). A block already shorter than `minLength` may grow but not shrink.
 */
export function edgeDragBounds(
  edge: RibbonEdge,
  blocks: readonly RoutineBlock[],
  day: DayOfWeek,
  minLength: number = MIN_BLOCK_MINUTES
): { min: number; max: number } {
  const moving = new Set([edge.endOf?.id, edge.startOf?.id].filter(Boolean));
  const others = blocks
    .filter((block) => !moving.has(block.id))
    .flatMap((block) => blockSpansOnDay(block, day));

  let min: number;
  if (edge.endOf) {
    min = draggableExtent(edge.endOf)!.startMinutes + minLength;
  } else {
    min = Math.max(0, ...others.filter((span) => span.endMinutes <= edge.minutes).map((span) => span.endMinutes));
  }
  let max: number;
  if (edge.startOf) {
    max = draggableExtent(edge.startOf)!.endMinutes - minLength;
  } else {
    max = Math.min(
      MINUTES_PER_DAY,
      ...others.filter((span) => span.startMinutes >= edge.minutes).map((span) => span.startMinutes)
    );
  }
  return { min: Math.min(min, edge.minutes), max: Math.max(max, edge.minutes) };
}

export const EDGE_HANDLE_MIN_HIT_PX = 10;
export const EDGE_HANDLE_MAX_HIT_PX = 20;

/**
 * Width of an edge's grab area: at most 40% of the shorter adjacent block's on-screen width, so the
 * middle of a segment stays tappable, within `EDGE_HANDLE_MIN_HIT_PX`–`EDGE_HANDLE_MAX_HIT_PX`.
 */
export function edgeHandleHitWidth(edge: RibbonEdge, pxPerMinute: number): number {
  const lengths = [edge.endOf, edge.startOf]
    .map((block) => (block ? draggableExtent(block) : null))
    .filter((extent): extent is { startMinutes: number; endMinutes: number } => extent !== null)
    .map((extent) => extent.endMinutes - extent.startMinutes);
  if (lengths.length === 0 || !(pxPerMinute > 0)) return EDGE_HANDLE_MAX_HIT_PX;
  return clamp(Math.min(...lengths) * pxPerMinute * 0.4, EDGE_HANDLE_MIN_HIT_PX, EDGE_HANDLE_MAX_HIT_PX);
}

/** A handle released within this many pixels of where it was grabbed was tapped, not dragged. */
export const EDGE_TAP_SLOP_PX = 4;

/** Pixels dragged → unsnapped minutes for an edge that started at `originMinutes`. */
export function dragDeltaToMinutes(
  originMinutes: number,
  dxPx: number,
  widthPx: number,
  window: RibbonWindow
): number {
  if (!(widthPx > 0) || !Number.isFinite(dxPx)) return originMinutes;
  return originMinutes + (dxPx / widthPx) * (window.endMinutes - window.startMinutes);
}

/** Where the edge lands: snapped to the quarter hour, then held inside `bounds`. */
export function resolveEdgeMinutes(rawMinutes: number, bounds: { min: number; max: number }): number {
  return clamp(snapMinutes(rawMinutes), bounds.min, bounds.max);
}

export interface BlockTimeUpdate {
  id: string;
  data: { startMinutes?: number; endMinutes?: number };
}

/** The store update for moving `edge` to `minutes`: one entry per block, none if it didn't move. */
export function edgeMoveUpdates(edge: RibbonEdge, minutes: number): BlockTimeUpdate[] {
  if (minutes === edge.minutes) return [];
  const updates: BlockTimeUpdate[] = [];
  if (edge.endOf) {
    updates.push({ id: edge.endOf.id, data: { endMinutes: minutes % MINUTES_PER_DAY } });
  }
  if (edge.startOf) updates.push({ id: edge.startOf.id, data: { startMinutes: minutes } });
  return updates;
}

/** `blocks` with `updates` applied: the live preview while dragging. */
export function applyBlockTimeUpdates(
  blocks: readonly RoutineBlock[],
  updates: readonly BlockTimeUpdate[]
): RoutineBlock[] {
  if (updates.length === 0) return [...blocks];
  return blocks.map((block) => {
    const update = updates.find((candidate) => candidate.id === block.id);
    return update ? { ...block, ...update.data } : block;
  });
}

// ============================================
// Keyboard nudges (accessibility alternative to dragging)
// ============================================

export type EdgeSide = 'start' | 'end';

/** `[` / `]` move the start and `{` / `}` the end of the focused block by a quarter hour. */
export function edgeNudgeForKey(key: string): { side: EdgeSide; delta: number } | null {
  switch (key) {
    case '[':
      return { side: 'start', delta: -EDGE_SNAP_MINUTES };
    case ']':
      return { side: 'start', delta: EDGE_SNAP_MINUTES };
    case '{':
      return { side: 'end', delta: -EDGE_SNAP_MINUTES };
    case '}':
      return { side: 'end', delta: EDGE_SNAP_MINUTES };
    default:
      return null;
  }
}

/**
 * The updates for nudging one side of `blockId` by `delta` minutes, with the same shared-boundary,
 * snapping and clamping rules as a drag. Empty when it can't move.
 */
export function nudgeEdgeUpdates(
  blocks: readonly RoutineBlock[],
  day: DayOfWeek,
  blockId: string,
  side: EdgeSide,
  delta: number
): BlockTimeUpdate[] {
  const edge = ribbonEdges(blocks, day).find((candidate) =>
    side === 'start' ? candidate.startOf?.id === blockId : candidate.endOf?.id === blockId
  );
  if (!edge) return [];
  const bounds = edgeDragBounds(edge, blocks, day);
  return edgeMoveUpdates(edge, resolveEdgeMinutes(edge.minutes + delta, bounds));
}

// ============================================
// Zoom and pan (p31–p33)
// ============================================

/** Visible spans in minutes, widest first: the full 16-hour day, then 8h, 4h and 2h. */
export const RIBBON_ZOOM_SPANS = [960, 480, 240, 120] as const;
/** Zoomed windows start on a multiple of this, so their end labels read cleanly. */
const ZOOM_ALIGN_MINUTES = 15;

export function windowSpan(window: RibbonWindow): number {
  return window.endMinutes - window.startMinutes;
}

/** The next zoom span in `direction`, or the current span when there is none. */
export function nextZoomSpan(
  currentSpan: number,
  direction: 'in' | 'out',
  bounds: RibbonWindow = DEFAULT_RIBBON_WINDOW
): number {
  const fullSpan = windowSpan(bounds);
  const spans = [...new Set([fullSpan, ...RIBBON_ZOOM_SPANS.filter((span) => span < fullSpan)])];
  if (direction === 'in') return spans.find((span) => span < currentSpan) ?? currentSpan;
  const wider = spans.filter((span) => span > currentSpan);
  return wider.length > 0 ? wider[wider.length - 1] : currentSpan;
}

/** Slide `window` so it stays inside `bounds`, keeping its span (capped at the bounds' span). */
export function clampWindow(window: RibbonWindow, bounds: RibbonWindow = DEFAULT_RIBBON_WINDOW): RibbonWindow {
  const span = Math.min(windowSpan(window), windowSpan(bounds));
  const start = clamp(window.startMinutes, bounds.startMinutes, bounds.endMinutes - span);
  return { startMinutes: start, endMinutes: start + span };
}

/**
 * The window of `span` minutes that keeps `focusMinutes` at the same place on screen, clamped to
 * `bounds` (the cursor, pinch centre or selected segment stays put while zooming).
 */
export function zoomWindow(
  current: RibbonWindow,
  span: number,
  focusMinutes: number,
  bounds: RibbonWindow = DEFAULT_RIBBON_WINDOW
): RibbonWindow {
  if (span >= windowSpan(bounds)) return { ...bounds };
  const focus = clamp(focusMinutes, current.startMinutes, current.endMinutes);
  const fraction = (focus - current.startMinutes) / windowSpan(current);
  const start = snapMinutes(focus - fraction * span, ZOOM_ALIGN_MINUTES);
  return clampWindow({ startMinutes: start, endMinutes: start + span }, bounds);
}

/** `window` moved by `deltaMinutes` (positive = later), clamped to `bounds`, on whole minutes. */
export function panWindow(
  window: RibbonWindow,
  deltaMinutes: number,
  bounds: RibbonWindow = DEFAULT_RIBBON_WINDOW
): RibbonWindow {
  const start = Math.round(window.startMinutes + (Number.isFinite(deltaMinutes) ? deltaMinutes : 0));
  return clampWindow({ startMinutes: start, endMinutes: start + windowSpan(window) }, bounds);
}

/** What the zoom buttons zoom around: the selected block's centre if it is in view, else the middle. */
export function zoomFocusMinutes(window: RibbonWindow, selected?: RoutineBlock | null): number {
  const extent = selected ? draggableExtent(selected) : null;
  if (extent && extent.endMinutes > window.startMinutes && extent.startMinutes < window.endMinutes) {
    return (extent.startMinutes + extent.endMinutes) / 2;
  }
  return (window.startMinutes + window.endMinutes) / 2;
}

/** Pixels the track was dragged → minutes to pan (dragging right shows earlier time). */
export function panDeltaMinutes(dxPx: number, widthPx: number, window: RibbonWindow): number {
  if (!(widthPx > 0) || !Number.isFinite(dxPx)) return 0;
  return (-dxPx / widthPx) * windowSpan(window);
}

export function isFullDay(window: RibbonWindow, bounds: RibbonWindow = DEFAULT_RIBBON_WINDOW): boolean {
  return window.startMinutes <= bounds.startMinutes && window.endMinutes >= bounds.endMinutes;
}

/** Pinch: +1 zooms in, −1 out, 0 while the fingers haven't moved far enough apart or together. */
export function pinchZoomStep(startDistance: number, distance: number): -1 | 0 | 1 {
  if (!(startDistance > 0) || !(distance > 0)) return 0;
  const ratio = distance / startDistance;
  if (ratio >= 1.4) return 1;
  if (ratio <= 1 / 1.4) return -1;
  return 0;
}

/** Wheel travel (in `deltaY` units) per zoom level; one mouse-wheel notch is about 100. */
export const WHEEL_ZOOM_THRESHOLD = 50;

/**
 * Ctrl/⌘+wheel: add `deltaY` to the running total and return a zoom step once it passes the
 * threshold (a trackpad pinch sends many small deltas). Wheel up (negative) zooms in.
 */
export function wheelZoomStep(accumulated: number, deltaY: number): { step: -1 | 0 | 1; remaining: number } {
  const total = accumulated + (Number.isFinite(deltaY) ? deltaY : 0);
  if (total <= -WHEEL_ZOOM_THRESHOLD) return { step: 1, remaining: 0 };
  if (total >= WHEEL_ZOOM_THRESHOLD) return { step: -1, remaining: 0 };
  return { step: 0, remaining: total };
}

/** Short name for a zoom span: `16h`, `2h`, `90m`. */
export function zoomSpanLabel(span: number): string {
  const hours = span / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${Math.round(span)}m`;
}

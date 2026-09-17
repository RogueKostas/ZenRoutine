/**
 * Where a small popover goes relative to the control that opened it. Pure, so it can be tested
 * without a renderer; `Popover.tsx` feeds it `measureInWindow` and the window size.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export const POPOVER_MARGIN = 8;
const GAP = 4;

/**
 * Below the anchor when it fits, otherwise above it when that fits, otherwise wherever keeps it
 * on screen. `align: 'right'` lines up the right edges (the filter box and the type column sit at
 * the right of the screen). Always inside the window, `POPOVER_MARGIN` from its edges.
 */
export function popoverPosition(
  anchor: Rect,
  size: Size,
  window: Size,
  align: 'left' | 'right' = 'right'
): { left: number; top: number; maxHeight: number } {
  const maxHeight = Math.max(0, window.height - 2 * POPOVER_MARGIN);
  const height = Math.min(size.height, maxHeight);
  const rawLeft = align === 'right' ? anchor.x + anchor.width - size.width : anchor.x;
  const left = Math.max(POPOVER_MARGIN, Math.min(rawLeft, window.width - POPOVER_MARGIN - size.width));

  const below = anchor.y + anchor.height + GAP;
  const above = anchor.y - GAP - height;
  const fitsBelow = below + height <= window.height - POPOVER_MARGIN;
  const fitsAbove = above >= POPOVER_MARGIN;
  const preferred = fitsBelow || !fitsAbove ? below : above;
  const top = Math.max(POPOVER_MARGIN, Math.min(preferred, window.height - POPOVER_MARGIN - height));
  return { left, top, maxHeight };
}

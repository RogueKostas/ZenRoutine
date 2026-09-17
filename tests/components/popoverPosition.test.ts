import { describe, expect, it } from 'vitest';

import { POPOVER_MARGIN, popoverPosition } from '../../src/components/goals/popoverPosition';

const phone = { width: 400, height: 800 };
const size = { width: 200, height: 300 };

describe('popoverPosition', () => {
  it('opens below the control, right edges lined up', () => {
    const anchor = { x: 330, y: 20, width: 46, height: 46 };
    expect(popoverPosition(anchor, size, phone)).toEqual({ left: 176, top: 70, maxHeight: 784 });
  });

  it('prefers below when it would fit either side', () => {
    const anchor = { x: 300, y: 400, width: 40, height: 40 };
    expect(popoverPosition(anchor, size, phone).top).toBe(444);
  });

  it('lines up left edges when asked', () => {
    const anchor = { x: 16, y: 20, width: 28, height: 28 };
    expect(popoverPosition(anchor, size, phone, 'left').left).toBe(16);
  });

  it('opens above a control near the bottom', () => {
    const anchor = { x: 300, y: 700, width: 40, height: 40 };
    expect(popoverPosition(anchor, size, phone).top).toBe(700 - 4 - 300);
  });

  it('stays inside the window when it fits neither above nor below', () => {
    const anchor = { x: 0, y: 380, width: 40, height: 40 };
    const tall = { width: 200, height: 500 };
    const position = popoverPosition(anchor, tall, phone, 'left');
    expect(position.top).toBe(800 - POPOVER_MARGIN - 500);
    expect(position.left).toBe(POPOVER_MARGIN);
  });

  it('never runs off the right edge on a narrow screen, nor taller than the window', () => {
    const anchor = { x: 380, y: 10, width: 10, height: 10 };
    const wide = { width: 390, height: 2000 };
    const position = popoverPosition(anchor, wide, phone, 'left');
    expect(position.left).toBe(POPOVER_MARGIN);
    expect(position.maxHeight).toBe(784);
    expect(position.top).toBe(POPOVER_MARGIN);
  });
});

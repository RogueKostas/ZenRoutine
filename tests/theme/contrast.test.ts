import { describe, expect, it } from 'vitest';
import { colors, darkColors } from '../../src/theme/colors';

// The shell brand (assets/brand/zenroutine-shell-v1) was contrast-checked as a palette. This holds
// the pairs the app actually draws to WCAG AA in both themes, so a later colour tweak that breaks
// legibility fails here instead of in someone's hand: 4.5:1 for text, 3:1 for control boundaries
// and focus indicators (WCAG 1.4.3, 1.4.11).

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Palette = typeof colors;
const TEXT = 4.5;
const BOUNDARY = 3;

const textPairs = (p: Palette): [string, string, string][] => [
  ['text on background', p.text, p.background],
  ['text on surface', p.text, p.surface],
  ['text on backgroundSecondary', p.text, p.backgroundSecondary],
  ['textSecondary on background', p.textSecondary, p.background],
  ['textSecondary on surface', p.textSecondary, p.surface],
  ['textMuted on background', p.textMuted, p.background],
  ['textMuted on surface', p.textMuted, p.surface],
  ['onPrimary on primary (buttons, selected chips)', p.onPrimary, p.primary],
  ['onPrimary on secondary (secondary buttons)', p.onPrimary, p.secondary],
  ['onError on error (Stop, destructive)', p.onError, p.error],
  ['primary as text (links, outlined buttons) on background', p.primary, p.background],
  ['primary as text on surface', p.primary, p.surface],
  ['error as text on background', p.error, p.background],
  ['error as text on surface', p.error, p.surface],
  ['warning as text on surface', p.warning, p.surface],
];

const boundaryPairs = (p: Palette): [string, string, string][] => [
  ['input border on surface', p.border, p.surface],
  ['input border on background', p.border, p.background],
  ['focus ring on surface', p.focus, p.surface],
  ['focus ring on background', p.focus, p.background],
  ['primary button against background', p.primary, p.background],
  ['primary button against surface', p.primary, p.surface],
];

describe.each([
  ['light', colors],
  ['dark', darkColors],
] as const)('%s theme', (_name, palette) => {
  it.each(textPairs(palette))('%s meets 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(boundaryPairs(palette))('%s meets 3:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(BOUNDARY);
  });
});

describe('contrast()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('negative control: the old white-on-accent labels fail on the dark theme', () => {
    expect(contrast('#FFFFFF', darkColors.primary)).toBeLessThan(TEXT);
    expect(contrast('#FFFFFF', darkColors.error)).toBeLessThan(TEXT);
  });
});

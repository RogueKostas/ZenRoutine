import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Goal } from '../../src/core/types';
import { ONBOARDING_SLIDES } from '../../src/screens/onboardingPaging';

// Iteration 1 decision 2 (#49): goal priority is list order. There is no priority field, column
// or chip (review 26:17; design p65–p67).
//
// Type level: `GoalHasPriority` is `true` if `priority` comes back on `Goal`, and then this
// assignment stops compiling, so `npm run typecheck` fails.
type GoalHasPriority = 'priority' extends keyof Goal ? true : false;
const goalHasPriority: GoalHasPriority = false;

const SRC_DIR = join(__dirname, '..', '..', 'src');

/**
 * The one file allowed to read `priority`: the v6 -> v7 migration has to, to turn an old store's
 * priorities into a starting order.
 */
const MIGRATION_FILE = join('store', 'persistence.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Code and copy lines matching `pattern`. Comments may still describe the history. */
function linesMatching(pattern: RegExp): string[] {
  const comment = /^\s*(\/\/|\/\*|\*)/;
  return sourceFiles(SRC_DIR).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !comment.test(line) && pattern.test(line))
      .map(({ line, index }) => `${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`)
  );
}

describe('goal priority is list order', () => {
  it('has no priority on the Goal type', () => {
    expect(goalHasPriority).toBe(false);
  });

  it('names priority nowhere in src/ outside the migration: no field, chip, badge or copy', () => {
    const hits = linesMatching(/priorit/i)
      .filter((hit) => !hit.startsWith(`${MIGRATION_FILE}:`));
    expect(hits).toEqual([]);
  });

  it('describes list order, not priorities, on the onboarding slides', () => {
    const text = ONBOARDING_SLIDES.map((slide) => `${slide.title} ${slide.description}`).join(' ');
    expect(text).not.toMatch(/priorit/i);
    expect(ONBOARDING_SLIDES[1].description).toMatch(/top of the list is worked on first/i);
  });
});

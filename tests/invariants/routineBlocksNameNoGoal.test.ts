import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { toRoutineBlock, type RoutineBlock } from '../../src/core/types';

// Iteration 1 decision 1 (#60): the routine is made of activity types only. A routine block never
// names a goal; a tracking entry still may.
//
// Type level: `tsc` enforces it. `BlockHasGoal` is `true` if `goalId` ever comes back on
// `RoutineBlock`, and then this assignment stops compiling, so `npm run typecheck` fails. That
// also makes every object literal in src/ that puts `goalId` on a block a compile error, which is
// how the readers were found. What the compiler cannot see — a spread of a stale object, or a
// value from storage — is covered at runtime by the tests below.
type BlockHasGoal = 'goalId' extends keyof RoutineBlock ? true : false;
const blockHasGoal: BlockHasGoal = false;

const SRC_DIR = join(__dirname, '..', '..', 'src');

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

describe('routine blocks name activity types only', () => {
  it('has no goalId on the RoutineBlock type', () => {
    expect(blockHasGoal).toBe(false);
  });

  it('strips a goalId a block value still carries', () => {
    const stale = {
      id: 'block-1',
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId: 'activity-side',
      goalId: 'goal-app',
    } as RoutineBlock;

    expect(toRoutineBlock(stale)).toEqual({
      id: 'block-1',
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId: 'activity-side',
    });
    expect(toRoutineBlock(stale)).not.toHaveProperty('goalId');
  });

  it('reads no goal from a block anywhere in src/', () => {
    // Anything named like a block (block, b, routineBlock, newBlock, ...) followed by .goalId.
    expect(linesMatching(/\b(?:\w*[Bb]lock|b)\??\.goalId\b/)).toEqual([]);
  });

  it('keeps no copy that promises linking a block to a goal', () => {
    // QuickStart's "Link to Goal?" is about a tracking entry and stays; these are all about blocks.
    const promises = /Goal-linked|Goal linked|stays? dedicated|Link activities to goals|linked directly to this goal|linked to other goals|Link to Goal<\/Text>/i;
    expect(linesMatching(promises)).toEqual([]);
  });

  it('scans the app source, not an empty directory', () => {
    const files = sourceFiles(SRC_DIR).map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));
    expect(files).toContain('components/routine/BlockEditor.tsx');
    expect(files).toContain('screens/GoalsScreen.tsx');
  });
});

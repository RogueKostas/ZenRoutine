import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Iteration 1 invariant 5: the type checker is not switched off anywhere in the app. The last
// `@ts-ignore` hid a navigation call to a screen nobody could find; a suppression hides whatever
// the checker would have said, so the rule is "none", not "no new ones".
const SRC_DIR = join(__dirname, '..', '..', 'src');
const SUPPRESSION = /@ts-(ignore|nocheck)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('type-check suppressions', () => {
  it('scans the app source, not an empty directory', () => {
    const files = sourceFiles(SRC_DIR).map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));
    expect(files).toContain('screens/AnalyticsScreen.tsx');
  });

  it('appear nowhere in src/', () => {
    const offenders = sourceFiles(SRC_DIR).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => SUPPRESSION.test(line))
        .map(({ line, index }) => `${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`)
    );

    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Alert.alert is a no-op on react-native-web — no dialog, no console error (issue #39). Web is the
// only surface anyone uses, so it is banned; use useDialog() from src/components/common instead.

const ROOT = join(__dirname, '..', '..');
const SCANNED = [join(ROOT, 'src'), join(ROOT, 'App.tsx')];

const ALERT_CALL = /\bAlert\s*\.\s*alert\s*\(/;
const ALERT_IMPORT = /import\s*(?:type\s*)?\{[^}]*\bAlert\b[^}]*\}\s*from\s*['"]react-native['"]/;

function findAlertUsages(source: string): string[] {
  const found: string[] = [];
  if (ALERT_CALL.test(source)) found.push('Alert.alert call');
  if (ALERT_IMPORT.test(source)) found.push('Alert imported from react-native');
  return found;
}

function sourceFiles(path: string): string[] {
  if (/\.(ts|tsx|js|jsx)$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() || /\.(ts|tsx|js|jsx)$/.test(entry.name)
      ? sourceFiles(join(path, entry.name))
      : []
  );
}

describe('Alert.alert ban', () => {
  it('detects the forms it is meant to ban', () => {
    expect(findAlertUsages("Alert.alert('x')")).toEqual(['Alert.alert call']);
    expect(findAlertUsages("import {\n  View,\n  Alert,\n} from 'react-native';")).toEqual([
      'Alert imported from react-native',
    ]);
    expect(findAlertUsages("import { View } from 'react-native';\nconst a = 'Alerts';")).toEqual([]);
  });

  it('finds no Alert usage anywhere in src/ or App.tsx', () => {
    const files = SCANNED.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      findAlertUsages(readFileSync(file, 'utf8')).map(
        (what) => `${relative(ROOT, file).replace(/\\/g, '/')}: ${what}`
      )
    );
    expect(offenders).toEqual([]);
  });
});

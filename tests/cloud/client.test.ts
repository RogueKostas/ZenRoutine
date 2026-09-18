import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, getCloudClient, resetCloudClientForTests } from '../../src/cloud/client';
import { cloudConfig } from '../../src/config/cloud';
import { APP_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from '../../src/store/persistence';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'output', '.expo'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json|sql|ya?ml|html|md|webmanifest|env)$/.test(name) || name.startsWith('.env')) out.push(path);
  }
  return out;
}

describe('cloud client', () => {
  afterEach(() => resetCloudClientForTests());

  it('is off in this build: no client, so no connection and no token refresh', () => {
    expect(cloudConfig.accountsEnabled).toBe(false);
    expect(getCloudClient()).toBeNull();
  });

  it('is created once when accounts are on', () => {
    const on = { ...cloudConfig, accountsEnabled: true } as unknown as typeof cloudConfig;
    const first = getCloudClient(on);
    expect(first).not.toBeNull();
    expect(getCloudClient(on)).toBe(first);
  });

  it('keeps the session under its own key, apart from the app data', () => {
    expect(new Set([AUTH_STORAGE_KEY, APP_STORAGE_KEY, QUARANTINE_STORAGE_KEY]).size).toBe(3);
  });

  it('uses the public project URL and a publishable key, never a secret one', () => {
    expect(cloudConfig.url).toMatch(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
    expect(cloudConfig.publishableKey).toMatch(/^sb_publishable_/);
  });

  it('nothing outside src/cloud imports supabase-js, so the app is unchanged while accounts are off', () => {
    const importers = walk(join(ROOT, 'src'))
      .filter((f) => /@supabase\/supabase-js/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(importers).toEqual(['src/cloud/client.ts']);
  });
});

describe('no secrets in the repository', () => {
  // Supabase personal access tokens, secret API keys, and any JWT (the legacy anon and
  // service_role keys are both JWTs; the app uses neither).
  const SECRET_PATTERNS: [string, RegExp][] = [
    ['Supabase access token', /\bsbp_[0-9a-f]{40}\b/],
    ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{10,}/],
    ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ];

  it('finds none in any source, config, migration, script or doc', () => {
    const hits: string[] = [];
    for (const file of walk(ROOT)) {
      if (file.endsWith(join('tests', 'cloud', 'client.test.ts'))) continue;
      const text = readFileSync(file, 'utf8');
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (pattern.test(text)) hits.push(`${label} in ${relative(ROOT, file)}`);
      }
    }
    expect(hits).toEqual([]);
  }, 60_000); // walks the whole repo; slow when the full suite runs in parallel

  it('negative control: each pattern matches the shape it is meant to catch', () => {
    const samples = [
      `sbp_${'a1'.repeat(20)}`,
      `sb_secret_${'Z'.repeat(20)}`,
      `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}`,
    ];
    SECRET_PATTERNS.forEach(([, pattern], i) => expect(pattern.test(samples[i])).toBe(true));
    expect(SECRET_PATTERNS.some(([, p]) => p.test(cloudConfig.publishableKey))).toBe(false);
  });
});

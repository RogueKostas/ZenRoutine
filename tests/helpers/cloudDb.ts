import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * The parts of a Supabase database the migrations lean on, rebuilt in PGlite: the API roles, an
 * `auth.users` table, `auth.uid()` reading the request's JWT claims, and — the part that matters
 * most — Supabase's default privileges, which grant every new table and function in `public` to
 * anon and authenticated. Without those defaults a missing `revoke` would look safe in tests and
 * be wide open in production.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      ),
      ''
    )::uuid
  $$;

  grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';

export type Caller =
  | { role: 'anon' }
  | { role: 'authenticated'; sub: string | null }
  | { role: 'supabase_auth_admin' };

export interface CloudDb {
  db: PGlite;
  /** Runs `sql` as `caller`, the way PostgREST would: role switched and claims set, per transaction. */
  as<T = Record<string, unknown>>(caller: Caller, sql: string, params?: unknown[]): Promise<T[]>;
  /** Empties every table and restores the two test users, so one database can serve a whole describe. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

const SEED_USERS = `insert into auth.users (id, email) values ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');`;

/**
 * A fresh database with every migration applied. `transform` lets a negative control apply a
 * deliberately weakened migration and prove the corresponding test would catch it.
 */
export async function createCloudDb(transform: (sql: string) => string = (s) => s): Promise<CloudDb> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const m of readMigrations()) {
    await db.exec(transform(m.sql));
  }
  await db.exec(SEED_USERS);

  return {
    db,
    async as<T>(caller: Caller, sql: string, params: unknown[] = []) {
      return db.transaction(async (tx) => {
        const claims = caller.role === 'authenticated' && caller.sub ? { sub: caller.sub, role: caller.role } : { role: caller.role };
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        await tx.exec(`set local role ${caller.role}`);
        const result = await tx.query<T>(sql, params);
        return result.rows;
      });
    },
    async reset() {
      await db.exec(`truncate public.snapshots, public.invites, auth.users cascade; ${SEED_USERS}`);
    },
    close: () => db.close(),
  };
}

export const asUser = (sub: string): Caller => ({ role: 'authenticated', sub });
export const ANON: Caller = { role: 'anon' };

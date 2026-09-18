import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, asUser, createCloudDb, USER_A, USER_B, type CloudDb } from '../helpers/cloudDb';

// Iteration 2, Wave A (docs/ITERATION-2-PLAN.md). The migrations in supabase/migrations run against
// a PGlite database carrying Supabase's default grants, and every rule that protects one user's
// data from another has a negative control below that weakens exactly that rule and shows the
// test would then fail.

type PushResult = { status: 'ok' | 'conflict'; revision: number | null; updated_at: string | null };

const push = async (
  cloud: CloudDb,
  sub: string,
  expected: number,
  data: unknown = { goals: [] },
  device = 'device-1'
): Promise<PushResult> => {
  const rows = await cloud.as<{ r: PushResult }>(
    asUser(sub),
    'select public.push_snapshot($1, $2, $3::jsonb, $4) as r',
    [expected, 9, JSON.stringify(data), device]
  );
  return rows[0].r;
};

const ownRows = (cloud: CloudDb, sub: string) =>
  cloud.as<{ user_id: string; revision: number; data: unknown }>(asUser(sub), 'select user_id, revision, data from public.snapshots');

const permissionDenied = /permission denied/i;

describe('snapshots: compare-and-swap', () => {
  let cloud: CloudDb;
  beforeAll(async () => {
    cloud = await createCloudDb();
  });
  afterAll(() => cloud.close());
  beforeEach(async () => {
    await cloud.reset();
  });

  it('creates revision 1 when the account is empty', async () => {
    const r = await push(cloud, USER_A, 0, { n: 1 });
    expect(r).toMatchObject({ status: 'ok', revision: 1 });
    expect(r.updated_at).toBeTruthy();
    expect(await ownRows(cloud, USER_A)).toEqual([{ user_id: USER_A, revision: 1, data: { n: 1 } }]);
  });

  it('advances the revision when the expected revision matches', async () => {
    await push(cloud, USER_A, 0, { n: 1 });
    expect(await push(cloud, USER_A, 1, { n: 2 })).toMatchObject({ status: 'ok', revision: 2 });
    expect((await ownRows(cloud, USER_A))[0].data).toEqual({ n: 2 });
  });

  it('refuses a save based on a stale revision, and leaves the newer data alone', async () => {
    await push(cloud, USER_A, 0, { n: 1 });
    await push(cloud, USER_A, 1, { n: 2 }, 'ipad');
    // The iPhone still believes the account is at revision 1.
    expect(await push(cloud, USER_A, 1, { n: 'stale' }, 'iphone')).toMatchObject({ status: 'conflict', revision: 2 });
    expect((await ownRows(cloud, USER_A))[0].data).toEqual({ n: 2 });
  });

  it('refuses "the account is empty" when it is not', async () => {
    await push(cloud, USER_A, 0, { n: 1 });
    expect(await push(cloud, USER_A, 0, { n: 'other device' })).toMatchObject({ status: 'conflict', revision: 1 });
  });

  it('reports a conflict with no revision when a device expects data that is not there', async () => {
    expect(await push(cloud, USER_A, 3)).toEqual({ status: 'conflict', revision: null, updated_at: null });
  });

  it('rejects data that is not an object, and a negative revision', async () => {
    await expect(push(cloud, USER_A, 0, [1, 2])).rejects.toThrow(/JSON object/);
    await expect(push(cloud, USER_A, -1)).rejects.toThrow(/expected_revision/);
  });

  it('rejects a snapshot over 5 MB', async () => {
    await expect(push(cloud, USER_A, 0, { blob: 'x'.repeat(5 * 1024 * 1024) })).rejects.toThrow(/too large/);
  });
});

describe('snapshots: ownership', () => {
  let cloud: CloudDb;
  beforeAll(async () => {
    cloud = await createCloudDb();
  });
  afterAll(() => cloud.close());
  beforeEach(async () => {
    await cloud.reset();
    await push(cloud, USER_A, 0, { owner: 'a' });
  });

  it("user B cannot read user A's snapshot", async () => {
    expect(await ownRows(cloud, USER_B)).toEqual([]);
    expect(
      await cloud.as(asUser(USER_B), 'select * from public.snapshots where user_id = $1', [USER_A])
    ).toEqual([]);
  });

  it("user B's push only ever touches user B's row", async () => {
    // B guesses A's revision; the function keys on the caller, so this is B's (empty) account.
    expect(await push(cloud, USER_B, 1, { owner: 'b?' })).toEqual({ status: 'conflict', revision: null, updated_at: null });
    await push(cloud, USER_B, 0, { owner: 'b' });
    expect(await ownRows(cloud, USER_A)).toEqual([{ user_id: USER_A, revision: 1, data: { owner: 'a' } }]);
    expect(await ownRows(cloud, USER_B)).toEqual([{ user_id: USER_B, revision: 1, data: { owner: 'b' } }]);
  });

  it('nobody can write the table directly, not even to their own row', async () => {
    await expect(
      cloud.as(asUser(USER_B), `insert into public.snapshots (user_id, revision, schema_version, data, device_id) values ($1, 1, 9, '{}', 'x')`, [USER_B])
    ).rejects.toThrow(permissionDenied);
    await expect(
      cloud.as(asUser(USER_A), `update public.snapshots set data = '{}' where user_id = $1`, [USER_A])
    ).rejects.toThrow(permissionDenied);
    await expect(cloud.as(asUser(USER_B), 'delete from public.snapshots')).rejects.toThrow(permissionDenied);
  });

  it('an anonymous caller can neither read nor push', async () => {
    await expect(cloud.as(ANON, 'select * from public.snapshots')).rejects.toThrow(permissionDenied);
    await expect(
      cloud.as(ANON, `select public.push_snapshot(0, 9, '{}'::jsonb, 'x')`)
    ).rejects.toThrow(permissionDenied);
  });

  it('a request with no user id is refused, not treated as someone', async () => {
    await expect(
      cloud.as({ role: 'authenticated', sub: null }, `select public.push_snapshot(0, 9, '{}'::jsonb, 'x')`)
    ).rejects.toThrow(/not authenticated/);
    expect(await cloud.as({ role: 'authenticated', sub: null }, 'select * from public.snapshots')).toEqual([]);
  });
});

describe('delete_my_account', () => {
  let cloud: CloudDb;
  beforeAll(async () => {
    cloud = await createCloudDb();
  });
  afterAll(() => cloud.close());
  beforeEach(async () => {
    await cloud.reset();
    await push(cloud, USER_A, 0, { owner: 'a' });
    await push(cloud, USER_B, 0, { owner: 'b' });
  });

  it("removes the caller's account and snapshot, and nobody else's", async () => {
    await cloud.as(asUser(USER_A), 'select public.delete_my_account()');
    const users = await cloud.db.query<{ id: string }>('select id from auth.users order by id');
    expect(users.rows.map((u) => u.id)).toEqual([USER_B]);
    const snaps = await cloud.db.query<{ user_id: string }>('select user_id from public.snapshots');
    expect(snaps.rows.map((s) => s.user_id)).toEqual([USER_B]);
  });

  it('cannot be called anonymously or without a user id', async () => {
    await expect(cloud.as(ANON, 'select public.delete_my_account()')).rejects.toThrow(permissionDenied);
    await expect(
      cloud.as({ role: 'authenticated', sub: null }, 'select public.delete_my_account()')
    ).rejects.toThrow(/not authenticated/);
    expect((await cloud.db.query('select id from auth.users')).rows).toHaveLength(2);
  });
});

describe('invite list and the before-user-created hook', () => {
  let cloud: CloudDb;
  beforeAll(async () => {
    cloud = await createCloudDb();
  });
  afterAll(() => cloud.close());
  beforeEach(async () => {
    await cloud.reset();
    await cloud.db.exec(`insert into public.invites (email) values ('friend@example.com')`);
  });

  const hook = (email: string) =>
    cloud.as<{ r: Record<string, unknown> }>(
      { role: 'supabase_auth_admin' },
      'select public.hook_before_user_created($1::jsonb) as r',
      [JSON.stringify({ metadata: { name: 'before-user-created' }, user: { email } })]
    );

  it('allows an invited email, ignoring case and surrounding spaces', async () => {
    expect((await hook('friend@example.com'))[0].r).toEqual({});
    expect((await hook('  Friend@Example.COM '))[0].r).toEqual({});
  });

  it('refuses anyone else with a 403 and a readable message', async () => {
    const r = (await hook('stranger@example.com'))[0].r as { error: { http_code: number; message: string } };
    expect(r.error.http_code).toBe(403);
    expect(r.error.message).toMatch(/invite list/);
  });

  it('refuses a payload with no email', async () => {
    const rows = await cloud.as<{ r: { error?: unknown } }>(
      { role: 'supabase_auth_admin' },
      `select public.hook_before_user_created('{"user":{}}'::jsonb) as r`
    );
    expect(rows[0].r.error).toBeTruthy();
  });

  it('the list cannot be read or edited through the API', async () => {
    for (const caller of [ANON, asUser(USER_A)]) {
      await expect(cloud.as(caller, 'select * from public.invites')).rejects.toThrow(permissionDenied);
      await expect(
        cloud.as(caller, `insert into public.invites (email) values ('me@example.com')`)
      ).rejects.toThrow(permissionDenied);
    }
  });

  it('only Supabase Auth can call the hook', async () => {
    for (const caller of [ANON, asUser(USER_A)]) {
      await expect(
        cloud.as(caller, `select public.hook_before_user_created('{"user":{"email":"friend@example.com"}}'::jsonb)`)
      ).rejects.toThrow(permissionDenied);
    }
  });

  it('stores emails lower-case only', async () => {
    await expect(cloud.db.exec(`insert into public.invites (email) values ('Upper@Example.com')`)).rejects.toThrow(/check/);
  });
});

// Each control weakens one rule in the real migration text and shows the matching test above
// would have failed. If a replace() stops matching, the control fails loudly instead of passing
// vacuously.
describe('negative controls: each protection is load-bearing', () => {
  const weaken = (from: string, to: string) => (sql: string) => (sql.includes(from) ? sql.replace(from, to) : sql);
  const mustChange = async (from: string) => {
    const { readMigrations } = await import('../helpers/cloudDb');
    expect(readMigrations().some((m) => m.sql.includes(from))).toBe(true);
  };

  it('without the ownership policy, B reads A', async () => {
    const from = 'using (user_id = auth.uid())';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, 'using (true)'));
    await push(cloud, USER_A, 0, { owner: 'a' });
    expect(await ownRows(cloud, USER_B)).toHaveLength(1);
    await cloud.close();
  });

  it('without the table revoke, a user can write the table directly', async () => {
    const from = 'revoke all on table public.snapshots from public, anon, authenticated;';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, `create policy loose_insert on public.snapshots for insert to authenticated with check (true);`));
    await expect(
      cloud.as(asUser(USER_B), `insert into public.snapshots (user_id, revision, schema_version, data, device_id) values ($1, 1, 9, '{}', 'x')`, [USER_A])
    ).resolves.toBeDefined();
    await cloud.close();
  });

  it('without the revision check, a stale save overwrites newer data', async () => {
    const from = 'where s.user_id = uid and s.revision = expected_revision';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, 'where s.user_id = uid'));
    await push(cloud, USER_A, 0, { n: 1 });
    await push(cloud, USER_A, 1, { n: 2 });
    expect(await push(cloud, USER_A, 1, { n: 'stale' })).toMatchObject({ status: 'ok' });
    await cloud.close();
  });

  it('without the function revoke, an anonymous caller can reach push_snapshot', async () => {
    const from = 'revoke execute on function public.push_snapshot(bigint, integer, jsonb, text) from public, anon;';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, ''));
    // Reaches the function body instead of being stopped at the door.
    await expect(cloud.as(ANON, `select public.push_snapshot(0, 9, '{}'::jsonb, 'x')`)).rejects.toThrow(/not authenticated/);
    await cloud.close();
  });

  it('without the invites revoke, the invite list is readable by anyone', async () => {
    const from = 'revoke all on table public.invites from public, anon, authenticated;';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, 'create policy open_invites on public.invites for select using (true);'));
    await expect(cloud.as(ANON, 'select * from public.invites')).resolves.toEqual([]);
    await cloud.close();
  });

  it('without the hook revoke, a signed-in user can call the hook', async () => {
    const from = 'revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;';
    await mustChange(from);
    const cloud = await createCloudDb(weaken(from, ''));
    await expect(
      cloud.as(asUser(USER_A), `select public.hook_before_user_created('{"user":{"email":"x@example.com"}}'::jsonb)`)
    ).resolves.toHaveLength(1);
    await cloud.close();
  });
});

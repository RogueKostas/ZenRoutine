import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asUser, createCloudDb, USER_A, USER_B, type CloudDb } from '../helpers/cloudDb';

// The daily backup's login (supabase/migrations/…_backup_reader.sql): it reads everything a restore
// needs and can change nothing. Its password lives only in a GitHub secret, so this is what a leak
// of that secret would expose, and no more.

const BACKUP = { role: 'zr_backup' } as const;
const permissionDenied = /permission denied/i;

describe('backup reader', () => {
  let cloud: CloudDb;
  beforeAll(async () => {
    cloud = await createCloudDb();
  });
  afterAll(() => cloud.close());
  beforeEach(async () => {
    await cloud.reset();
    for (const [sub, owner] of [[USER_A, 'a'], [USER_B, 'b']] as const) {
      await cloud.as(asUser(sub), `select public.push_snapshot(0, 9, $1::jsonb, 'd')`, [JSON.stringify({ owner })]);
    }
    await cloud.db.exec(`insert into public.invites (email) values ('friend@example.com'); update auth.users set encrypted_password = 'secret-hash'`);
  });

  it("reads every user's snapshot, the invite list and who the users are", async () => {
    const snaps = await cloud.as<{ user_id: string }>(BACKUP, 'select user_id from public.snapshots order by user_id');
    expect(snaps.map((s) => s.user_id)).toEqual([USER_A, USER_B]);
    expect(await cloud.as(BACKUP, 'select email from public.invites')).toEqual([{ email: 'friend@example.com' }]);
    expect(await cloud.as(BACKUP, 'select id, email, created_at from public.backup_users()')).toHaveLength(2);
  });

  it('never reads credentials: no direct access to auth, and backup_users returns three columns', async () => {
    await expect(cloud.as(BACKUP, 'select encrypted_password from auth.users')).rejects.toThrow(permissionDenied);
    await expect(cloud.as(BACKUP, 'select id from auth.users')).rejects.toThrow(permissionDenied);
    const [row] = await cloud.as<Record<string, unknown>>(BACKUP, 'select * from public.backup_users()');
    expect(Object.keys(row).sort()).toEqual(['created_at', 'email', 'id']);
  });

  it('is the only caller of backup_users', async () => {
    for (const caller of [{ role: 'anon' } as const, asUser(USER_A)]) {
      await expect(cloud.as(caller, 'select * from public.backup_users()')).rejects.toThrow(permissionDenied);
    }
  });

  it('can change nothing', async () => {
    await expect(cloud.as(BACKUP, `update public.snapshots set data = '{}'`)).rejects.toThrow(permissionDenied);
    await expect(cloud.as(BACKUP, 'delete from public.snapshots')).rejects.toThrow(permissionDenied);
    await expect(cloud.as(BACKUP, `insert into public.invites (email) values ('me@example.com')`)).rejects.toThrow(permissionDenied);
    await expect(cloud.as(BACKUP, 'delete from auth.users')).rejects.toThrow(permissionDenied);
  });

  it('cannot call the app functions', async () => {
    await expect(cloud.as(BACKUP, `select public.push_snapshot(0, 9, '{}'::jsonb, 'x')`)).rejects.toThrow(permissionDenied);
    await expect(cloud.as(BACKUP, 'select public.delete_my_account()')).rejects.toThrow(permissionDenied);
  });

  it("does not widen what a signed-in user can read: still only their own row", async () => {
    const rows = await cloud.as<{ user_id: string }>(asUser(USER_B), 'select user_id from public.snapshots');
    expect(rows.map((r) => r.user_id)).toEqual([USER_B]);
  });
});

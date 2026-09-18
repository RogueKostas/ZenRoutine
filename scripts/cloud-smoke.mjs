// Live smoke check against the real Supabase project, using only the public (publishable) key, as
// the app does. Run by hand: `node scripts/cloud-smoke.mjs`. Never run in CI: tests do not touch
// the real project (docs/ITERATION-2-PLAN.md, invariant 4).
//
// Every check here expects a REFUSAL. It creates nothing: the uninvited sign-up is rejected by the
// before-user-created hook before any user row exists, and no email is sent.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../src/config/cloud.ts', import.meta.url), 'utf8');
const url = config.match(/url: '([^']+)'/)[1];
const publishableKey = config.match(/publishableKey: '([^']+)'/)[1];
const supabase = createClient(url, publishableKey, { auth: { persistSession: false } });

const results = [];
const check = (name, refused, detail) => results.push({ name, pass: refused, detail });

{
  const { data, error } = await supabase.from('snapshots').select('*');
  check('anon cannot read snapshots', Boolean(error) || (Array.isArray(data) && data.length === 0), error?.message ?? `rows=${data?.length}`);
}
{
  const { error } = await supabase.rpc('push_snapshot', { expected_revision: 0, new_schema_version: 9, new_data: {}, new_device_id: 'smoke' });
  check('anon cannot call push_snapshot', Boolean(error), error?.message ?? 'no error');
}
{
  const { error } = await supabase.rpc('delete_my_account');
  check('anon cannot call delete_my_account', Boolean(error), error?.message ?? 'no error');
}
{
  const { data, error } = await supabase.from('invites').select('*');
  check('anon cannot read invites', Boolean(error) || (Array.isArray(data) && data.length === 0), error?.message ?? `rows=${data?.length}`);
}
{
  const { error } = await supabase.rpc('hook_before_user_created', { event: { user: { email: 'x@example.com' } } });
  check('anon cannot call the sign-up hook', Boolean(error), error?.message ?? 'no error');
}
{
  const email = `not-invited-${Date.now()}@example.com`;
  const { data, error } = await supabase.auth.signUp({ email, password: `Smoke-${Date.now()}-pw!` });
  check('an uninvited email cannot sign up', Boolean(error) && !data?.user, error ? `${error.status} ${error.message}` : 'signed up!');
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;

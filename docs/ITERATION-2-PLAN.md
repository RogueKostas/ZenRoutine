# Iteration 2 — "Yours"

**Goal.** Kostas, and then a few friends and family, can use ZenRoutine as real users: sign in, keep their data safe, and pick it up on another device, while the app still works fully signed out and offline.

The test is simple. Kostas plans and tracks on his iPhone for a week, opens his iPad, and his week is there. Nothing was lost, and nothing was uploaded, overwritten or merged without him choosing it.

Iteration 1 made the app match the design. On 18 Sep Kostas tried it on iPad and iPhone: *"it is like the exact thing i had in my brain has been replicated on the screen(s)."* What it could not do was keep his data. Data lives in one browser on one device, Safari clears it after 7 days of not visiting, and there is no account. This iteration fixes that, so real use can show whether the product delivers the value it is meant to.

Read `docs/CLOUD_BETA_TASK.md` first. Its ownership, transfer and conflict rules still stand. This plan replaces only its choice of backend (see decision 1).

---

## Decisions already made — do not re-open

| # | Decision | Source |
|---|---|---|
| 1 | **A hosted service, Supabase, not our own API.** Supabase Auth plus Supabase Postgres with row-level security replaces `CLOUD_BETA_TASK.md`'s "own strict-TypeScript API on Render Postgres". The rest of that contract stands: guest mode first, explicit transfer, owner-scoped data, no silent last-write-wins. | Kostas, 18 Sep |
| 2 | **Sign-in at launch: email with a password, and email without a password.** Google, Apple and other social sign-ins come later, and nothing here may make them harder to add. | Kostas, 18 Sep |
| 3 | **Accounts come before the catch-up queue.** [#57](https://github.com/RogueKostas/ZenRoutine/issues/57) moves to Iteration 3. | Kostas, 18 Sep |
| 4 | **The app always works signed out.** Signing in is an offer, never a gate. Local data on the device stays the source of truth while offline. | `PRODUCT.md` D6 · `CLOUD_BETA_TASK.md` |
| 5 | **No silent transfer.** A first sign-in with data on the device offers *upload this device* / *keep local-only* / *cancel*. If the account already has data, it also offers *use the account's data*, and the device's data is backed up first. | `CLOUD_BETA_TASK.md` |
| 6 | **Web first.** The deployed web build, installed to the Home Screen, is the beta client. Native (EAS) builds stay out of scope unless [#15](https://github.com/RogueKostas/ZenRoutine/issues/15) is picked up. | 18 Sep: Kostas uses the Home Screen web app on iPhone and iPad |

---

## Recommendations waiting on Kostas

Each has a recommended answer. The wave that needs an answer is named; nothing earlier waits for it.

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| K1 | **Email codes instead of magic links.** On iPhone and iPad a link in an email opens in Safari, not in the Home Screen app, so the sign-in would land in the wrong app. A 6-digit code typed into the app has no such trap. It covers passwordless sign-in, sign-up confirmation and password reset. | **Codes.** To the user it's the same "no password" experience. | Wave B |
| K2 | **An email service for sending those codes.** Supabase's built-in email only reaches members of your Supabase team, at about 2 emails an hour, with no guarantee. Friends and family need a real provider (Resend's free tier is 3,000 a month) and a domain you control to send from, e.g. `zenroutine@hypersoniclabs.co`. | **Resend, from a domain you own.** You create the account and add the DNS records. Until then, only your own address can sign in, which is enough for Waves A–C. | Wave D |
| K3 | **Paying for Supabase.** Free projects pause after a week with no activity and have no backups. Pro is $25 a month, never pauses, and keeps daily backups for 7 days. | **Free while building; Pro before anyone else's data is stored.** | Wave D |
| K4 | **Who can sign up.** | **Invite-only.** New accounts are refused unless the email is on a list you control. You add a friend's email, and they can then sign up. | Wave B |
| K5 | **Signing out.** What happens to the data on that device? | **Ask each time:** "Keep a copy on this device" or "Remove from this device". Removing is only offered once everything has synced. | Wave B |
| K6 | **Deleting your account.** Should it also clear this device? | **Ask, as with K5.** Account data is deleted on the server either way. | Wave D |
| K7 | **Rotate the Supabase access token after setup.** The token in `OneDrive\Zen Routine\Secrets` controls your whole Supabase account, and it appeared once in a session log on 18 Sep. The app never uses it. | **Rotate it once Wave A's project exists.** | End of Wave A |
| K8 | **[#34](https://github.com/RogueKostas/ZenRoutine/issues/34), an unreadable skeleton record.** Sync makes one device's data another device's input, so an unresolved brick route could travel. | **Decide #34 before Wave C starts.** | Wave C |

---

## Authority

Starting this iteration authorises the orchestrator to:

- create **one** Supabase project named `zenroutine`, in `RogueKostas's Org`, region `eu-west-2` (London), on the Free plan;
- apply the migrations in `supabase/migrations/` to that project, and change its Auth settings (sign-ups, the invite hook, email templates, code length and expiry);
- add **one** runtime dependency, `@supabase/supabase-js`, plus dev-only test tooling (`@electric-sql/pglite`);
- commit the project URL and its **publishable** key. Both are public by design, and row-level security is what protects data.

It does **not** authorise: touching the existing `pCloud Helper` project; creating any other project; changing the Supabase plan or billing; storing the access token or any secret key in the repo, in CI or in logs; changing Render or GitHub settings; inviting anyone; or any of the out-of-scope items below.

---

## How data will sync

Deliberately simple for this iteration, as `CLOUD_BETA_TASK.md` asks: **whole snapshots first, entity-level merging later.**

- **One row per user:** `snapshots(user_id, revision, schema_version, data, device_id, updated_at)`. Row-level security lets a user read only their own row. Writes go through one database function that does **compare-and-swap**: "save this if the account is still at revision *n*." If another device has saved in the meantime, the write is refused as a conflict rather than overwriting.
- **The device stays in charge.** Every change saves locally first, exactly as today. The device remembers which account revision its data started from and whether it has unsynced changes.
- **When it syncs:** a few seconds after a change, when the app comes back to the foreground, and when the network returns. Never while you're mid-edit.
- **Pulling:** if the account has moved on and this device has no unsynced changes, the account's data is applied **through the same validation, migration and quarantine path that loading from storage uses**. Remote data is treated as untrusted input.
- **Conflict:** both devices changed since they last agreed. The app shows both ("iPhone, changed 14:02 — 3 goals, 41 entries" and "this iPad, changed 14:10 — …") and asks which to keep. The other version is saved as a backup, never discarded.
- **A running timer on two devices** is always a conflict the user resolves; it is never extended implicitly.
- **Version skew:** a device running an older build that finds newer data refuses to apply it and asks for a reload. On web, the reload fetches the new build.

A ticking timer writes nothing (entries store a start time), so a single person moving between devices will rarely conflict. Conflicts need two devices edited offline.

---

## Wave A — Foundations (nothing visible yet)

| Item | What |
|---|---|
| A1 | Create the `zenroutine` Supabase project (see Authority). Record its URL and publishable key in `src/config/cloud.ts`. |
| A2 | `supabase/migrations/`: the `snapshots` table, row-level security, the compare-and-swap `push_snapshot` function, `delete_my_account()`, and the invite list with the before-sign-up hook. |
| A3 | **Database tests without Docker:** the migrations run in PGlite (Postgres in WebAssembly) inside Vitest, with a stand-in `auth` schema. **Negative authorisation tests for every rule:** user B cannot read, write, conflict with or delete user A's snapshot; an anonymous caller can do nothing; a stale revision is refused. |
| A4 | Wire `supabase-js` behind a feature flag (`accountsEnabled`, off). Session storage uses the same storage adapter as the app's data. |

### Exit criteria
- Migrations applied to the real project; its schema matches the tests.
- Every row-level-security and compare-and-swap test has a negative control that fails when the rule is removed.
- With the flag off, the deployed build is indistinguishable from today's.
- No secret appears in the repo, CI logs or the build output (checked by a search, not assumed).

## Wave B — Sign in

| Item | What |
|---|---|
| B1 | **Settings → Account:** sign up (email + password, confirmed by code), sign in (password, or email code only), forgot password (code), sign out (K5). |
| B2 | **The invite gate (K4):** a clear message when an email isn't on the list, not a generic failure. |
| B3 | **First sign-in transfer** (decision 5): the three- or four-way choice, with a backup of the device's data taken before anything is replaced. |
| B4 | Every network failure shown in words, with the app still usable signed out. |

### Exit criteria
- On the deployed build, Kostas's own address can sign up, sign out, sign in with a password and sign in with a code.
- Signed out, every Iteration 1 review-script step still passes.
- A first sign-in with local data uploads nothing until "Upload this device" is chosen.

## Wave C — Sync

| Item | What |
|---|---|
| C1 | Unsynced-change tracking and the push, pull and conflict flow described above. |
| C2 | **Sync status:** a quiet line in Settings ("Synced 2 min ago", "Offline — changes saved on this device", "Needs your choice"). No badges, no nagging. |
| C3 | The conflict dialog, keeping both versions. |
| C4 | Version skew and the running-timer conflict. |

### Exit criteria — two real devices
1. Sign in on iPhone and iPad. A goal added on one appears on the other after it is brought to the foreground.
2. Put one device in flight mode, edit on both, reconnect: the conflict dialog appears, and the version not chosen is recoverable as a backup.
3. Start a timer on one device and a different timer on the other: a conflict, never a silent merge.
4. Uninstall the Home Screen app, reinstall it, sign in: everything is back.

## Wave D — Ready for friends and family

| Item | What |
|---|---|
| D1 | **Privacy, in plain words, in Settings:** what is stored (everything you enter), where (Supabase, London), who can see it (you; and, technically, the project owner, said honestly), and how to delete it. |
| D2 | **Delete my account (K6):** removes the server data immediately, and says so. |
| D3 | **Onboarding for a real user.** A last slide offers "Create an account to keep your data safe" or "Continue without an account". Example data is still offered, and can be cleared in one step before real use. |
| D4 | **Email from your own domain (K2)**, with branded code emails. |
| D5 | Pro plan in place (K3) before the first invite. |

### Exit criteria
- A friend's address, added to the invite list, can sign up from a fresh device with no help.
- Deleting that account removes its server row (checked in the database, not assumed).
- `CLOUD_BETA_TASK.md`'s gate is met: privacy copy, deletion behaviour, and manual checks on real devices exist before anyone outside is invited.

---

## Invariants — true at every merge

Iteration 1's invariants still apply: the gate runs on the merged tree, the test count never decreases (it stands at **725**), no data loss on upgrade, web is first-class, no new `@ts-ignore`, and the design is the tiebreaker for anything visible. In addition:

1. **Guest mode is never broken.** With accounts off, or signed out, or offline, everything in Iteration 1 works.
2. **Nothing leaves the device without an explicit choice.**
3. **Remote data is untrusted input.** It goes through the same validation, migration and quarantine as local storage. There is no second, weaker path.
4. **Tests never touch the real project.** Unit and database tests run on PGlite. Anything that must hit Supabase is a manual, recorded check.
5. **Secrets stay out.** The access token is used only on Kostas's machine, by the orchestrator, for setup. No service or secret key is needed by the app at all.

---

## Review script — Iteration 2

1. On iPhone: add the site to the Home Screen, open it, walk onboarding and choose "Create an account".
2. Sign up with your email; type the code from the email.
3. Plan a real week and track a real block.
4. On iPad: install from the Home Screen, sign in with a code. Your week is there.
5. Change something on the iPad; bring the iPhone app forward. It is there.
6. Flight mode on one, edit both, reconnect. Choose a version. Find the other one in backups.
7. Sign out on the iPad and choose "Remove from this device". Sign back in. Everything returns.
8. Add a friend's email to the invite list. They sign up unaided.

---

## Explicitly out of scope for Iteration 2

- Google, Apple and other social sign-in (decision 2). Next, once email works end to end.
- Entity-level merging: combining two devices' edits automatically rather than choosing one.
- Native iOS and Android builds (EAS), unless [#15](https://github.com/RogueKostas/ZenRoutine/issues/15) is picked up.
- [#57](https://github.com/RogueKostas/ZenRoutine/issues/57) catch-up queue, and [#12](https://github.com/RogueKostas/ZenRoutine/issues/12)–[#14](https://github.com/RogueKostas/ZenRoutine/issues/14): Iteration 3.
- Activity notes, AI features, sharing between users.
- **Branding.** Kostas is exploring it separately. When the assets arrive, wiring in the icon and splash screen is a small lane that may run alongside any wave.

## Still waiting on Kostas

- K1–K8 above.
- [#31](https://github.com/RogueKostas/ZenRoutine/issues/31) and [#35](https://github.com/RogueKostas/ZenRoutine/issues/35), carried over from Iteration 1. Neither blocks this iteration.

---

*Written 18 Sep 2026 against `main` @ d16692d. Supabase facts (built-in email limits, Free-plan pausing, Pro pricing) checked against supabase.com on 18 Sep.*

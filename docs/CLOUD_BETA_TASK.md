# ZenRoutine cloud beta task contract

Last reviewed: 2026-09-03

## Why

Make the R1-R3 prototype testable on phones, tablets, and other computers without weakening ZenRoutine's offline-first core or risking existing local data. Web deployment and native distribution are separate, complementary test lanes.

## Deliver

1. **Public web beta (R4):** deploy the Expo single-page web export as a new Render Static Site named `zenroutine-web`, sourced only from `RogueKostas/ZenRoutine`.
2. **Native beta (R4):** configure Expo Application Services (EAS) development and preview profiles so installable Android and iOS builds do not depend on a developer machine. Expo Go remains useful for quick smoke tests, but is not the production-grade beta client.
3. **Structured learning (R4):** document privacy/local-data behavior and collect device, platform, task, outcome, and friction in every beta report.
4. **Optional connected mode (R5):** retain local-only guest use and add opt-in accounts plus cross-device persistence through a strict-TypeScript API and Render Postgres.

## Gates

- `npm run verify` passes before a deployment is presented for testing.
- The Render Blueprint is reviewed before it is applied and creates only new `zenroutine-*` resources.
- A user can continue planning and tracking while signed out and offline.
- Signing in never silently uploads, replaces, or merges existing device data.
- Every remote record is owner-scoped and every ownership rule has negative authorization tests.
- Persisted-shape changes have backward-compatible migrations and regression tests.
- Secrets stay server-side or in managed environment variables; no secret is committed or emitted to logs.
- A free Render Postgres instance is treated as disposable test infrastructure because it expires after 30 days and has no managed backups.

## Do not

- Do not modify, reuse, or attach this project to existing Render services, Blueprints, databases, or the HyperKostas/Hypersonic GitHub identity.
- Do not replace AsyncStorage with network-only state or require an account for the core loop.
- Do not copy Skippy's unauthenticated in-memory save service or EchoQuill's SQLite-on-disk deployment as the synchronization backend.
- Do not use last-write-wins silently across an entire user dataset.
- Do not ship native builds or invite external testers before privacy copy, deletion behavior, and manual native smoke checks exist.

## Connected-mode design

### Ownership and migration

- Guest data belongs to the current device.
- Account data belongs to the authenticated user.
- On first sign-in with local data, offer explicit choices: **upload this device**, **keep local-only**, or **cancel**. A future remote dataset adds **download/replace** and a separately reviewed merge path.
- Keep the existing versioned backup format as the portable escape hatch.

### Synchronization contract

- Keep local state responsive and authoritative while offline.
- Record local mutations in an outbox with stable operation IDs.
- Synchronize owner-scoped, versioned snapshots first; use an expected revision for compare-and-swap updates.
- Return a conflict response when the remote revision changed. Preserve both versions and ask the user which one to keep until entity-level merging is proven.
- Never allow two devices to extend the same running timer implicitly. Completing or replacing a remote active timer requires an explicit resolution.

### Recommended service shape

- `zenroutine-web`: Render Static Site serving the Expo web export.
- `zenroutine-api`: small strict-TypeScript Node web service with explicit schema migrations, request validation, rate limiting, and redacted structured logs.
- `zenroutine-db`: Render Postgres. Use a paid plan before storing irreplaceable beta data; free Postgres expires after 30 days and has no managed backups.
- Authentication starts email-based and invite-gated for the beta. Native credentials or refresh tokens use a secure device store; the web client should prefer secure, HTTP-only, same-site cookies when the final API origin design permits it.

## Done means

- The web beta opens over HTTPS on a phone, tablet, and desktop; onboarding, plan, track, review, reload, and backup export all pass.
- At least one Android or iOS EAS preview build installs and passes the native deferrals recorded in the revival plan.
- Optional sign-in works without blocking guest mode; one account can safely move an explicit test dataset between two devices, including a tested offline edit and conflict.
- Account deletion and remote-data deletion are implemented and documented.
- Verification evidence names exact devices/browsers, behaviors exercised, failures, and unverified areas.

## Execution order

1. Apply and smoke-test the static Render deployment.
2. Configure EAS preview builds and complete one physical-device pass.
3. Add privacy and beta-feedback surfaces.
4. Build the authenticated API and disposable test database behind a feature flag.
5. Add explicit first-sign-in transfer, offline outbox, and conflict resolution.
6. Run two-device beta tests before enabling connected mode by default.

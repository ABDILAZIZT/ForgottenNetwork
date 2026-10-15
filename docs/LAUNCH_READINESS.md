# Launch readiness and operator handoff

Updated 2026-10-15. This document describes the current implementation; earlier phase documents are historical design/implementation notes.

## Current decision

**The Render preview is live; public launch is not approved.** The Blueprint deployment of `b01bc91941c809b9202cf9509b4a11f0372dc1b9` succeeded on 2026-10-15. The public frontend loaded, and the combined, canvas, and PostgreSQL readiness endpoints returned success with that release. The free web service has no persistent SQLite disk, so artwork and artist identities need a durable-storage migration and backup plan before inviting users. No paid hosting upgrade was made.

## Work completed together after Phase 6

### Security and media

- Same-origin mutation checks, security headers/CSP, request IDs and optional structured request logs. Logs omit query strings, cookies, credentials and upload bodies.
- PostgreSQL-backed IP/member fixed-window rate limits, report throttling, and daily write/upload quotas. JSON development mode uses in-memory request limits.
- Image decoding and re-encoding with Sharp: PNG/JPEG/WebP/GIF, 8 MiB input/output, 512×512 pixels, up to 120 frames and 12 seconds. MIME disguises and malformed files are rejected. Processing concurrency and time are bounded; metadata is stripped.
- Private S3-compatible storage adapter. The API controls reads; a hidden/deleted contribution no longer grants public access to its media. Processed database blobs remain the fallback when no bucket is configured. Existing browser copies cannot be recalled.
- Media is immutable by ID; replacement requires a new upload ID. Successful upload responses contain metadata, not another copy of the image in the idempotency log.
- New and pre-existing uploaded media in both permanent and Classic PostgreSQL paths stays private until moderators approve it. Three distinct authenticated open reports temporarily hide eligible contributions; clearing enough reports can release the temporary hold.
- No image classifier is configured. Manual review may miss unsafe imagery, and canvas strokes or composites are not screened. Configure staffed moderator access and review every pending upload before opening registration; this does not certify child safety.
- Server validates entity metadata, layer fields, permitted asset references, ownership and region restrictions.

### Advertising

- AdSense display slots and a Google Ad Manager GPT rewarded-web path are implemented behind opt-in configuration. Both production ad tags wait for the visitor's local Allow choice and an allowed IAB TCF consent event. The server only adds Google CSP sources when `ADS_ENABLED=true`.
- No publisher account, unit IDs, certified CMP, or valid `ads.txt` seller record is configured. `VITE_ADS_ENABLED` and `ADS_ENABLED` remain false by default; no live ad delivery is active.
- Development uses a labeled sponsor simulation. Production GPT rewards are 15–25 local demo gems, with a 10/day Free or 15/day Artist device limit and a three-minute device cooldown. VIP remains ad-free. Browser storage is editable, and Google rewarded web ads do not provide server-side verification; these are not trusted or cash-equivalent balances.
- No automatic loading/teleport interstitial is implemented. Display placements are restricted to optional secondary panels and the store so they do not cover drawing controls.

### Economy and Creator Collection

- The login streak pays 40–100 local demo gems. Three seeded daily tasks reward 30–50 each, and each first neighborhood visit per local day adds 2–5 gems. The HUD challenge panel tracks draw, explore, and placement progress and prevents a second claim on the same browser for that day.
- The 18-entry Creator Collection has Brushes, Land, Creatures, and Cosmetics categories, confirmed local purchases, a recent activity list, a creature stamp pack, three individual palette unlocks, and repeatable local waypoint markers. Expanded Canvas Area remains an unpurchasable server-dependent preview.
- Main demo gems and Creator Collection coins are separate browser-only balances. Each has a 75-unit free daily allowance; collection coins have a 1,500 cap. These demo balances are editable and have no cash value.

### Moderation, history and reliability

- Reports for an entity or the current 128×128 chunk; moderator queue, three-reporter temporary entity holds, hide/unhide, report resolution/dismissal, 30-day publishing suspensions and reinstatement.
- Permanent reports temporarily hide eligible artwork, approved media and chat after three distinct authenticated reporters. `/safety` also queues uploaded media for moderator preview and approval; profile cases require operator review.
- Moderator-only chunk-version history and restoration. Restoring creates a new revision, preserving conflict protection.
- Append-only moderation audit triggers; reasons required for every action. Operator role changes are also audited, with last-administrator protection.
- Chunk history captures existing records at migration and subsequent accepted versions. Deleted chunks retain blank tombstones with increasing versions. Entity edits/deletions retain earlier metadata.
- Advisory locks protect concurrent first writes to a chunk and idempotency checks. Operation hashes bind the world and target, not just the submitted body.
- Fixed server-version propagation to the engine, mutable queued snapshots, and immediate error retry loops. Unsent changes survive 401/429 responses. Retry is deliberate; the canvas pauses edits after a sync error, and a successful retry reloads accepted state.
- Queued changes are account-bound. Old queue records without an account ID are not replayed automatically; choose server state to explicitly discard them. Switching accounts cannot publish another account's queued changes.
- Remote import validates its structure before queuing, creates fresh media/entity IDs, remaps references, and persists all operations in one local IndexedDB transaction. Retries use the original per-item operation IDs and chunk versions rather than repeating previously accepted uploads. Imports are bounded to 32 MB, 100 chunks, 100 entities and 30 assets.

### Site and operations

- World & community panel with creator/date/position, names/descriptions, owner editing/removal, reports and role-gated moderation controls.
- Shareable location/contribution URLs, including position and zoom, plus “Visit.” Reduced-motion rendering pauses ambient/entity motion and camera inertia. The new panel fits a narrow viewport and supports keyboard focus and Escape dismissal.
- PostgreSQL migration checksums commit atomically with each migration.
- Backup, empty-target restore, operator role assignment and legacy-media revalidation commands.
- Automated security/PostgreSQL integration tests and an embedded PostgreSQL backup/restore rehearsal. The embedded runtime is a development test dependency, not a production database.
- Local quality checks and an embedded PostgreSQL integration job run with `pnpm check`. A GitHub Actions workflow remains to be published once the repository credential is granted workflow scope.

## Local verification

Latest automated checks (2026-10-15): `pnpm check` passed (125 tests: 3 shared, 64 client, 58 server), including formatting, lint, TypeScript and the production build. The server suite covers permanent and Classic media review, three-reporter temporary holds, hold release, and combined readiness with current migration checksums. An earlier 108-test run included a local browser/API smoke check. A current browser smoke could not be completed: the Windows browser helper stopped before reloading the local preview because it could not verify the active URL. `pnpm audit --prod` previously reported no known vulnerabilities after upgrading the transitive query parser for [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) and [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx). An advisory scan is not a penetration test or a guarantee of security.

Run `pnpm check` for formatting, lint, tests and production build. Server tests use temporary embedded PostgreSQL by default and do not touch `server/db.json` or a hosted database. For native integration, supply `TEST_DATABASE_URL` pointing to a disposable localhost database whose name ends in `_test`; use a fresh database for each run.

The integration suite exercises migrations twice, readiness, visitor denial, idempotency, target binding, stale writes, simultaneous first-write contenders, deletion tombstones, chunk restoration, media ownership/visibility, moderation permissions, suspensions, immutable audits, region denial, database-backed throttles and operator roles. Embedded backup restoration checks content, revisions and immutable audits. This is **not** proof of hosted TLS, concurrent network locking, provider login or `pg_dump` recovery.

The earlier browser check covered the local community panel, contribution selection, Visit coordinates, copy-link confirmation, URL position/zoom restoration, Escape/focus restoration, the reduced-motion toggle and a 390×844 viewport. No browser warnings/errors were captured during that historical check; it does not validate the later safety and localization changes. Local mode is not the hosted multiplayer experience; moderator APIs are covered by integration tests, not a live OIDC browser session.

## Start here: create staging

1. Inspect the [live Render service](https://dashboard.render.com/web/srv-db1bc25g1s2s739djiv0) and its database, disk, and environment settings. The earlier startup failed with `DEPTH_ZERO_SELF_SIGNED_CERT`; the corrected Blueprint deployed successfully. Create an Auth0 (or compatible OIDC) regular web application only if external sign-in is desired. Keep credentials in provider secret settings, never chat or source control.
2. Review `render.yaml` against the live service. It currently selects free Node and PostgreSQL plans, has no durable SQLite disk, and is not suitable for public data. Free Render PostgreSQL is temporary. Before publishing user data, choose a paid web service with persistent storage or migrate the permanent canvas to durable managed storage. Then configure `APP_ORIGIN` and `CORS_ORIGIN` to the same HTTPS origin without a trailing slash. The Blueprint provisions PostgreSQL and runs migrations before startup.
3. Register `https://YOUR-STAGING-HOST/api/v1/auth/callback` with the identity provider. Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and the generated `SESSION_SECRET`. Never configure development bearer tokens in production.
4. For production media, create a private S3-compatible bucket with encryption and versioning. Configure `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, and the credential pair in the host secret store (or use a host-managed AWS identity). Grant only the bucket permissions needed for object reads/writes. No public bucket or browser storage credentials are needed. Do not remove the bucket configuration after stored records reference it.
5. Sign in once, inspect your own `/api/v1/me` response to obtain the immutable user ID, then use a trusted operator terminal with database access:

```bash
pnpm --dir server ops grant-role USER_UUID administrator "Initial owner administrator setup"
pnpm --dir server smoke https://YOUR-STAGING-HOST
```

The role command deliberately cannot promote development/system identities. Access to the database/operator terminal is privileged; it is not a public API.

## Migration of existing media

Migration 003 marks legacy assets unverified. They remain stored but are not publicly served until successfully decoded/re-encoded. Before upgrading a populated database, take a backup and rehearse:

```bash
pnpm --dir server ops validate-legacy-media
pnpm --dir server ops validate-legacy-media --apply
```

The first command only reports counts. The second processes valid assets; invalid assets stay quarantined. No original files are deleted automatically. This command keeps processed legacy bytes in PostgreSQL; it does not bulk-transfer them to a bucket.

## Backup and recovery

Install PostgreSQL client tools matching the server major version. Set `DATABASE_URL` securely and create a restricted backup directory outside the repository. Backups contain private account and moderation data; encrypt them, restrict access and keep them off the web service disk.

```bash
pnpm --dir server ops backup /secure/path/unique-new-backup.dump
```

The command refuses an existing output path. Session/counter rows are excluded. If it fails, a partial file may remain: do not treat that file as a successful backup. Native credentials are passed through the child environment, not shell command arguments. The implementation uses PostgreSQL's [custom-format dump](https://www.postgresql.org/docs/current/app-pgdump.html).

To rehearse restoration, provision a **separate, empty** database, set `RESTORE_DATABASE_URL` securely, stop all writers to that target, and use only a trusted backup:

```bash
pnpm --dir server ops restore /secure/path/backup.dump --confirm-empty-target
```

This refuses nonempty targets and uses a [single-transaction restore](https://www.postgresql.org/docs/current/app-pgrestore.html). It never drops an existing database. Run migrations against the restored target, compare content/audit counts, verify object media access, and smoke-test it before switching traffic. Stored media keys also require the corresponding object-store backup/version history; a database dump alone does not back up bucket objects.

Configure a daily backup job and failure alerts in the infrastructure provider, keeping 30 daily and 12 monthly copies per the draft policy. Neither a schedule nor an alert destination has been activated. Record achieved recovery time and recovery point during the hosted drill; target 24-hour RPO and 8-hour read-only RTO are objectives, not proven guarantees.

Rollback: retain the previous application build and a verified backup. Prefer an application rollback compatible with the additive schema. Do not edit applied migrations or run destructive down-migrations; restore to a separate database if a data rollback is required. Suspend publishing during a traffic switch and validate readiness first.

## Gates still open before public launch

- Provision and verify real OIDC, cookie security, logout, session expiry and two independent browser accounts; test wrong-account ownership and moderator actions through actual sessions.
- Run the native PostgreSQL CI job and staged concurrent-load tests. Test the configured private bucket, denied direct public access, provider outages and native backup restoration.
- Activate uptime/database/storage alerts, error-log collection, backup schedules and an on-call contact. Request logs and health endpoints are implemented; external monitoring is not configured.
- Before monetization, configure the publisher account, real display/rewarded unit IDs, Google-certified IAB TCF CMP, exact `/ads.txt` seller record, and operator privacy disclosures. Review user-generated imagery and child-safety readiness before enabling any ads.
- Complete scale controls: entity viewport pagination, paged/streamed full-world export and request/load sizing. Current entity listing/full export are intended for small test worlds, not unrestricted public scale.
- Reconcile draft policy with snapshot persistence. Current defaults are 600 API requests/minute/IP, 120 mutations/minute/member, 5 reports/hour/IP, 5,000 chunk writes/day, 100 entity writes/day and 30 uploads/day. The draft per-stroke affected-pixel budgets and active-entity cap are not yet implemented. Tune and enforce final budgets before inviting untrusted traffic.
- Finish the retention/account-deletion workflow, orphan-asset cleanup and report categorization/deduplication. Existing history is retained; no destructive automatic purge is enabled. Approve retention and privacy terms with the actual hosting region and operator requirements.
- Remote bulk world import is resumable but incremental, not an atomic database restore; the UI warns before import. A region/validation rejection may leave previously accepted items published, and a concurrent chunk conflict still requires an explicit server-state choice. Rehearse these cases in staging. Keep legacy local exports as archives and use operator tools for authoritative recovery.

Live cursors, WebSockets, social features and multiple worlds remain intentionally deferred per the MVP scope. They are not required to create staging.

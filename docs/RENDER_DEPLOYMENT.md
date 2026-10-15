# Deploying on Render

[Project home](../README.md) · [Launch readiness](LAUNCH_READINESS.md)

## Verified status — 2026-10-15

- The [Render preview](https://forgotten-network.onrender.com) is live. Its successful Blueprint deployment used GitHub commit `b01bc91941c809b9202cf9509b4a11f0372dc1b9` on `main`.
- The preceding auto-deploy failed to start: the logs showed `DEPTH_ZERO_SELF_SIGNED_CERT` during PostgreSQL migrations. It was canceled to let the queued Blueprint deployment proceed.
- The earlier Blueprint required TLS with certificate verification for the same-region internal Render PostgreSQL URL. Render's [PostgreSQL guidance](https://render.com/docs/postgresql-creating-connecting) says internal connections can use TLS with self-signed certificates. The corrected Blueprint uses that private connection without TLS; migrations 006 and 007 then applied and the service reached Live.
- The public frontend loaded, and `/api/health`, `/api/canvas/health`, and `/api/v1/health/ready` returned success with the same release SHA. Public auth configuration and world entities were readable. The terminal smoke command could not run from this workspace because its network resolver returned `ENOTFOUND`; these checks were completed through the browser.
- The service remains on the free web plan without a persistent SQLite disk. No hosting upgrade, data migration, or resource purchase was performed.

**The preview runs, but it is not ready for public user data.** Complete the storage, moderation, backup, and operator checks below before inviting users.

## 1. Inspect the existing service

Open [the Render service](https://dashboard.render.com/web/srv-db1bc25g1s2s739djiv0). Check its Events and Logs, then confirm the linked repository is `ABDILAZIZT/ForgottenNetwork` and the branch is `main`.

Preserve existing data before redeploying or changing a database path. The shared canvas stores identities and artwork in SQLite; a new empty path creates a different world.

## 2. Configure durable storage

The root Blueprint still uses free plans. It is a preview template and does not provision a persistent SQLite disk.

- Use one web instance with a persistent disk. Set `PERMANENT_DB_PATH` to a file on its mount, for example `/var/data/permanent.sqlite`.
- Verify the actual disk mount and preserve a consistent backup of any existing world before moving it. Changing the environment variable alone does not migrate data.
- Use a PostgreSQL plan appropriate for retained production data. Verify its status, connection string, retention, and backups.
- Keep independent SQLite snapshots and PostgreSQL backups. Rehearse restoration into separate storage before launch.

Render documents [persistent disks](https://render.com/docs/disks) and [free-plan limits](https://render.com/docs/free). A paid plan or disk creates recurring costs and needs the owner's approval before purchase.

## 3. Match the runtime settings

| Setting                                | Expected value / action                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                | Node.js 22.13 or newer; Blueprint selects Node 22.                                                                                             |
| Branch                                 | `main`                                                                                                                                         |
| Auto-deploy                            | On each commit to `main` (`commit`). Confirm the service uses this setting.                                                                    |
| Build command                          | `npm install -g pnpm@11.25.0 && pnpm install --production=false --frozen-lockfile && pnpm run build`                                           |
| Start command                          | `node server/index.js`                                                                                                                         |
| Health path                            | `/api/health`                                                                                                                                  |
| `NODE_ENV`                             | `production`                                                                                                                                   |
| `DATABASE_URL`                         | The intended hosted PostgreSQL connection, entered privately in Render.                                                                        |
| `DATABASE_SSL`                         | `false` for the Blueprint's same-region private Render PostgreSQL URL. External database URLs require TLS and suitable certificate validation. |
| `MIGRATE_ON_START`                     | `true`; back up populated databases before deploying migrations.                                                                               |
| `SESSION_SECRET`                       | A private random value of at least 32 characters; preserve it across ordinary deploys.                                                         |
| `APP_ORIGIN`, `CORS_ORIGIN`            | The actual HTTPS website origin. Current Blueprint uses `https://forgotten-network.onrender.com`.                                              |
| `PERMANENT_DB_PATH`                    | Existing or safely migrated SQLite file on the persistent disk.                                                                                |
| `CANVAS_MODERATOR_IDS`                 | Comma-separated immutable IDs of the intended moderator artists.                                                                               |
| `VITE_WORLD_MODE`, `VITE_API_BASE_URL` | `remote`, `/api/v1`                                                                                                                            |
| `ADS_ENABLED`, `VITE_ADS_ENABLED`      | `false` until the ad-provider and consent setup is complete.                                                                                   |

Artist identities work independently of OIDC. If external sign-in is enabled, configure all three `OIDC_*` fields and register `APP_ORIGIN/api/v1/auth/callback` with the provider. Do not use placeholder credentials or development bearer tokens in production.

The server serves `client/dist` automatically in production. Browser `VITE_*` values are bundled at build time; changing them requires a rebuild. Never put a secret in a `VITE_*` variable.

## 4. Verify the deployed release

Run `pnpm check` locally for the intended commit. After Render reports a successful deploy, run:

```bash
pnpm --dir server smoke https://forgotten-network.onrender.com FULL_40_CHARACTER_COMMIT_SHA
```

The script sends only reads. It checks frontend assets, combined health, the canvas SQLite store, PostgreSQL readiness, and release metadata. The expected SHA must match the deployed release; a GitHub push alone is insufficient evidence.

`/api/health` returns HTTP 503 when SQLite cannot be queried or the production PostgreSQL migration set is missing or mismatched. `/api/v1/health/ready` verifies every current migration and checksum. Successful health responses do not prove disk persistence or backup recoverability.

## 5. Complete the launch checks

- Verify the interface on desktop and mobile, including Arabic direction and keyboard navigation.
- Test artist recovery and ownership using separate test identities in staging.
- Configure the intended moderator and verify pending-upload review.
- Rehearse disk/database backup restoration and a redeploy that preserves staging artwork.
- Configure uptime alerts and an operator contact.

These checks remain outstanding until recorded in [launch readiness](LAUNCH_READINESS.md).

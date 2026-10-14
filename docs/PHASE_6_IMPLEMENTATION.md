# Phase 6: staging deployment preparation

Implemented on 2026-09-10. No external resources have been provisioned.

Historical phase note: later security, moderation and recovery work is recorded in [current launch readiness](LAUNCH_READINESS.md).

- Public world exports include media referenced by public entities, using existing public asset reads. Unplaced uploads are not part of a world export.
- Visitor export does not flush pending edits. Import, retry and undo controls require publishing permission; import handlers and engine undo enforce this too.
- Express serves the built frontend and API on one origin. HTML is revalidated; hashed assets are cached. Unknown API routes and missing assets remain errors instead of returning the app HTML.
- Production no longer initializes the development JSON file when PostgreSQL is selected.
- The current `render.yaml` draft defines **free** Node and PostgreSQL plans. It is suitable only for short-lived preview work: the free database expires, free web services have ephemeral filesystems, and the permanent canvas SQLite file has no durable disk. Choose an affordable paid service with persistent storage or move the permanent canvas store to durable managed storage before using it for public data. No external resources have been created.

## Deploy to staging

1. Push the project to your Git repository and create a Render Blueprint from `render.yaml`.
2. Review the region and plans. Enter `APP_ORIGIN` and `CORS_ORIGIN` as the same HTTPS website origin, without a trailing path.
3. Enter the OIDC issuer, client ID and client secret in Render. Register `APP_ORIGIN/api/v1/auth/callback` with the provider. Never add development tokens to production.
4. The build installs development dependencies for TypeScript/Vite, builds the remote frontend, then the pre-deploy command runs migrations. Startup serves the frontend and backend together.
5. Confirm readiness reports `storage: postgresql`. Test visitor export, member login, publishing, reload persistence, logout and backup restoration in staging.

For a local single-server preview, build with `VITE_WORLD_MODE=remote`, then start the server with `SERVE_FRONTEND=true`. Without an OIDC provider, this production frontend is read-only; development tokens are deliberately excluded from production bundles.

The deployment definition follows the [Render Blueprint reference](https://render.com/docs/blueprint-spec). It has not been submitted to Render or tested against a live PostgreSQL/OIDC environment yet.

Public-launch work still includes rate limiting, validated media processing/object storage, moderation tools, monitoring and recovery drills. This phase does not claim those features are implemented.

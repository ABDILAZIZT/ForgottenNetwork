# Phase 1 audit — 2026-10-14

## Scope and current architecture

The supplied source is a nested folder without Git metadata. Its tracked files matched the remote `main` branch at `cd6a05b`. A Git checkout was created at `work/ForgottenNetwork-upstream`, and the reviewable copy is under `outputs/ForgottenNetwork-main`.

The current application mounts `PermanentWorld`. It uses the SQLite-backed permanent canvas, a live WebSocket connection, `RasterStudio` for image editing, and separate local/remote repositories for the retained Classic world. This is newer than the architecture described in the initial master prompt. The old `PixelEditor` and `EntityCreatorModal` had no application callers, so both were removed; the README, Arabic guide, and studio migration note now describe the active replacement.

## Verification

The following checks passed using the already-cached project tools:

- Prettier check across the repository.
- ESLint for client and shared TypeScript, plus the server JavaScript syntax check.
- Shared TypeScript typecheck and client TypeScript/Vite production build.
- All tests: 3 shared, 51 client, and 50 server (104 total).
- Local startup smoke check: the frontend loaded at `http://127.0.0.1:5173/`; `/api/health` returned `ok`; `/api/canvas/health` reported SQLite storage; the canvas showed the seeded artwork.

The full `pnpm check` passed from the cached dependencies. For this run, pnpm's `verify-deps-before-run` auto-install guard was disabled and temporary command shims were placed under `work/pnpm-bin`, because the interrupted install had not created `.bin` links. A fresh `pnpm install` could not be verified: registry metadata requests failed TLS verification (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), and the offline cache lacked metadata for `lucide-react`. No lockfile changes were made.

## Open gates for later phases

- Phase 2 added an opt-in AdSense/GPT integration, consent settings, CSP allowlisting, `ads.txt` placeholder comments and setup docs. Live ads remain disabled because the publisher IDs, certified CMP and seller record are not configured. Rewarded web ads have no server-side verification, and the app's demo balances remain local only.
- The app's current policies say uploaded images are not semantically scanned and there is no verified guardian-consent workflow. It is not ready to be represented as a fully moderated, child-directed service.
- Production OpenID Connect, hosted PostgreSQL, object storage, monitoring, and deployment resources remain unconfigured, as recorded in `LAUNCH_READINESS.md`.
- Root and server runtime requirements now match the documented Node 22.13 minimum. The Render draft now uses the pinned pnpm version, refuses insecure auth-validation bypass, keeps TLS certificate verification enabled, and prompts the operator for OIDC secrets. It remains a free preview template without durable permanent-canvas storage, not a production deployment.

Phase 1's code checks and legacy-component cleanup are complete. The full `pnpm check` passed using cached dependencies and temporary command shims; a fresh dependency install remains unverified because of the registry TLS failure above.

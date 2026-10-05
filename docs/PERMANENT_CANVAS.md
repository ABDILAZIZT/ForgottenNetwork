# Permanent Canvas

The default route is the permanent shared canvas. `/?mode=classic` preserves the previous editable world, its browser data, and PostgreSQL integration. No old artwork is migrated, erased, or silently made immutable.

## Included

- Passwordless artist identity with signature color, optional 32px avatar, and a downloadable private recovery key. Names are labels, not verified identities. Only a hash of the secret key is stored on the server.
- Brush, crisp pixel pen, four shape tools, five text fonts, validated images, looping GIFs, eight canvas-native stickers, avatar stamps, draft-only erasing, and PNG area export.
- Smooth pan/zoom, touch pinch, density minimap, free-space finder, author inspector, jump-to-own-art, and optional audio/reduced motion.
- Live cursors, in-progress drawing previews, accepted art, chat, reactions, notifications, weekly rankings, UTC visit streaks, achievements, daily challenge XP, and a most-appreciated spotlight.
- A seeded collection explicitly attributed to Forgotten Studio. All artist/artwork/area counts are computed from saved records, not invented activity numbers.

## Ownership and Durability

The server normalizes every placement and derives attribution from the authenticated identity. A `BEGIN IMMEDIATE` transaction checks and claims 8x8 cells, inserts the artwork, and commits before acknowledging success. A cell belongs to one immutable artist ID. The owner may append new strokes over their own cells; other artists are blocked. Brush and pixel strokes clip foreign-owned cells; other colliding placements reject atomically. Existing strokes remain immutable history, ordered by server sequence; overlays do not edit or destroy prior strokes. The renderer clips accepted artwork to its saved cells, including transparent media and text.

The SQLite database contains artwork, ownership, identity hashes, uploaded image bytes, chat, reactions, and challenge completions. WAL mode and FULL synchronization are enabled. Database triggers prohibit UPDATE and DELETE on accepted art and media. SQLite migration v2 adds removal tombstones, mutation receipts and an active-artwork view, and makes the occupancy index rebuildable. Owner-authorized removal is transactional and checks each explicit artwork ID and immutable sequence version. Replays return the stored removal result; a removed placement cannot be republished by the retry queue. Active cells are rebuilt from surviving owner artwork only. Removal broadcasts invalidate connected clients; reload reads only active records. Owners may explicitly restore their own removals within 30 days, provided no other identity has claimed the cells. Original records and mutation receipts are retained as recoverable history; no production data is purged by this migration.

Before an automatic placement is sent, it is saved in a local, identity-bound retry queue. Network failures and rate limits keep it queued and retry automatically. Draft-mode work is saved locally and is not published until explicitly submitted. Invalid or conflicting placements are rejected, not reported as saved. Browser storage can be cleared or fail; the UI reports failures, and unsent work is not yet server-owned.

**Accepted history is retained, but public visibility is not permanent: owners may remove artwork. This is not protection against a database superuser, destroyed disks, or hosting shutdown.** Administrators with filesystem access can still remove files or alter schema. Keep redundant off-machine backups and test restores. A public user-generated service also needs an abuse/legal response policy; append-only storage alone is not a moderation system.

## Run and Deploy

Use Node 22.13+ (tested with Node 24), then `pnpm install` and `pnpm start`. The new API is `/api/canvas`; WebSockets upgrade at `/api/canvas/live`. Vite proxies both to port 3001. `CORS_ORIGIN` must include the actual browser origin, including its scheme and port.

The database defaults to `server/data/permanent.sqlite`. Set `PERMANENT_DB_PATH` to a persistent volume on a server. The Render blueprint includes `/var/data` for this purpose; it does not provision anything until you deploy it. Review disk and plan costs first. Classic Studio still uses the separately configured PostgreSQL database.

This deployment is **one Node process on one persistent SQLite volume**. Do not run independent replicas with separate disks: they would create separate worlds. Larger deployment requires a shared transactional ownership store, cross-process pub/sub, media caching, and workload-specific load tests. Redis and a distributed backend are not configured here.

Placements are limited to 512x512 world pixels. The coordinate range is +/-1,000,000, not mathematically infinite. Visible regions are quantized to 512px neighborhoods and loaded with pagination; off-screen renderer data is evicted. Uploads are limited to 8MB, 2048px per frame, 120 frames, and 16 million decoded pixels. Cursor updates are throttled, each identity is limited to ten placements/second, and uploads/chat/registration have additional limits. Nickname creation is not a substitute for anti-abuse account verification.

PNG export captures published artwork, without UI/cursors/unpublished drafts; the longest output dimension is capped at 2048 pixels. GIFs are captured at the first animation frame. The spotlight currently selects the most-reacted piece (ties favor newest); it is not a staffed daily editorial selection. Animations target the display refresh rate, but 60fps under production load is not guaranteed.

## Back Up and Restore

From the repository root:

```bash
node server/permanent/backup.js /safe/off-machine-staging/canvas-2026-09-30.sqlite
```

Use a new destination filename. The command validates integrity and uses SQLite `VACUUM INTO` to take a consistent snapshot while the app is running. Copy that snapshot to independent storage. Do not copy only the main SQLite file while WAL writes are active. Backups contain identity hashes and community content; protect access to them.

To restore: stop the server, preserve the existing database and any WAL/SHM sidecars, set `PERMANENT_DB_PATH` to the restored snapshot's new path on the persistent volume, and restart. Confirm `/api/canvas/health`, counts, uploaded images, and representative ownership conflicts. Keep the old database until verification is complete. Restore Classic Studio's PostgreSQL/browser exports separately.

Artist identity secrets live in each browser. Download the private identity key from the profile and keep it securely; use “Returning artist?” to restore it elsewhere. The project ZIP does not contain browser storage or private recovery keys.

## Verification

`pnpm check` runs formatting, lint, TypeScript, tests, and a production build. Permanent canvas tests cover identity spoofing, simultaneous claims, clipping, trigger enforcement, idempotency, pagination, connected territory, challenge awards, asset ownership/validation, WebSocket previews/presence/chat/reactions, rate limits, origin rejection, reopen persistence, and live backup integrity. Browser checks use an isolated database so test marks never pollute the real append-only canvas.

## Management controls and migration v2

The audited main at 19aed7b had no Clear Space control or clear-space API. The previous eraser was intentionally draft-only. The new Clear Space control removes up to 400 of your published artworks fully contained in the visible viewport after confirmation. It removes entire artworks, not arbitrary pixels. Delete artwork and clicking with the eraser remove a single owned artwork. Clear Drafts affects only this device; Find free space only navigates. Pending publications block removal until settled. The profile lists published work and recoverable removals for keyboard access.

Migration v2 runs idempotently when opening the SQLite store. It preserves original rows and bytes; only obsolete occupancy UPDATE/DELETE triggers are dropped. Existing artwork/media immutability triggers remain. Test with a copy and verify backups before deploying. Do not roll back to pre-v2 application code, which does not understand tombstones. No production migration command was run during implementation.

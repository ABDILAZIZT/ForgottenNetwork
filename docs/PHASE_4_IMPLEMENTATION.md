# Phase 4: shared HTTP persistence

Status: implementation baseline complete  
Last updated: 2026-09-08

## Delivered

- Versioned, server-authoritative chunk snapshots
- Idempotent chunk, entity, asset, and deletion mutations
- Optimistic chunk concurrency using expected versions
- Public shared-world reads and authenticated mutations
- Atomic replacement of the development JSON data file
- HTTP client gateway behind `WorldRepository`
- Durable IndexedDB queue for unsent remote mutations
- Automatic retry when the browser comes back online
- Explicit syncing, retry, conflict, rejected, and synced UI states
- A conflict recovery action that deliberately discards pending local mutations before reloading server state
- Independent-client API tests and live two-tab browser verification

## Runtime modes

Local mode remains the safe default:

```env
VITE_WORLD_MODE=local
```

Shared development mode requires the same temporary token in the server and frontend processes:

```env
DEV_AUTH_TOKEN=a-long-random-development-token
VITE_WORLD_MODE=remote
VITE_API_BASE_URL=/api/v1
VITE_DEV_AUTH_TOKEN=a-long-random-development-token
```

`VITE_DEV_AUTH_TOKEN` is compiled into the browser bundle. It is strictly a local/staging development bridge and must never be treated as a production secret. The server refuses to start with `DEV_AUTH_TOKEN` when `NODE_ENV=production`.

## Implemented transport

The current canvas engine serializes complete chunks. Phase 4 therefore adds a compatibility transport:

- `GET /api/v1/worlds/:worldId/chunks`
- `GET /api/v1/worlds/:worldId/chunks/:chunkX/:chunkY`
- `PUT /api/v1/worlds/:worldId/chunks/:chunkX/:chunkY`
- `DELETE /api/v1/worlds/:worldId/chunks/:chunkX/:chunkY`
- `GET|PUT|DELETE /api/v1/worlds/:worldId/entities/...`
- `GET|PUT /api/v1/worlds/:worldId/assets/...`
- `GET /api/v1/worlds/:slug`
- `GET /api/v1/me`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

Every snapshot mutation carries a version-4 UUID. The server stores its canonical request hash and response. An identical replay returns the original response; reusing the UUID with different data or writing against a stale chunk version returns `409 CONFLICT`.

## Deliberate limitations

This phase proves the end-to-end architecture; it does not make the application public-production ready.

- `server/db.json` is a single-process development store, not the PostgreSQL schema in `server/migrations`.
- The temporary bearer token is not user authentication.
- Full-chunk snapshots are larger than pixel-delta operations.
- Conflict recovery currently offers “use server”; visual merging is not implemented.
- Uploaded assets are validated by declared data-URL type and size but are not decoded, scanned, or processed into object storage.
- The server does not yet push live changes to already-open clients.

Before public deployment, replace the development store with PostgreSQL transactions, connect a real session identity provider, move assets to validated object storage, implement the documented pixel-operation endpoint, and add rate limiting and moderation enforcement.

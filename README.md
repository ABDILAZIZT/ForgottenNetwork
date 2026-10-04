# Forgotten Network / Cyber Terrarium

Forgotten Network is a collaborative canvas built with React, TypeScript, Canvas 2D, native WebSockets, and an append-only SQLite ownership store. The default experience is the permanent shared canvas; the previous three-layer world is preserved at `/?mode=classic`.

> The permanent canvas is implemented for local use. Public deployment still requires durable storage, off-machine backups, abuse controls, and realistic load testing. Read [the permanent canvas guide](docs/PERMANENT_CANVAS.md) before deployment. The older [launch readiness](docs/LAUNCH_READINESS.md) applies to Classic Studio.

## Requirements

- Node.js 22.13 or newer (Node 24 recommended; the new canvas uses `node:sqlite`)
- pnpm 11 (Corepack can provide it with `corepack enable`)
- A modern browser with Canvas 2D and IndexedDB support

## Start locally

```bash
pnpm install
pnpm start
```

- Frontend: <http://localhost:5173>
- Backend health check: <http://localhost:3001/api/health>
- Permanent storage health: <http://localhost:3001/api/canvas/health>

To start either service separately:

```bash
pnpm start:client
pnpm start:server
```

## Quality checks

```bash
pnpm check
```

The combined check verifies formatting, linting, frontend and backend tests, TypeScript, and the production frontend build. Individual commands are also available: `pnpm format`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## Architecture

```text
client/
  src/permanent/    Permanent canvas, tools, social UI, renderer, durable retry queue
  src/components/   React HUD, minimap, and experimental creation UI
  src/engine/       Canvas renderer, chunks, camera, entities, GIFs, IndexedDB driver
  src/repositories/ World persistence contract plus local and remote adapters
server/
  permanent/        Atomic ownership store, live API, verified SQLite backup command
  data/             Permanent canvas database and validated media blobs
  index.js          Development REST API
  db.json           Development-only JSON data store
  database.js       PostgreSQL pool and transaction helpers
  auth.js           Database sessions and OpenID Connect
  migrations/       Executable PostgreSQL schema
shared/
  src/              Shared Phase 2 TypeScript contracts
docs/
  PERSISTENCE.md    Current browser and server storage behavior
```

In **Classic Studio local mode**, the frontend uses `LocalWorldRepository`, backed by IndexedDB database `forgotten-network`, version 4:

- `chunks`: 128×128 RGBA chunks with three layers
- `entities`: placed media and procedural residents
- `assets`: uploaded PNG, JPEG, WebP, and GIF data

World export/import includes all three stores. Import replaces the current local world after validating the file structure.

The engine and UI depend on the repository contract instead of importing browser storage directly. Writes are serialized and save state is visible in the header. Member exports wait for pending writes; visitor exports read the saved public world without sending queued edits. Select the HTTP adapter with `VITE_WORLD_MODE=remote`.

Classic Studio remote mode connects the repository to versioned, idempotent shared-world endpoints. PostgreSQL and OpenID Connect are selected through production environment variables. Its live updates remain deferred. The **new permanent canvas** uses its own SQLite database, passwordless identity keys, and real-time WebSocket transport independently of Classic Studio's adapter.

## UI status

`PermanentWorld` is the default application. `WorldOverlay` and `Minimap` remain active in Classic Studio. `PixelEditor` and `EntityCreatorModal` remain experimental, unmounted components.

## Documentation

- [Permanent canvas: operation, guarantees, backup and recovery](docs/PERMANENT_CANVAS.md)

- [Arabic project guide](PROJECT_GUIDE_AR.md)
- [Persistence model](docs/PERSISTENCE.md)
- [Phase 0 baseline](docs/PHASE_0_BASELINE.md)
- [Product specification and world rules](docs/PRODUCT_SPEC.md)
- [Roles and permissions](docs/PERMISSIONS.md)
- [Contribution and retention policy](docs/CONTENT_AND_RETENTION_POLICY.md)
- [Shared-world MVP scope](docs/MVP_SCOPE.md)
- [Shared data model](docs/DATA_MODEL.md)
- [HTTP API contract](docs/API_CONTRACT.md)
- [Legacy migration strategy](docs/MIGRATION_STRATEGY.md)
- [World repository architecture](docs/REPOSITORY_ARCHITECTURE.md)
- [Phase 4 shared HTTP persistence](docs/PHASE_4_IMPLEMENTATION.md)
- [Phase 5 PostgreSQL and authentication](docs/PHASE_5_IMPLEMENTATION.md)
- [Phase 6 staging preparation](docs/PHASE_6_IMPLEMENTATION.md)
- [Current launch readiness, operator commands and remaining gates](docs/LAUNCH_READINESS.md)

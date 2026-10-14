# Forgotten Network / Cyber Terrarium

Forgotten Network is a collaborative canvas built with React, TypeScript, Canvas 2D, native WebSockets, and an append-only SQLite ownership store with recoverable owner revisions. One studio now serves all entry links. Previous three-layer worlds remain accessible through **Tools & saved worlds**, without automatic migration or publication.

> The permanent canvas is implemented for local use. Public deployment still requires durable storage, off-machine backups, abuse controls, and realistic load testing. Read [the permanent canvas guide](docs/PERMANENT_CANVAS.md) and [launch readiness](docs/LAUNCH_READINESS.md) before deployment.

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
  src/components/   Shared interface panels, rewards, marketplace, and minimap
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

`PermanentWorld` is the only application entry. The obsolete `App`, `WorldOverlay`, Classic onboarding, `PixelEditor`, and `EntityCreatorModal` were removed because they had no callers. `RasterStudio` provides local image editing and versioned owner revisions; `StudioUtilities` preserves saved-world access. The canvas shell, first-mark onboarding, Expedition tutorial, ad-choice notice, and policy navigation can switch between English and Arabic; most editor, marketplace, moderation, and legal body text remains English. See [the migration map and limitations](docs/STUDIO_MIGRATION.md) and [the polish and localization notes](docs/POLISH_AND_LOCALIZATION.md).

## Advertising status

Google display and rewarded ad integration is disabled by default. Production ad scripts require the visitor's saved Allow choice and an allowed IAB TCF event from a configured CMP. Local reward caps and gems remain device-only demos; Google rewarded web ads do not provide server-side verification. See [advertising setup](docs/AD_CONFIGURATION.md) and [trust and safety limits](docs/TRUST_AND_SAFETY.md).

## Safety and uploads

New image and GIF uploads stay private until a configured moderator approves them; without a moderator they remain pending. There is no visual classifier, and existing drawings/strokes are not screened. Three distinct authenticated open reports can temporarily hide eligible content for review. This is a local safety control, not a child-safety guarantee. See [the safety and accessibility implementation notes](docs/PHASE_4_SAFETY_ACCESSIBILITY.md).

## Rewards and collection

The canvas includes a seven-day login streak, three date-seeded daily challenges (drawing, exploring, and placing creations), and 2–5 demo gems for each neighborhood first visited that day. Challenge rewards are 30–50 gems. These balances live in browser storage and are not account-backed or tamper-resistant. The 18-item Creator Collection is grouped into Brushes, Land, Creatures, and Cosmetics; its 75-coin daily grant and 1,500-coin cap use a separate local demo wallet. There is no checkout or cash value.

## Documentation

- [Permanent canvas: operation, guarantees, backup and recovery](docs/PERMANENT_CANVAS.md)

- [Arabic project guide](PROJECT_GUIDE_AR.md)
- [Product polish and localization scope](docs/POLISH_AND_LOCALIZATION.md)
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
- [Phase 4 safety and accessibility](docs/PHASE_4_SAFETY_ACCESSIBILITY.md)
- [Phase 5 PostgreSQL and authentication](docs/PHASE_5_IMPLEMENTATION.md)
- [Phase 6 staging preparation](docs/PHASE_6_IMPLEMENTATION.md)
- [Current launch readiness, operator commands and remaining gates](docs/LAUNCH_READINESS.md)
- [Advertising configuration and consent gates](docs/AD_CONFIGURATION.md)
- [Phase 3 economy and daily challenges](docs/PHASE_3_IMPLEMENTATION.md)
- [Trust, safety and privacy audit](docs/TRUST_AND_SAFETY.md)
- [Phase 1 audit and environment notes](docs/PHASE_1_AUDIT.md)

# Shared-world MVP scope

Status: Phase 1 implementation baseline  
Last updated: 2026-09-08

## Launch definition

The MVP is ready for a private beta when two independent browsers can reliably interact with the same server-authoritative world, ownership is enforced, unsafe media is constrained, and operators can recover or moderate contributions.

## Required capabilities

### Exploration

- One public world
- Viewport-based chunk and entity loading
- Pan, zoom, minimap, and teleport
- Shareable URLs containing position and zoom
- Entity detail panel with creator, date, description, and stable link

### Creation

- Authenticated publishing
- Three drawing layers in Commons regions
- Server-confirmed stroke persistence
- Static image and constrained GIF upload
- Entity preview, placement, scale, name, and description
- Creator management of owned entities
- Clear local, syncing, synced, retry, and rejected states

### Safety and control

- Server-side schema validation
- Ownership and role authorization
- Account and IP rate limiting
- Configurable contribution quotas
- Report entity or bounded region
- Moderator queue, hide, restore, and suspension actions
- Audit records for moderation
- Soft deletion and retained edit history

### Operations

- PostgreSQL-backed authoritative records
- Validated object storage for media
- IndexedDB used as cache and retry queue
- Development, staging, and production environments
- Automated formatting, linting, tests, and production builds
- Error monitoring, health checks, backups, and tested restoration
- Documented deployment and rollback

## Deferred capabilities

- Real-time WebSocket updates and live cursors
- Follows, reactions, comments, and chat
- Trending or personalized discovery
- Multiple worlds
- Personal plots or private regions
- Event administration UI
- Full in-site frame animation editor
- Rich creature simulation
- Full offline authoring and conflict merge
- Payments or marketplace

The data model may reserve clean extension points for deferred capabilities, but MVP implementation must not build unused generalized systems for them.

## Release gates

### Correctness

- A contribution accepted for User A is visible to User B after refresh.
- Refreshing either client does not lose a confirmed contribution.
- Retrying a request does not duplicate a stroke or entity.
- A stale chunk edit cannot silently overwrite a newer accepted edit.
- Exported legacy local worlds can be preserved before migration.

### Authorization

- A visitor cannot mutate world state.
- A member cannot delete or rewrite another member's entity.
- A suspended member cannot publish using direct API calls.
- Every moderator mutation has a reason and audit record.

### Media safety

- Disguised, unsupported, oversized, and over-budget animated files are rejected.
- Public clients receive processed assets rather than unverified originals.
- Removing an entity makes it unavailable through ordinary public queries.

### Reliability

- Temporary API failure keeps an unsent local operation available for retry.
- The UI never calls an unconfirmed server change “synced.”
- Health checks distinguish a running process from a ready database.
- Backup restoration has been successfully rehearsed.

### User experience

- A first-time visitor can explore without instructions.
- A member can publish a basic contribution without reading developer documentation.
- Core exploration works on a mobile viewport.
- Keyboard controls and interactive icons have accessible names.
- Reduced-motion behavior is available.

## Phase 2 handoff requirements

The schema and API design in Phase 2 must represent:

- Immutable user IDs and roles
- One world with extensible world IDs
- Region type and policy
- Versioned 128×128 chunks with three layers
- Idempotent stroke operations and edit attribution
- Creator-owned entities and assets
- Soft deletion
- Reports and moderator audit events
- Configurable quotas
- Retention timestamps
- Stable shareable entity and location identifiers

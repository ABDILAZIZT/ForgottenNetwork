# Forgotten Network product specification

Status: Phase 1 implementation baseline  
Last updated: 2026-09-08

## Product statement

Forgotten Network is a persistent, shared pixel-art civilization. Anyone can explore it, while signed-in members can leave attributable drawings and media residents inside clearly governed public regions.

The product should make a contribution feel permanent and discoverable without allowing one visitor to dominate, erase, or destabilize the world.

## MVP goals

1. A visitor can open the site and explore without creating an account.
2. A member can draw or place an approved media entity in a public region.
3. A confirmed contribution appears for another visitor after refresh.
4. The creator can manage their own entities, and moderators can address abuse.
5. Every accepted mutation is attributable, rate-limited, and recoverable.
6. A location can be shared using a stable URL.

Real-time updates are a post-MVP enhancement. The first shared release must be correct after refresh before it becomes live.

## Non-goals for the MVP

- General-purpose chat or private messaging
- Payments, trading, or a creator marketplace
- Multiple public worlds
- User-owned land or rentable plots
- Full offline editing and later merge
- Complex creature breeding, combat, or economies
- Native mobile applications
- Algorithmic popularity feeds

## Primary users

### Visitor

Arrives through a shared location or the home page, explores the world, inspects creations, and decides whether to join.

### Member

Creates a small drawing or media resident, sees it persist, shares its location, and returns to manage their contribution.

### Moderator

Reviews reports, hides harmful content, suspends abusive publishing, and restores a damaged region using auditable actions.

## Core journeys

### Explore

1. Open the world without authentication.
2. Pan, zoom, teleport, or follow a shared coordinate URL.
3. Load only the chunks and entities near the camera.
4. Select an entity to view its creator, description, creation time, and location.

### Draw

1. Sign in.
2. Select a public Commons region and a drawing tool.
3. Draw a bounded stroke.
4. Receive local, syncing, accepted, or failed status.
5. See the accepted result after refresh from another browser.

### Place a resident

1. Sign in and upload or create media.
2. Wait for validation and processing.
3. Add a name, description, behavior, and scale.
4. Preview and place the entity in an allowed region.
5. Publish it and receive a stable entity and location link.

### Moderate

1. Open a reported entity or region.
2. Inspect the content, creator, report reason, and relevant edit history.
3. Dismiss the report, hide the content, restrict the account, or restore a region.
4. Record the decision and reason in an audit log.

## World model

### Number of worlds

The MVP has one canonical public world. The data model may include a world ID so additional worlds can be introduced later, but users cannot create worlds in the MVP.

### Coordinates

- World coordinates are integer pixels.
- The initial supported range is `-1,000,000` through `1,000,000` on each axis.
- Chunks are 128×128 pixels and use signed integer coordinates.
- The coordinate range is a configurable abuse-prevention boundary, not a storytelling limit.
- Share links preserve `x`, `y`, and `zoom`; invalid values are clamped.

### Drawing layers

The existing three layers remain:

1. Background
2. Main
3. Overlay

Region policy can allow all layers or restrict selected layers. The server validates the layer for every operation.

### Region types

#### Commons

The default collaborative area. Members may draw and place approved entities. Pixels are shared rather than permanently owned.

#### Gallery

A curated, read-only area. Moderators may promote selected work into it. Ordinary members cannot edit gallery pixels or place entities there.

#### Event

A time-bounded area with a configured start, end, theme, and permissions. Event administration is deferred, but the initial schema should support the region type.

Personal plots and private regions are deferred.

## Pixel rules

- Pixels in Commons regions do not belong permanently to the last editor.
- Each accepted stroke records its creator, affected chunks, timestamp, and operation ID.
- A stroke is the atomic user action for history and rate limiting.
- The server is authoritative and assigns a monotonically increasing chunk version.
- Clients submit the chunk version they edited.
- A stale edit is not silently allowed to overwrite newer state. The client refreshes the affected chunk and asks the user to retry when automatic reconciliation is unsafe.
- The initial MVP does not attempt multi-user undo transformations.
- Personal undo submits a compensating operation and succeeds only when the server confirms it does not overwrite a later conflicting edit.
- Moderators can restore a chunk from retained history regardless of authorship; the restoration is audited.

## Entity rules

- An entity is owned by the member who publishes it.
- Creators can update metadata, reposition within allowed bounds, or delete their own entities.
- Creators cannot modify or delete another member's entity.
- Moderators can hide or remove any entity with a recorded reason.
- Deletion is soft during the retention window so moderation and accidental deletion can be reviewed.
- Entity names and descriptions are plain text; rendered HTML is never accepted.
- Entity behavior comes from a server-controlled allowlist.
- Server-side limits constrain scale, dimensions, and animation cost.

## Identity and attribution

- Browsing is anonymous.
- Publishing requires an authenticated account with a unique immutable ID.
- Public attribution uses a changeable display name; ownership always uses the immutable account ID.
- The MVP does not expose email addresses or login-provider identifiers.
- Suspended accounts retain attribution on existing contributions while losing mutation permissions.

## Product states

Every mutating action shown in the UI must have one of these states:

- Local: accepted by the client but not yet sent
- Syncing: request is in progress
- Synced: server confirmed the authoritative result
- Retry required: temporary failure; local operation remains queued
- Rejected: server refused the operation and the UI explains why

The word “saved” must not be shown for a shared contribution until the server confirms it.

## Accessibility and device baseline

- Exploration and core publishing must work with mouse, touch, and keyboard.
- Icon-only controls require accessible names and visible tooltips.
- Color is not the only indicator of tool or sync state.
- A reduced-motion option disables nonessential glitching, bobbing, and parallax.
- The MVP supports current desktop browsers and usable mobile exploration. Advanced pixel editing may use a simplified mobile interface.

## Success indicators

Initial product indicators are operational rather than growth-driven:

- At least 99% of accepted mutations remain visible after refresh.
- No client displays “synced” for a rejected or uncommitted change.
- A shared location URL opens within one chunk of the intended position.
- A member can identify and manage every entity they own.
- A moderator can hide reported content and identify the responsible account.
- Backup restoration is exercised before public launch.

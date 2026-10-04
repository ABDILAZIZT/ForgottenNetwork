# Shared-world data model

Status: Phase 2 design baseline  
Canonical SQL: `server/migrations/001_shared_world.sql`

## Relationships

```text
users ───────────────┬────────────── entities ───── assets
  │                  │                   │
  ├── idempotency_records                │
  │                  │                   │
  │                  ├──────────── edit_operations
  │                  │                   │
  │                  │            edit_operation_chunks
  │                  │                   │
  │                  │                 chunks
  │                  │                   │
  ├── reports ───────┴─────────────── worlds
  │                                      │
  ├── moderation_audit_events          regions
  │
  └── member_limit_overrides
```

## Transaction boundaries

Authenticated non-pixel mutations reserve an `idempotency_records` row inside their transaction. The record stores a canonical request hash and the completed response. An identical retry receives the stored response; reusing the UUID with a different hash is a conflict. Pixel operations carry the same hash directly on `edit_operations` because the operation is itself the durable idempotency record.

### Apply a pixel operation

One database transaction:

1. Lock every touched chunk in sorted `(chunk_x, chunk_y)` order.
2. Materialize missing chunks as transparent version 0.
3. Confirm all expected versions.
4. Validate region permissions for every change.
5. Compute forward and inverse patches.
6. Update all layer blobs and increment every affected chunk version.
7. Insert the operation and per-chunk history rows.
8. Commit.

Sorted locking avoids deadlocks when simultaneous strokes touch the same chunks in different request order.

### Create an entity

One transaction validates the ready asset, ownership, region, position, active-entity quota, and idempotency before inserting the entity.

### Moderate content

The content/account mutation and immutable audit event commit in one transaction. Neither may succeed alone.

## Encoding boundaries

- Client/API chunks use three deflate-compressed, base64-encoded RGBA layer strings.
- PostgreSQL stores the decoded compressed bytes in three `bytea` columns.
- Each uncompressed layer is exactly `128 × 128 × 4 = 65,536` bytes.
- The API rejects data that decompresses to a different size.
- Edit patches use an internal compact binary encoding in the database; clients send explicit pixel changes for MVP clarity.
- Object storage holds original private uploads, processed public media, and thumbnails. PostgreSQL holds metadata and storage keys, not media bodies.

## Region resolution

Regions may overlap. The matching region with the greatest `priority` controls the coordinate. If priorities tie, the smaller region wins; a remaining tie is a configuration error rejected by administrative tooling.

The seeded Commons region covers the entire initial world. Gallery and Event regions override it through greater priority.

## Deletion model

- Users are anonymized with `deleted_at`; referenced ownership rows remain valid.
- Entities use `deleted_at` and `restore_until`.
- Assets move through status `deleted` and are physically removed only when retention and reference checks allow it.
- Chunks are not soft-deleted; transparent chunks can be compacted after retained edit history expires.
- Reports retain nullable reporter references.
- Moderation audit rows reject update and delete operations.

## Required application invariants

Some rules intentionally remain in transaction-safe application code because ordinary SQL constraints cannot express them clearly:

- Entity and chunk coordinates must remain within their world's configurable coordinate limit.
- An entity asset must be ready and owned or explicitly reusable by the creator.
- Region policy must allow every pixel and entity placement.
- Per-operation and rolling-account quotas must be enforced.
- The sum of `edit_operation_chunks.affected_pixel_count` must equal its parent operation count.
- Pixel indices must be unique per layer inside one operation.
- An undo must not overwrite later conflicting changes.
- Report target visibility and duplicate-report consolidation are policy-aware.

## Index intent

- World/position indexes support viewport reads.
- Creator/time indexes support account contribution screens and quotas.
- Operation world/time and chunk/version indexes support recovery and history.
- Report status/time supports the moderation queue.
- Asset status/expiry supports background cleanup.

Phase 4 must verify index use with representative `EXPLAIN ANALYZE` plans before public launch.

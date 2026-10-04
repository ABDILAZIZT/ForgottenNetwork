# Current persistence model

This document describes the Phase 0 storage behavior. It does not claim that the current prototype is already collaborative.

## Browser storage: active world

The frontend uses IndexedDB database `forgotten-network`, schema version 3.

### `chunks`

Each record has an ID in `cx,cy` form, integer chunk coordinates, a zone label, three 128×128 RGBA byte arrays, and a save timestamp. Dirty chunks are saved after a completed drawing stroke and periodically while the engine is running. Empty chunks are removed.

### `entities`

Each record contains the entity ID, type, world coordinates, creation time, behavior, visual configuration, scale, and an optional asset reference. Entity deletion removes the record from this store.

### `assets`

Uploaded images and GIFs are stored as `Blob` or data-URL values. Entities refer to them with an `asset:<id>` reference.

### Export and import

Export creates a JSON file containing chunks, entities, and assets. Blob assets are converted to data URLs so the export is self-contained.

Import validates the top-level structure and chunk records before clearing anything. A valid import replaces all three local stores. Older exports without an `assets` list remain accepted, although asset-backed entities from those files may not contain their original media.

## Server storage: legacy development API

The Express server stores creatures and structures in `server/db.json`. The active frontend does not fetch or write these endpoints. This file is suitable for local development only and must not be treated as a production shared database.

Environment variables:

- `PORT`: API port, default `3001`
- `CORS_ORIGIN`: comma-separated allowed browser origins
- `DB_PATH`: JSON filename relative to the server directory unless absolute

## Production direction

The future shared-world implementation should make a server database authoritative. IndexedDB should become a cache and offline queue. Media should move to validated object storage, and `db.json` should be retired after migration.

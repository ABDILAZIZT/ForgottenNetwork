# Legacy data migration strategy

Status: Phase 2 design baseline  
Sources: browser IndexedDB export version 3 and `server/db.json`

The two current stores describe different worlds and must not be merged automatically into the public world. Migration is an explicit, auditable import process.

## Principles

1. Preserve original exports before transformation.
2. Never let client-supplied IDs, authors, timestamps, media types, or coordinates bypass validation.
3. Generate deterministic migration IDs so reruns are idempotent.
4. Import into staging tables first.
5. Produce a report before publishing anything.
6. Keep a source reference and checksum on every migrated record.
7. Make the final publish operation transactional and reversible.

## Browser IndexedDB exports

The Phase 0 export contains `version`, `chunks`, `entities`, and `assets`.

### User-controlled preservation

Before shared migration begins, the deployed local-first site should offer a prominent “Export local world” action. Local data cannot be discovered centrally; each user must choose to upload an export.

### Import workflow

1. Upload the JSON file to a private migration endpoint with a strict size limit.
2. Parse and validate the complete document before writing.
3. Record the SHA-256 checksum and reject duplicate submissions.
4. Decode each layer and require exactly 65,536 RGBA bytes.
5. Validate chunk coordinates against the target world's range.
6. Validate entities and resolve every `asset:<id>` reference.
7. Decode media, verify its real type, and process it through the production asset pipeline.
8. Show a preview containing chunk bounds, pixel count, entities, rejected media, and collisions.
9. Require an explicit import choice.

### MVP import choice

Automatic merging into Commons is not included in the shared-world MVP because it could overwrite public work. Phase 4 preserves uploaded local worlds as private migration archives. A later moderated import tool may publish them into an empty reserved region or convert them into a new entity collection.

## `server/db.json`

The legacy file contains creature and structure rows with embedded data-URL sprites and untrusted author strings.

### Transformation

- Create one disabled system migration account named `Legacy Import`.
- Map `creatures` to `creature` or `uploaded_custom` entities.
- Map `structures` to `structure` entities.
- Preserve legacy `name` and `description` after text normalization and length limits.
- Store the original author string in private migration metadata, not as authenticated ownership.
- Round positions to integer pixels and reject out-of-range values.
- Decode each data URL, hash it, deduplicate identical media, and send it through asset processing.
- Convert valid timestamps to UTC; otherwise use the migration time and record a warning.
- Map legacy scale fields into the supported 0.20–10.00 range.
- Mark every resulting edit/entity operation as `legacy_import`.

### Publication

Import into a staging schema first. Generate a report with totals, duplicates, invalid rows, sanitized fields, and expected world bounds. A moderator or administrator approves publication into a reserved Gallery region so legacy content does not overwrite Commons contributions.

## Staging tables

Phase 4 should create temporary or dedicated migration tables containing:

- Migration run ID and status
- Source kind and checksum
- Original record key
- Normalized candidate payload
- Validation status and warnings
- Resulting asset/entity/operation IDs
- Created and approved timestamps
- Approving administrator

Staging rows must not be returned from public APIs.

## Idempotency

Derive deterministic UUIDs from a stable namespace plus:

```text
source checksum + source collection + original record key
```

The same source can then be retried safely. A different file with reused legacy IDs cannot collide silently.

## Rollback

Every published migration has one migration-run ID attached to its created entities, assets, and operations. Rollback soft-deletes published entities, hides migrated chunks or restores their pre-import versions, and schedules unreferenced assets for cleanup. Rollback itself creates an administrator audit event.

## Migration acceptance checks

- Original source checksum and file are preserved privately.
- A dry run changes no public state.
- Rerunning a source creates no duplicates.
- No embedded data URL remains in PostgreSQL entity rows.
- Every public migrated entity has a processed ready asset.
- Invalid media cannot prevent valid rows from being reported.
- Published bounds do not overlap an unapproved Commons area.
- Rollback is tested in staging before production publication.

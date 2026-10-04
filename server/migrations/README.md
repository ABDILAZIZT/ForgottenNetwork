# Database migrations

`001_shared_world.sql` contains the canonical shared-world schema. `002_runtime_support.sql` adds the repository bridge and database-backed sessions used by the active Phase 5 API.

Run all pending migrations with `pnpm --dir server migrate`, or set `MIGRATE_ON_START=true` for a single-instance development environment. Production deployments should normally run the command once as a release step before starting new application instances. Applied migration checksums are immutable.

The initial migration creates one canonical world and one Commons region covering the configured launch coordinate range.

# World repository architecture

Status: Phase 4 HTTP adapter implemented  
Last updated: 2026-09-08

## Purpose

The canvas engine and React interface use a single `WorldRepository` contract for all persistent world data. They do not depend on IndexedDB, HTTP, database tables, or transport details.

```text
React UI + Canvas engine
          |
    WorldRepository
       /       \
local adapter   remote adapter
       |             |
   IndexedDB     Phase 4 gateway
```

This boundary lets the current single-browser experience remain usable while the server-authoritative shared world is built behind the same interface.

## Current runtime

`LocalWorldRepository` is the active adapter. It delegates reads to the existing IndexedDB driver and serializes mutations through an in-memory write queue. The visible repository status has three states:

- `saving`: one or more mutations are waiting or running
- `saved`: all queued mutations completed
- `error`: at least one mutation failed and the caller must retry

World export waits for queued writes before reading the stores. World import is also serialized so it cannot overlap another repository mutation.

The queue protects ordering during the current browser session. It is not yet a durable offline retry queue; persisting unsent server operations is part of the Phase 4 HTTP integration.

## Remote adapter

`RemoteWorldRepository` is selected when `VITE_WORLD_MODE=remote`. It uses `HttpWorldGateway`, persists mutations before transmission, and exposes syncing, synced, retry, rejected, and conflict status without putting URLs or `fetch` calls inside the engine.

Failed network operations remain in IndexedDB until the server confirms them. Version conflicts remain queued until the user deliberately chooses server state; rejected invalid operations are removed and remain visibly rejected.

## Data covered by the contract

- Load, save, and delete chunks
- Load, save, and delete entities
- Load and save uploaded assets
- Full-world import and export
- Queue flushing and observable persistence status

The raw IndexedDB functions remain in `client/src/engine/db.ts` as the local adapter's storage driver. No UI component or engine class imports those functions directly.

## Minimap boundary

The minimap now receives compact chunk summaries plus camera coordinates. It no longer receives the engine's mutable chunk map. Chunk summaries refresh only when the engine's chunk revision changes; the viewport refreshes four times per second. This avoids cloning the full chunk map ten times per second while preserving navigation behavior.

## Phase 4 handoff

Before switching to remote mode:

1. Implement the authenticated HTTP gateway against `docs/API_CONTRACT.md`.
2. Store queued mutations and idempotency keys durably in IndexedDB.
3. Add retry and rejected states to the repository status contract.
4. Reconcile server versions without overwriting newer chunks.
5. Run two-browser persistence and authorization tests.

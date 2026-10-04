# Phase 0 baseline

## Supported prototype workflows

- Pan, zoom, and teleport around the canvas
- Draw, erase, flood-fill, and pick colors
- Select one of three drawing layers
- Undo completed drawing strokes
- Upload and place static images or animated GIFs
- Scale and remove placed media
- Persist local chunks, entities, and assets in IndexedDB
- Export and replace the complete local world using JSON
- Inspect loaded chunks using the minimap

## Known architectural boundary

The browser world and Express `db.json` API are separate. Deploying this version gives each browser its own world; it does not create a shared or real-time world.

## Experimental, disconnected components

- `client/src/components/PixelEditor.tsx`
- `client/src/components/EntityCreatorModal.tsx`

They are preserved for a later creation-workflow milestone and are not presented as active features.

## Quality gate

Run `pnpm check` before a release. It includes formatting, linting, unit/API tests, TypeScript compilation, and a Vite production build.

## Phase 0 performance method

The baseline is measured in a desktop browser at the default camera position after the initial chunks load. Record a 120-frame `requestAnimationFrame` sample, production bundle sizes, and any console errors. Hardware and viewport affect frame results, so future comparisons should reuse the same machine and viewport.

### Recorded baseline — 2026-09-08

| Measurement            |                    Result |
| ---------------------- | ------------------------: |
| Browser viewport       |                  1280×720 |
| Loaded chunks          |                       143 |
| Loaded entities        |                         2 |
| Smoothed frame time    |                   6.05 ms |
| Reported render rate   |                 165.2 FPS |
| Browser console errors |                         0 |
| Production JavaScript  | 208.39 kB / 66.12 kB gzip |
| Production CSS         |    9.82 kB / 2.60 kB gzip |

The browser already contained local IndexedDB state, so the entity count is not a clean-profile fixture. The unusually high reported frame rate reflects the in-app browser's scheduling environment and should be used only as a comparison point on this same host.

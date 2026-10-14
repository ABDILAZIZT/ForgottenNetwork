# Unified studio — October 2026

The only mounted application is `PermanentWorld`. Old `?mode=classic` bookmarks resolve to the same studio, retaining coordinates. The obsolete `App.tsx`, `WorldOverlay.tsx` and Classic onboarding were removed. Storage adapters, API endpoints, ownership migrations, entity renderer and queued writes are retained for compatibility. No production data migration or automatic publication is performed.

The unreferenced legacy `PixelEditor.tsx` and `EntityCreatorModal.tsx` components were removed. Their unfinished workflows are superseded by the active `RasterStudio` and saved-entity tools; no application callers or public routes depended on them.

## Feature destinations

| Previous feature                                  | Current destination                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brush, spray, eraser, fill, pipette               | Main brush styles and eyedropper; Studio for pixel erasure and tolerance fill; published eraser removes an owned element after confirmation             |
| Three raster layers                               | Studio supports up to eight temporary layers, with visibility, lock, opacity and ordering; saving flattens them                                         |
| Media positioning, size, PNG/GIF upload           | Main media tool and Studio pre-placement preview; GIF placement remains animated, with aspect-preserving width and rotation controls                    |
| World export/import                               | Tools & saved worlds; same repository and IndexedDB database; exports read saved records, excluding pending writes                                      |
| Existing tile revisions/deletion                  | Saved tile browser; remote owner/version checks remain authoritative; local edits flatten the selected tile only                                        |
| Media and procedural residents                    | Saved media selector and animated preview, position/size update, record export, creation and deletion; original layer/frame/effect fields are preserved |
| OIDC / artist session bridge                      | Saved-world sign-in in Tools; modern artist identity remains in Profile                                                                                 |
| Community and moderator review                    | Saved-world community panel; modern reports/chat remain in the main interface                                                                           |
| Demo memberships, rewards and ads                 | Tools & saved worlds; existing storage keys retained; core tools/palettes now free                                                                      |
| Beacons, local territory markers, density overlay | World unlocks; territory markers explicitly grant no shared ownership                                                                                   |
| Palette packs                                     | Free palette selector under HEX / RGB / HSV; original purchase records retained                                                                         |
| Minimap, navigation, share links, undo            | Existing main map/navigation and draft undo; Studio has stroke/adjustment undo                                                                          |
| Existing failed queued writes                     | Tools shows repository status with explicit retry/discard controls; opening the panel does not discard data                                             |

## Editing model

Main strokes preserve vector-like placement records. An owner may overlay their own cells. In the artwork inspector, **Edit / transform** opens one selected artwork in a local 512px raster workspace. Its aspect ratio is preserved on output; the preview shades cropped margins. Move/scale/rotate controls transform the selection; world coordinates and width change the placement. Updating published art uses the versioned atomic edit endpoint documented in `PERMANENT_CANVAS.md`. Repeating an unchanged save after a network error reuses the uploaded asset and replacement UUID.

New Studio output is always staged as an unpublished draft, even when the normal stroke mode is immediate publishing. Opening/restoring a draft never publishes it. Images can be framed, scaled and rotated before staging. New avatars are cropped to a square and stored at 256px; old avatars are not silently replaced or upscaled.

Flood fill, lasso, marquee, color adjustments and layer transformations work inside the raster workspace, not as destructive operations over arbitrary shared-world regions. Global ownership remains enforced by the server. The editor does not flatten other artists' visible artwork into an editable shared layer.

## Explicit limitations

- Saved-world and modern formats remain separate storage models behind one interface. Archived animated residents are previewed/managed in Tools, not automatically drawn onto the shared ownership canvas. A seamless combined historical world view has not been implemented; do not describe this as complete feature parity with the former full-screen renderer.
- Raster revisions flatten layers/text/strokes into a PNG. Editing an animated artwork explicitly uses a still frame; original GIFs remain in history. GIF placement supports rotation/size preview while retaining animation; frame-by-frame animated cropping/editing is not implemented.
- Studio has no persistent layered project format or editor autosave. Save a draft/download before closing; closing warns. Undo covers raster strokes, fills, transforms and adjustments, not structural layer changes. Shared-cell ownership conservatively reserves image/outline bounding cells, including transparent pixels.
- Saved tile editing flattens three layers. Local browser records have no server recovery history; export before editing/importing/deleting. Remote ambiguous/multi-owner legacy chunks remain locked under the existing ownership rules.
- OIDC requires operator configuration. Browser QA exercised the artist session bridge locally, not a production identity-provider login. Production archive data, uploads, identities and draft queues were not modified during QA.
- This release adds no third-party moderation dependency. Existing text filtering/reporting limitations and legal/operator configuration remain in `TRUST_AND_SAFETY.md`. Image content is not automatically safety-scanned.
- The Render blueprint does not prove durable SQLite storage. Actual service volume configuration and backups require operator verification. A successful GitHub push is not evidence of a completed live deployment.

## Verification

The final regression run passed the full `pnpm check`: shared **3**, client **51**, and server **50** tests, repository formatting and lint, TypeScript checks, and the production Vite build. Coverage includes pixel size reaching the renderer, draft-only staging, shape settings, flood-fill tolerance/selection masks, transformed handle coordinates, owner-only atomic edit, foreign direct HTTP edit/delete rejection, conflict rollback and idempotent retries (including superseded receipt rejection).

Local browser QA used a disposable server and in-memory canvas: artist creation, drawing, marquee, numeric move/rotation preview, save as draft, reload restoring mode/draft count, light theme, phone-width navigation, saved-world identity bridge, and an actual JSON download. Browser testing is exploratory, not proof of zero regressions or exhaustive accessibility compliance.

# Reported toolbar, stamp, discovery and atmosphere issues

Baseline: fetched and fast-forwarded `origin/main` to `df187ec` before editing. The newer baseline already batches pointer cosmetics, pauses hidden-tab animation and removes the old whole-canvas brightness filter. Earlier explanations based on the older checkout are not a measured diagnosis of this baseline.

## Changes

- The identity-scoped **Draft before publishing** preference is now a single header checkbox next to the theme switch. **Publish** remains a separate action. Tool menus no longer repeat the global preference; saving/restoring it never publishes queued drafts.
- The left dock allocates the settings column only while a settings panel exists. With settings closed, its scrollbar follows the icon rail instead of an empty reserved 280px track.
- Avatar Stamp always selects the tool and opens its settings. Without an avatar, the settings offer an explicit upload/crop action; after saving, the tool immediately uses the new avatar. Existing avatars have a visible preview and placement instructions.
- Discovery excludes the current area, the origin and the last 12 destinations, preferring distant artwork when available and generating new positions otherwise. It uses the current engine view, including rapid successive clicks. Find free space remains a separate operation.
- Weather uses one DPR-1 canvas, capped at 30fps, instead of 28 animated HTML particles with shadows. Particle glow is rendered into a reusable sprite once. Visibility and reduced-motion controls still stop weather animation; day/night and CRT overlays remain static.
- Published artwork is composited into a viewport bitmap. Static scenes reuse it between changes; camera movement, additions/removals/restores, asset readiness and theme changes invalidate it. Animation is refreshed at up to 30fps. A five-second static refresh permits retrying unavailable images. Drawing and camera movement retain the main renderer's 60fps target; idle canvas painting is capped at 30fps. These are scheduling targets, not guaranteed measured FPS on every device.

## Verification

- `pnpm lint`: passed.
- `pnpm test`: shared 3, client 94, server 62; all passed. After adding the session/moderation cache-invalidation regression, the client suite was rerun with 95 passing tests (160 passing tests across the suites).
- `pnpm build`: TypeScript and Vite passed.
- A cache regression with 500 static artworks across 120 frames performed 500 artwork rasterizations instead of 60,000. Asset readiness, scene changes and camera changes force a redraw. Identity changes and moderator media resets immediately invalidate cached viewport pixels. A separate test verifies animated scenes continue advancing. This measures avoided draw calls, not an end-user FPS percentage.
- Discovery regression runs 20 successive discoveries with a fixed random source and rejects the origin/recent locations, alongside world-boundary tests.
- Disposable local browser QA: one draft checkbox; avatar upload/crop/save then stamp placement creates an unpublished draft; collapsed dock client/scroll width both 54px; four successive discoveries produce different distant URLs; combined weather/day-night/CRT has one weather canvas and zero weather `<i>` elements; no captured browser console errors.

No production artwork, identity or draft data was changed during testing. No server/storage migration or new dependency is required. Actual improvement on the reported PC still depends on hardware, viewport and scene complexity; this run does not claim a hardware GPU trace or universal smoothness guarantee.

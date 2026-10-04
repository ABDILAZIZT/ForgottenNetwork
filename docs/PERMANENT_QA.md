# Permanent Canvas Verification

Verified locally on September 30, 2026 with Node 24.15 and headless Microsoft Edge.

## Automated Checks

`pnpm check` passes formatting, ESLint, server syntax checks, shared/client TypeScript, the production build, and 75 tests: 3 shared, 36 client, and 36 server tests. Existing Classic Studio tests remain passing.

## Browser Checks

- Two isolated artist sessions registered, reconnected, and retained their identities after backend restart.
- In-progress strokes appeared in the second canvas before pointer release; previews cleared after commit.
- Identical competing rectangle placements rejected the second artist with the first artist's name. Shapes, arrows, text, and stickers produced separate saved records.
- Uploaded PNGs, 32px avatar conversion, and avatar stamps saved correctly. A two-frame GIF alternated between its two expected RGB colors in canvas pixel samples.
- Drafts survived page reload and could be erased without touching published artwork.
- A simulated failed placement stayed in local storage across reload, then replayed successfully when the connection was restored.
- Chat reached the other session. Reactions produced live notifications and persisted counts.
- PNG export generated a readable 1600x1067 snapshot in the tested desktop viewport.
- Mobile pinch zoom changed zoom from 90% to approximately 155% without placing accidental artwork; a subsequent tap placed exactly one mark.
- Desktop 1440x960 and mobile 390x844/320x740 layouts were inspected. No horizontal document overflow or uncaught page exceptions were observed.
- Canvas pixel checks confirmed nonblank rendered artwork. Frame timing was sampled locally, but this is not a production-scale performance guarantee.

All destructive/concurrent browser experiments used an isolated test database, not the user's permanent canvas. SQLite reopen and live-backup tests verify that accepted artwork, media bytes, credentials, reactions, chat, and cell protections survive recovery.

## Remaining Deployment Work

No public deployment was performed. Configure durable hosting, independent backups, monitoring, account abuse controls, and an appropriate public-content response policy before launch. SQLite is configured for a single server instance; large concurrent-user loads and distributed deployment remain unverified. See [the operations guide](PERMANENT_CANVAS.md).

# Product polish and localization

> **Current behavior (2026-10-15):** The interface is English-only. Main-canvas uploads are private drafts, previewable only by their owner. Publishing artwork or an avatar makes the referenced upload public after ownership and placement checks. Legacy pending uploads follow this same owner publication flow; hidden or rejected media stays blocked. Reports, automatic holds, and moderator removal remain active. Classic remote uploads still require advance review. Earlier descriptions of mandatory review for every permanent-canvas upload or the language switch below are historical.

This note covers the creative-polish and localization suggestions in the supplied master prompt. Most of its optional polish suggestions were already present in the project; this work adds a persistent English/Arabic interface choice and documents its current boundaries.

## Existing polish

- The first-mark tutorial and Expedition controls support discovery, local exploration badges, and coordinate sharing.
- The permanent canvas has earned profile achievements, optional generated sound effects, a sound toggle, and a dark/light theme control.
- The interface includes touch-aware canvas input, mobile layout breakpoints, optional haptics, and reduced-motion handling.
- The app has a web manifest, offline shell service worker, search/social metadata, loading states, and a React error boundary.

These controls and features remain local or browser-dependent where described in the relevant product and safety documentation. The optional sound uses generated tones; there is no bundled background-music track.

## English and Arabic interface choice

- The canvas header, first-mark welcome flow, selected canvas settings, Expedition launch/offline/tutorial/share labels, ad-choice notice, and policy navigation include English and Arabic strings.
- The choice is stored as `fn_interface_locale`. It updates the document `lang` and `dir`, uses right-to-left flow for the Arabic canvas, adjusts the page title and search/social descriptions, and formats the welcome counters for the selected language.
- Policy body text stays explicitly marked and laid out as English, with a notice when Arabic is selected. The drawing-tool catalog, store, artwork editor, moderation flows, and most other panels are not translated yet.
- No translation service or new runtime dependency was added. To extend coverage, add both language values to `client/src/locale.ts` and use `LocaleControl` where users should be able to change the interface language.

## Verification limits

`pnpm check` passed on 15 October 2026: formatting, lint, all 118 tests (3 shared, 64 client, 51 server), both TypeScript checks, and the production build. Automated locale tests cover supported language values, translated strings and interpolation, persistence, document direction, and metadata updates. Production browser layout review was not completed in this run because the desktop computer-use tool stopped when it could not verify the active browser URL. The earlier browser check predates these changes; see [launch readiness](LAUNCH_READINESS.md) for the manual QA limitations.

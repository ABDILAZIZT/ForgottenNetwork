# Phase 4: safety and accessibility

Updated 14 October 2026.

## Content controls

- The shared public-text filter now folds Arabic diacritics, tatweel and common alef/ya forms, alongside English full-width, zero-width and selected leetspeak variants. It blocks a limited English/Arabic list at the server boundary and permanent storage boundary. This is a blocklist, not semantic or comprehensive moderation.
- Permanent-canvas and Classic PostgreSQL image/GIF uploads remain private until a moderator approves them. Permanent media held for review cannot be placed or used as an avatar; Classic media cannot be referenced by a published entity until approved. Existing stored media enters the review queue during the one-time safety migration.
- Review previews require moderator authentication, return `no-store`, and use a restrictive response CSP and `nosniff`. Approval, rejection, hide, dismiss and report actions retain an audit record.
- Three distinct authenticated reporters with open reports create a temporary hold on eligible artwork and chat/media in the permanent canvas and contributions in Classic PostgreSQL. The hold clears when moderators resolve or dismiss enough reports to go below three; permanent artwork restoration still checks for occupied cells. Profile reports remain operator-reviewed.

## Accessibility changes and limits

- Ordinary interface text can now be selected and copied; selection suppression is scoped to the interactive canvas.
- The canvas keeps its keyboard panning/zoom instructions and the profile text list of a user's own artwork. Review images include alt text, status updates use live regions, and existing visible focus outlines and reduced-motion behavior remain in place.
- Representative color samples exceed 4.5:1: the dim text tokens `#94a3b8` and `#91a5b8` measure 7.96:1 and 8.05:1 on `#02050a`, and 7.11:1 and 7.18:1 on `#101522`; policy links, focus cyan and white controls measure above 12:1 on their sampled dark surfaces. A complete contrast audit must still include translucent/overlaid surfaces. This source review and sampling do not certify WCAG 2.2 AA. A complete keyboard, screen-reader, zoom/reflow and focus-order audit on supported browsers is still required.

## Operational limits

- No visual classifier or third-party scan is configured. A moderator must view each pending upload; if no moderator is configured or staffed, uploads remain pending. Review can miss unsafe content.
- Existing canvas strokes, shapes and composites are not automatically screened. Reports and a three-reporter hold are triage mechanisms and can be abused; they are not a safety finding. Profile reports need operator action.
- Child-safety, response time, appeals, legal contact and retention operations remain owner responsibilities. Do not advertise guaranteed safety or compliance.

## Verification

The complete `pnpm check` passed on 14 October 2026: 115 tests (3 shared, 61 client, 51 server), formatting, lint, both TypeScript checks and production build. The browser smoke remains outstanding because the Windows browser helper halted before reloading the local preview when it could not verify the active URL; see `docs/LAUNCH_READINESS.md`.

# Phase 3: economy, challenges, and Creator Collection

Updated 14 October 2026.

## Economy changes

- The seven-day login schedule is now 40, 45, 50, 45, 55, 60, and 100 local demo gems. VIP doubles the existing login reward.
- Each first visit to a 512×512 neighborhood per local day adds 2–5 local demo gems.
- Three date-seeded challenges rotate their thresholds daily: draw 50/100/200 pixels, visit 10/20/30 neighborhoods, and place 3/5/8 creations. Each task rewards 30–50 gems and can be collected once per day.
- Challenges, exploration rewards, login gems, subscriptions, purchases, and ad rewards remain in browser storage. They are not account-backed, authoritative, tamper-resistant, or cash-equivalent.
- Both the main gem demo and Creator Collection have a separate 75-unit free allowance once per 24 hours. Creator Collection's wallet caps at 1,500 coins. The wallets intentionally remain separate because the Creator Collection is a Studio-only local demo.

## Creator Collection

The collection contains 18 entries under four filters: Brushes, Land, Creatures, and Cosmetics. Its pocket Studio includes the new five-design creature stamp pack and individually unlockable Sunset, Forest, and Ocean palettes. A repeatable Waypoint Marker uses the current canvas position and creates a local bookmark visible in World Extras. Expanded Canvas Area remains visibly marked as a server-dependent preview and cannot be bought.

Collection purchases show a confirmation and are recorded in the device's recent activity history. Cash checkout is not connected. Planned price labels and bundles are disabled previews with no payment processing. The Creator Collection balance is separate from the gem shop and from rewarded-ad gems.

## Verification

`client/src/challenges.test.ts` covers deterministic daily selection, daily resets, unique exploration progress, one-time claims, and invalid progress. Economy and market tests cover bounded exploration rewards, the 18-item taxonomy, reduced daily allowances, local waypoint purchase/persistence, purchase history, and unsupported previews. The full `pnpm check` remains the project validation command.

Validation on 14 October 2026: `pnpm check` passed (115 tests: 3 shared, 61 client, 51 server), formatting, lint, both TypeScript checks and the production build. The Phase 3 Windows browser smoke remains unverified because the computer-use helper stopped before reload when it could not confirm the active URL; see `docs/LAUNCH_READINESS.md`.

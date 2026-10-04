# Forgotten Network — Complete Setup, Monetization & Deployment Guide

# دليل الإعداد الكامل والنشر وتحقيق الدخل

Updated 4 October 2026. This guide describes this delivery; older phase reports remain as historical records.

The project runs locally. Advertising and card payments are intentionally previews. No accounts, paid resources, domain purchases or deployments were created. Expanded Canvas Area and Priority Rendering are catalog previews, not purchasable entitlements. This delivery does not certify public-launch readiness, WCAG conformance or Google approval.

**العربية:** المشروع يعمل محلياً. الإعلانات والدفع الحقيقي يحتاجان إعداداً منفصلاً. لا توجد رسوم أو خدمات مدفوعة تم تفعيلها.

## Contents

1. Prerequisites & Local Setup
2. Running the Project Locally
3. Adding Google AdSense Ads
4. Setting Up Payments (Stripe)
5. Deploying to Render.com
6. Deploying to Vercel (Alternative)
7. Custom Domain Setup
8. Google Search Console Registration
9. Analytics Setup (Google Analytics)
10. Maintenance & Updates
11. Troubleshooting
12. Summary of All Changes Made

## 1. Prerequisites & Local Setup

## المتطلبات والإعداد المحلي

Install [Node.js](https://nodejs.org/) (tested with Node 24.19; project minimum 22.13), pnpm 11.19.0 and optionally [Git](https://git-scm.com/). Extract the archive to a short local path. In PowerShell:

```powershell
node --version
npm install -g pnpm@11.19.0
cd "C:\path\to\ForgottenNetwork"
pnpm install --frozen-lockfile
```

The archive preserves project files, generated builds and installed dependency files. pnpm uses links and platform-specific binaries: always run the install command after extraction, especially on another operating system. Dependency links may not be reconstructed by every ZIP extractor. If pnpm reports an incompatible existing modules directory, move only the extracted `node_modules` directories aside, then reinstall from the included lockfile. Keep the original project and lockfile intact.

**العربية:** فك الضغط، افتح PowerShell داخل مجلد ForgottenNetwork، ثم نفّذ أمر التثبيت. لا تحذف ملف القفل pnpm-lock.yaml.

## 2. Running the Project Locally

## تشغيل المشروع محلياً

```powershell
pnpm start
```

Open [localhost:5173](http://localhost:5173/). The backend is on port 3001. Press Ctrl+C in the terminal to stop both services. `/` opens the permanent multiplayer canvas; `/?mode=classic` opens the original Classic experience. Classic defaults to local browser persistence. The permanent canvas requires the backend even during local development.

```powershell
pnpm build
pnpm lint
pnpm test
```

Open **Expedition → market** for the Creator Collection. Add free demo coins, choose a tool, confirm the purchase, then open Studio. Export the drawing as PNG and place it with the existing Image / GIF or Upload tool. **Expedition → atmosphere** enables purchased cosmetic effects, weather, CRT and haptics. Classic's original gem wallet remains separate from Studio demo coins to preserve existing purchases.

No environment file is needed for the default local experience. Root `.env.example` is a reference, not an automatically loaded configuration: `node server/index.js` does not load root `.env`. Set PowerShell variables explicitly or use `node --env-file=.env server/index.js` for a deliberately prepared backend configuration. Vite reads frontend variables from `client/.env.local`; never put secrets in `VITE_*` variables. Do not blindly enable the example `DATABASE_URL` or production OIDC placeholders locally.

For a local production-build/PWA check, stop `pnpm start`, then run:

```powershell
pnpm build
$env:SERVE_FRONTEND = 'true'
node server/index.js
```

Open [localhost:3001](http://localhost:3001/), visit once online, wait for service-worker installation, close/reopen the tab, then test offline in browser developer tools. Only the app shell is cached; live artwork, identity APIs and uploads are not. Development Vite intentionally does not register the worker. Production requires HTTPS. The PWA manifest and icons support installation; browser installation UI varies. A website/PWA is not automatically a Chrome Web Store extension. See [PWA installation](https://web.dev/learn/pwa/installation).

**العربية:** افتح Expedition لتجربة المتجر والمؤثرات. العملات تجريبية ومحفوظة على جهازك فقط. وضع العمل دون اتصال يحفظ واجهة التطبيق، وليس العالم المباشر.

## 3. Adding Google AdSense Ads

## إضافة إعلانات جوجل أدسنس

1. Publish useful original content and provide your privacy, contact and content policies. User-generated artwork needs a working moderation/takedown process before monetization.
2. Apply through [Google AdSense](https://adsense.google.com/), add the site and follow its ownership/review instructions. Approval and timing are not guaranteed.
3. Use only your issued publisher ID and approved ad units. Add Google's supplied loader to `client/index.html` inside `<head>` after implementing the consent requirements applicable to your audience:

```html
<script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ID"
  crossorigin="anonymous"
></script>
```

4. Search for `AD_SLOT_PLACEHOLDER` in `client/src/components/AdSlot.tsx`. Replace its preview content with an approved unit. In React, initialize the unit in an effect once per mounted `<ins>` after the loader is ready; a script string inserted into JSX does not initialize it. Guard against StrictMode double initialization, and handle blocked/unavailable ads without blocking the canvas. Example markup (replace IDs):

```tsx
<ins
  className="adsbygoogle"
  style={{ display: 'block', width: 300, height: 250 }}
  data-ad-client="ca-pub-YOUR_ID"
  data-ad-slot="YOUR_UNIT_ID"
/>
```

The corresponding browser initialization is `(window.adsbygoogle = window.adsbygoogle || []).push({})`; declare its TypeScript window type when integrating. Run it only on the intended uninitialized unit, not on every render.

| Slot                 | File using AdSlot                          | Intended size         |
| -------------------- | ------------------------------------------ | --------------------- |
| `classic-shop`       | `client/src/components/ShopModal.tsx`      | 320×50 mobile banner  |
| `classic-community`  | `client/src/components/CommunityPanel.tsx` | 300×250 rectangle     |
| `expedition-sponsor` | `client/src/components/Expedition.tsx`     | 320×50 journey footer |

The reusable component also supports a 728×90 leaderboard. Use it only in a container wide enough; never shrink a real ad through CSS transforms. Placements are inside voluntarily opened panels, away from drawing gestures. Classic VIP suppresses its shop/community placeholders. No automatic interstitial or canvas-obscuring ad is enabled. Verify your network permits the final panel placement before activating it. If it does not, move that unit to an approved dedicated page.

5. Create `client/public/ads.txt` with the exact record from your publisher account, for example:

```text
google.com, pub-YOUR_ID, DIRECT, f08c47fec0942fa0
```

Rebuild/deploy and check `/ads.txt` returns plain text, not the SPA HTML.

6. Update the explicit CSP in `server/security.js` for your provider's documented script, frame, image and connection origins. The current restrictive CSP intentionally blocks third-party ad code. Use a staging CSP report-only trial before enabling the minimal required allowlist; do not replace it with wildcards. Add an appropriate consent platform and test refusal as well as acceptance.

`AdBannerModal.tsx` remains a **demo sponsor** timer granting demo gems. It pauses while the tab is hidden. Ordinary AdSense impressions/clicks must not be rewarded. Real rewarded ads require a supported web rewarded format, user opt-in, SDK completion and server-verified/idempotent rewards. Do not connect the timer directly to real currency. Review [Google placement policies](https://support.google.com/adsense/answer/1346295?hl=en) and [rewarded ad policies](https://support.google.com/adsense/answer/9121589?hl=en).

Alternatives to investigate are [Media.net](https://www.media.net/), [Carbon Ads](https://www.carbonads.net/) and [BuySellAds](https://www.buysellads.com/). Eligibility, inventory and formats vary. Measure viewability, retention and load performance, reserve space to avoid layout shifts, and prefer fewer well-placed units. Do not click your own live ads or add arrows, fake rewards, pulsing attention cues or misleading controls around them.

**العربية:** سجّل موقعك في أدسنس واستبدل الأرقام بأرقام حسابك. الإعلانات الحالية نماذج فقط. لا تربط مكافآت العملات بالنقر على إعلان عادي، ولا تفعّل الإعلانات قبل معالجة الموافقة والخصوصية والمحتوى.

## 4. Setting Up Payments (Stripe)

## إعداد الدفع باستخدام سترايب

The requested simulated purchase flow is implemented. Card buttons and cash bundles remain disabled. Local storage balances can be edited by users and are not a payment ledger.

1. Create/verify a [Stripe](https://stripe.com/) account supported for your business. Start in test mode. Create server-owned Products/Prices matching the catalog.
2. For hosted Checkout, install the server SDK when you implement payment support:

```powershell
pnpm --dir server add stripe
```

Hosted redirects do not require a client SDK. If you choose embedded Stripe UI, also install `@stripe/stripe-js` in `client` and use its official integration.

3. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `APP_ORIGIN` in the backend secret environment. Only a publishable key, if needed, may use `VITE_STRIPE_PUBLISHABLE_KEY` in the frontend. Do not commit secrets. Load local environment variables as explained in section 2.
4. Add an authenticated checkout endpoint after existing session/identity middleware. Accept an internal product ID, map it to a Stripe Price on the server and fix quantity there. Never accept a browser-supplied price, amount, account ID or entitlement. Apply origin protection and rate limits. Use a server-recorded order ID as the Stripe idempotency key and bind the order to the authenticated account.
5. Redirect to the returned Checkout URL. Use a real return route such as `APP_ORIGIN + '/?checkout=return&session_id={CHECKOUT_SESSION_ID}'`; build that return UI instead of assuming `/success` or `/shop` exists.
6. Add a webhook using `express.raw({type:'application/json'})` **before** the global JSON parser. Verify the Stripe signature. Give only this signed webhook the necessary exemption from browser-origin checks. In a database transaction, verify payment status and catalog contents, enforce a unique Checkout Session/order key, then grant the account's purchased entitlement exactly once. Handle delayed payment success, refunds and disputes. A success URL alone must never grant coins. Follow [Stripe fulfillment guidance](https://docs.stripe.com/checkout/fulfillment).
7. Test duplicate/concurrent deliveries, failed signatures, cancellations, delayed success and account switching. Only enable cash buttons after server-owned balances/entitlements and receipt/refund support exist.

The Starter/Creator/Ultimate planned prices are $7.99/$14.99/$19.99. Coin packs are 100/$0.99, 500/$3.99, 1000/$6.99 and 5000/$24.99. The 5000 pack has the lowest proposed unit price. The prompt's discount and bonus percentages did not consistently follow those prices, so unsupported savings claims, fabricated popularity and artificial countdowns were omitted. Purchase notifications reflect the current user's actual demo purchase.

**العربية:** الدفع الحقيقي غير مفعّل. خزّن الأرصدة والمشتريات في الخادم، وتحقق من إشعار Stripe الموقّع قبل منح المشتريات. لا تستخدم بيانات المتصفح كدليل دفع.

## 5. Deploying to Render.com

## النشر على Render.com

The included `render.yaml` describes a Node web service, PostgreSQL and a persistent SQLite disk. Review current plans and charges before applying it. The application serves `client/dist` in production and needs a long-running server for WebSockets.

1. Review `.gitignore`; keep credentials, private databases and installed dependencies out of Git. Initialize Git only if this is not already your repository:

```powershell
git init
git branch -M main
git add .
git diff --cached --stat
git commit -m "Prepare Forgotten Network"
git remote add origin https://github.com/YOUR_ACCOUNT/forgotten-network.git
git push -u origin main
```

2. In Render create a Blueprint from the repository and review `render.yaml`. Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm run build`. Pre-deploy: `node server/migrate.js`. Start: `node server/index.js`.
3. Supply real `APP_ORIGIN` and `CORS_ORIGIN` (the same HTTPS origin without a trailing slash), PostgreSQL connection, long random `SESSION_SECRET`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. Register `/api/v1/auth/callback` at your identity provider. Production authentication intentionally fails closed if configuration is incomplete. Do not set development bearer tokens in production.
4. Keep `PERMANENT_DB_PATH=/var/data/permanent.sqlite` on the mounted disk. Only that mounted path persists. This SQLite service must remain a single instance; do not horizontally scale it. Render disks are not available in build/pre-deploy stages. See [persistent disk documentation](https://render.com/docs/disks).
5. Check `/api/v1/health/ready`, permanent-canvas loading, live WebSockets and two browser identities. Follow the existing `docs/LAUNCH_READINESS.md` for operator roles, PostgreSQL moderation and backup rehearsals. Those Classic moderation endpoints do not automatically moderate immutable permanent-canvas records.

**Public-launch gap:** permanent artwork is protected by database immutability triggers. A separately designed, audited visibility/takedown mechanism is still needed for this mode before opening unrestricted uploads and advertising. This enhancement preserved those existing guarantees instead of silently removing them.

**العربية:** راجع التكلفة قبل إنشاء خدمات Render. استخدم قرصاً دائماً لقاعدة SQLite، واضبط تسجيل الدخول والنسخ الاحتياطي. الإشراف على اللوحة الدائمة يحتاج عملاً إضافياً قبل الإطلاق العام.

## 6. Deploying to Vercel (Alternative — Frontend Only)

## النشر على Vercel — الواجهة الأمامية فقط

For a static frontend preview, import the monorepo with repository root as project root, install using `pnpm install --frozen-lockfile`, build using `pnpm build`, and set output directory to `client/dist`. The CLI alternative is `npm install -g vercel`, then `vercel` from the repository root with those same settings. Review the deployment before production promotion.

The default permanent canvas will not become a working multiplayer site from static hosting alone. It uses same-origin `/api/canvas` HTTP and `/api/canvas/live` WebSockets. Host the backend separately and design/test compatible HTTP routing, WebSocket URLs, CORS and cookie/auth behavior before switching hosts. `VITE_API_BASE_URL` configures Classic's gateway only. Vercel Functions are not a replacement for this persistent SQLite/WebSocket process; see [Vercel limits](https://vercel.com/docs/limits). The single-origin Render deployment is the simpler complete configuration. `/?mode=classic` in local persistence mode can serve as a frontend-only preview.

**العربية:** Vercel يستضيف الواجهة هنا، وليس الخادم الدائم. لا تتوقع عمل اللوحة المشتركة بمجرد رفع مجلد dist.

## 7. Custom Domain Setup

## إعداد الدومين المخصص

Register a domain with your preferred registrar. Add it in your hosting dashboard, then copy the exact A/AAAA/CNAME or verification records the host provides. Do not guess apex-domain DNS records. Wait for DNS verification and the host's TLS certificate, then test HTTPS and redirects.

Replace `https://forgottennetwork.com` in `client/index.html`, `client/public/robots.txt` and `client/public/sitemap.xml` with your owned canonical origin. Update `APP_ORIGIN`, `CORS_ORIGIN` and the OIDC callback too. Rebuild so canonical, social image and sitemap agree. The placeholder domain is not a claim of ownership.

**العربية:** استبدل الدومين التجريبي بدومين تملكه في ملفات SEO وإعدادات الخادم وتسجيل الدخول.

## 8. Google Search Console Registration

## التسجيل في Google Search Console

Open [Search Console](https://search.google.com/search-console), add the property and follow its ownership verification. Submit `https://YOUR_DOMAIN/sitemap.xml`. Inspect the homepage and verify robots access and the canonical URL. Do not submit arbitrary canvas coordinates as thousands of near-duplicate pages. The app is client-rendered; a substantive server/static landing page would improve indexable content. No indexing or ranking is guaranteed.

**العربية:** أثبت ملكية الموقع ثم أرسل sitemap.xml. إضافة الوسوم وحدها لا تضمن الظهور في نتائج البحث.

## 9. Analytics Setup (Google Analytics)

## إعداد تحليلات جوجل

Create a web data stream in [Google Analytics](https://analytics.google.com/). Use the exact supplied Google tag and measurement ID. Integrate it only after your consent choices permit it. Add the required provider origins to the server CSP and use a nonce/hash or external initializer rather than globally allowing inline scripts. Check actual page views and consent refusal in staging.

Useful aggregate events include tutorial completion, discovery and a confirmed demo purchase. Do not send identity secrets, recovery codes, chat contents, uploaded artwork or raw sharing URLs containing user context. Avoid counting every pointer movement as an event. No analytics script or data transmission was activated by this delivery.

**العربية:** التحليلات غير مفعّلة حالياً. أضف معرّفك بعد إعداد الموافقة، ولا ترسل مفاتيح الهوية أو محتوى المستخدمين.

## 10. Maintenance & Updates

## الصيانة والتحديثات

- Back up PostgreSQL with the existing operator tooling and rehearse restore into an empty separate target. See `docs/LAUNCH_READINESS.md`. Schedule daily encrypted off-host backups and failure alerts; no schedule was created here.
- Back up permanent SQLite using its supported online backup mechanism, or stop writers and copy the consistent database plus required WAL state. A live raw file copy alone is not a verified backup. Preserve uploaded media and test restore.
- Review updates on a separate branch, retain `pnpm-lock.yaml`, run `pnpm check`, and smoke-test both modes. Do not run a broad production update without review.
- Bump `CACHE` in `client/public/sw.js` for each release that changes the shell. The worker stores built CSS/JS during install; updates activate after old tabs close. Keep hashed assets available during rollout and test an update from the prior version. Never cache authenticated APIs.
- Regenerate the original icon/social artwork with `node server/scripts/generate-brand-assets.js` if branding changes. Rebuild afterward.
- Keep ad SDKs, privacy controls and payment webhooks under active maintenance. Device-only cosmetics/progress are demos and do not synchronize across accounts or devices.
- Browser-local progress is bounded and best-effort, not financial or server-authoritative data. Permanent pixel totals measure accepted owned cell area; Classic totals count changed painted pixels, including repainting. Exploration history stores up to 100 neighborhoods and 20 feed entries.

**العربية:** اختبر استرجاع النسخ الاحتياطية فعلياً، وحدّث رقم ذاكرة الخدمة عند كل إصدار. لا تعتمد على التخزين المحلي لحفظ مشتريات حقيقية.

## 11. Troubleshooting

## حل المشاكل

| Problem                             | What to check                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install fails                       | Node/pnpm versions, network/proxy access and antivirus locks. Retry frozen-lockfile install. Preserve the lockfile.                                           |
| TypeScript/build failure            | Run `pnpm --dir client exec tsc --noEmit`, then the full root build.                                                                                          |
| Port already in use                 | Stop only the known project terminal or configure another port and matching Vite proxy.                                                                       |
| Backend exits                       | Check actual process environment; root `.env` is not automatically loaded. Production needs real DB/OIDC configuration.                                       |
| Canvas blank/offline                | Check backend 3001, browser errors and WebSocket connection. Static hosting alone cannot serve the permanent world.                                           |
| Ads do not display                  | Check approval, consent, correct IDs, container dimensions, CSP and content blockers. Never test by clicking live ads.                                        |
| Old app after deployment            | Bump worker CACHE, rebuild, close old tabs and reopen. Do not clear site data casually: it contains local identity and drawings.                              |
| Missing coins on another device     | Expected: Studio demo coins and owned effects are device-local.                                                                                               |
| Card/expanded-area buttons disabled | Expected previews; production payment/entitlement services are not installed.                                                                                 |
| Permanent placement rejected        | Occupied cells cannot be overwritten, even by their owner. Find free space.                                                                                   |
| Mobile drawing/keyboard             | Toolbar is touch-oriented; modal controls support Tab/Escape. Canvas drawing is primarily pointer-based and still needs broader assistive-technology testing. |

Helmet preserves CSP, nosniff and production HSTS; frames are denied and referrers use strict-origin-when-cross-origin. The obsolete requested `X-XSS-Protection: 1` was not enabled: Helmet uses `0` to avoid legacy browser filter issues. See [Helmet's header documentation](https://helmet.js.org/). No blanket accessibility/security certification is claimed.

**العربية:** راجع رسالة الخطأ أولاً. لا تمسح بيانات المتصفح أو قاعدة البيانات لحل مشكلة عرض؛ قد تفقد هويتك أو رسوماتك المحلية.

## 12. Summary of All Changes Made

## ملخص جميع التغييرات

| File                                               | Change                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `client/index.html`                                | SEO, Open Graph/Twitter, canonical, JSON-LD, manifest/icons and noscript.                                                               |
| `client/src/main.tsx`                              | Additive enhancement styles and production-only service-worker registration.                                                            |
| `client/public/manifest.json`                      | Standalone PWA metadata and icons.                                                                                                      |
| `client/public/sw.js`                              | Offline shell/built-asset caching; API/upload bypass; deferred updates.                                                                 |
| `client/public/robots.txt`                         | Crawl policy and sitemap location.                                                                                                      |
| `client/public/sitemap.xml`                        | Canonical homepage sitemap.                                                                                                             |
| `client/public/icons/icon-192.png`, `icon-512.png` | Code-generated original application icons.                                                                                              |
| `client/public/icons/social.png`                   | Generated social sharing artwork.                                                                                                       |
| `server/scripts/generate-brand-assets.js`          | Reproducible Sharp/SVG branding generator.                                                                                              |
| `server/security.js`                               | DENY framing and explicit referrer policy.                                                                                              |
| `client/src/enhancements.css`                      | Additive responsive cyber styling, focus/contrast improvements, motion reduction, weather and cosmetics. Original base styles retained. |
| `client/src/components/AdSlot.tsx`                 | Reusable labeled ad previews and integration marker comments.                                                                           |
| `client/src/components/MarketCatalog.tsx`          | Categories, catalog, confirmations, ownership, demo coin top-up, confetti and honest cash previews.                                     |
| `client/src/components/CreativeStudio.tsx`         | Usable purchased brushes, glow, ten stamps, gradients, palettes and PNG export.                                                         |
| `client/src/components/Expedition.tsx`             | Journey, market, weather/CRT, cosmetic toggle, discovery, sharing, tutorial, activity, pull-refresh and haptics.                        |
| `client/src/exploration.ts`                        | Local achievements, pixel/activity accounting and bounded history.                                                                      |
| `client/src/economy.ts`                            | Validated demo catalog/ledger, exact requested item prices, bundles/packs; resilient numeric storage reads.                             |
| `client/src/market.test.ts`                        | Purchase deduction/duplicate/insufficient-fund/storage-failure and progress tests.                                                      |
| `client/src/App.tsx`                               | Expedition integration for Classic navigation, drawing and refresh.                                                                     |
| `client/src/permanent/PermanentWorld.tsx`          | Expedition/live activity, welcome polish/ambient toggle, lazy avatars, profile name and keyboard minimap access.                        |
| `client/src/components/ShopModal.tsx`              | Creator Collection entry plus contextual sponsor slot; original shop retained.                                                          |
| `client/src/components/CommunityPanel.tsx`         | Contextual rectangle sponsor preview.                                                                                                   |
| `client/src/components/OnboardingFlow.tsx`         | Modal focus, cinematic text/particles and opt-in synthesized ambience with cleanup.                                                     |
| `client/src/components/AdBannerModal.tsx`          | Clearly labeled demo reward and visible-tab timer.                                                                                      |
| `client/src/components/useModal.ts`                | Textarea/summary focus support; robust trapping with empty/removed controls.                                                            |
| `client/src/engine/Engine.ts`                      | Painted-pixel activity accounting and wheel guard while modals are open.                                                                |
| `client/src/engine/Atmosphere.ts`                  | Particle drift normalized to elapsed time.                                                                                              |
| `client/src/location.ts`, `location.test.ts`       | Classic shared URLs retain `mode=classic`, with regression assertion.                                                                   |
| `server/test/pwa.test.js`                          | Shell asset precache, sensitive-route bypass and offline coordinate navigation tests.                                                   |
| `docs/creator-market-desktop.png`                  | Browser verification preview.                                                                                                           |
| `SETUP_GUIDE.md`                                   | This bilingual setup and production handoff guide; also at archive root.                                                                |
| `client/dist/**`                                   | Regenerated production output, including copied PWA assets.                                                                             |

The requested critical source files were inspected; existing authentication, storage, undo/drawing, daily rewards and other original features were retained. Automated tests cover both canvas modes and storage/security paths. Checks are evidence for covered behavior, not proof that every browser/device or hosted integration works.

Implemented deviations are intentional: no fabricated scarcity/social proof, no mathematically unsupported discounts, no incentives for ordinary ad clicks, and no obsolete XSS filter. Drawing tools operate in the exportable Studio; expanded personal zones/priority delivery remain explicitly disabled previews. Existing permanent ambience provides drawing feedback; new optional ambience improves onboarding. A public release still requires owner infrastructure, moderation review, provider integration and broader accessibility/device testing.

**العربية:** تمت إضافة التحسينات مع إبقاء وظائف المشروع الأصلية. بعض الميزات ظاهرة كمعاينة بوضوح لأنها تحتاج دعماً حقيقياً من الخادم. راجع متطلبات الإطلاق أعلاه قبل نشر الموقع للعامة.

## Delivery verification — 4 October 2026

`pnpm check` passed: formatting, lint, 82 tests (3 shared + 40 client + 39 server), TypeScript and the Vite production build. The development server started successfully and was stopped after browser checks. Browser checks covered Classic onboarding, permanent-mode Expedition, 390×844 and 1440×900 layouts, demo purchase deduction/ownership, unlocked Studio tool selection, and Escape restoring focus. No browser error logs were captured in the final smoke check. Hosted authentication, real ads/payments, physical mobile haptics and a browser-level offline installation remain unverified.

`ARCHIVE-MANIFEST.json` is an older supplied inventory: only its formatting was normalized; its hashes describe the earlier delivery, not this one. The final ZIP contains all physical project files, including existing local data and dependency files. `DEPENDENCY_LINKS.json` at ZIP root records pnpm directory links without recursively duplicating or following cycles; run `pnpm install --frozen-lockfile` after extraction to recreate links. Keep this archive private because it includes local application data.

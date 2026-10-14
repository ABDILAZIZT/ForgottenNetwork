# Advertising setup

Advertising is disabled by default. The repository contains no publisher account, approved inventory, publisher ID, ad unit IDs, certified consent management platform, or `ads.txt` seller record. Do not turn on `VITE_ADS_ENABLED` until the operator has completed the steps below and reviewed the current user-generated content and child-safety gates in [Trust & Safety](TRUST_AND_SAFETY.md) and [Launch Readiness](LAUNCH_READINESS.md).

## 1. Set up the publisher account

1. Create and verify the publisher's Google AdSense account and site, or an Ad Manager network if using rewarded web ads. Approval and inventory are controlled by Google; this repository cannot enable them.
2. In AdSense, create display ad units and copy the publisher ID (`ca-pub-` followed by 16 digits) and each unit ID. In Ad Manager, create and traffic a web rewarded ad unit, then copy its full network/unit path (for example, `/1234567/network-rewarded`).
3. Configure production build variables in the deployment provider. Never put account passwords, API credentials or other secrets in `VITE_*` variables. Those values are bundled into public JavaScript.

```dotenv
ADS_ENABLED=true
VITE_ADS_ENABLED=true
VITE_ADSENSE_CLIENT_ID=ca-pub-0000000000000000
VITE_AD_MANAGER_REWARDED_UNIT=/0000000/example-rewarded
VITE_AD_SLOT_TOP_BANNER=
VITE_AD_SLOT_SIDEBAR=
VITE_AD_SLOT_MARKETPLACE_FEED=
VITE_AD_SLOT_FOOTER=
```

Replace each example or blank value with the ID issued for this site. A valid publisher ID and the relevant slot ID are both required for a display slot. The AdSense tag is inserted only in production, after the visitor allows optional ads and the configured IAB TCF API reports an allowed state. Rewarded requests use GPT and have the same consent gate. Missing IDs, a declined choice, or a missing/denied CMP keep the ad request disabled.

Set the server `ADS_ENABLED` flag as well as `VITE_ADS_ENABLED`: the server adds the small Google script/frame/image allowlist to its Content Security Policy only when that server flag is true. If the selected CMP uses a different script host, add only its verified host to the CSP after reviewing the vendor instructions. Restart the server after changing this flag.

## 2. Configure consent before ad requests

Connect a Google-certified Consent Management Platform (CMP) that integrates with the IAB Transparency and Consent Framework (TCF). The app stores a separate Allow/Decline preference and waits for a TCF consent event before adding an ad script. This preference UI is an additional gate; it is not itself a certified CMP and does not establish legal compliance.

Google requires a certified TCF CMP for personalized ads in the EEA, UK and Switzerland. Review Google's current [consent requirements](https://support.google.com/adsense/answer/13554020?hl=en) and the CMP vendor's current deployment instructions. Confirm the CMP works on every served route and that rejecting optional ads leaves the canvas usable.

## 3. Publish the real `ads.txt` record

After Google supplies the seller record, replace the comments in `client/public/ads.txt` with the exact authorization line from the publisher account. The file must be served at the site's root as `/ads.txt`. Never publish the sample `pub-XXXXXXXXXXXXXXXX` identifier from old drafts: it is not a real publisher ID and must not be represented as the operator's authorization.

## 4. Rewarded ads and demo gems

The rewarded button is an affirmative opt-in. In development it runs a clearly labelled 15-second simulation. In production it requests a Google Ad Manager GPT rewarded web slot only after the visitor's choice and CMP consent; it grants 15–25 local demo gems only after GPT fires `rewardedSlotGranted`. The daily device limit is 10 for free explorers and 15 for Artist demo members, with a three-minute device cooldown. VIP remains ad-free.

Google's rewarded web format does not provide server-side verification. The demo wallet, daily count and cooldown are stored in browser storage and can be edited or reset; they are not trusted balances or fraud controls. Do not connect these demo rewards to paid goods, transferable items, a cash value, or an account balance until the operator designs and tests an authoritative reward policy. Google requires rewarded items to remain non-transferable and usable only within the publisher's platform; random reward ranges must be disclosed before opt-in. See [rewarded web setup and limitations](https://support.google.com/admanager/answer/9116812?hl=en), [GPT rewarded ad API](https://developers.google.com/publisher-tag/samples/display-rewarded-ad), and [Google's rewarded-ad policies](https://support.google.com/adsense/answer/9121589?hl=en).

No automatic or transition interstitial is enabled. The canvas is the primary activity, so ads are limited to optional, labeled placements in secondary panels and the explicitly requested rewarded flow. Check the rendered layout at desktop and phone widths and keep no more than three display slots visible at once.

## 5. Verify before launch

- Keep `VITE_ADS_ENABLED=false` while testing without approved IDs.
- Test fresh consent, Allow, Decline, changed choice, missing CMP, denied TCF, and blocked network cases. Confirm no Google ad script is inserted before all gates pass.
- Confirm each visible ad is clearly labeled, does not resemble a control, and does not cover the canvas or drawing tools.
- Confirm rewarded skip/close earns nothing, a granted reward is added once, and the cap/cooldown message is accurate.
- Check `/ads.txt` on the production host and replace this repository's comments with the exact approved seller entry.
- Complete the launch gates for image moderation, child safety, legal review, storage and monitoring before inviting the public.

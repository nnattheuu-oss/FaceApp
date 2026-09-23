# Launch v1 audit — 23 September 2026

Audit of the repository against the owner's launch decisions L-01 to L-11
(`docs/LAUNCH_V1_OWNER_DECISIONS.md`, register entry `DR-2026-09-23-LAUNCH-V1`), plus what was
executed on branch `claude/owner-decisions-launch-v1-5700wu`.

**Environment.** Linux sandbox (cloud container), Node v22.22.2, bash. The TARGET is an
Android phone running a Bubblewrap TWA. Nothing here ran on a phone, inside a TWA, or against
Google Play. Every billing path was exercised against hand-built fakes of the Digital Goods and
Payment Request APIs. See "NOT VERIFIED".

---

## Verdict

**Everything on the web side of v1 is now built, and v1 still cannot take money.** Two blockers
sit in the Android wrapper, and both conflict with an owner decision as written:

1. **B-1: the purchase-acknowledgement rule conflicts with the no-backend rule (L-03 against
   L-09).** Google Play refunds and revokes any purchase that is not acknowledged within three
   days. The Digital Goods API (v2.0 and later) has no client-side `acknowledge()`, and
   Chrome's guidance is to acknowledge from a backend. L-09 forbids a backend. As written, every
   sale would be refunded 72 hours later and the reading revoked. Purchases are therefore held
   closed in code (`ACKNOWLEDGEMENT_ROUTE = null`), and a test pins that state.
2. **B-2: the Play Billing Library version.** Since 31 August 2026 Play has required Billing
   Library 8 or later for new apps (an extension to 1 November 2026 is available). The TWA
   billing module that Chrome documents, `com.google.androidbrowserhelper:billing:1.1.0`, was
   updated for Billing Library **7**.

**Recommended single fix for both:** patch or fork the androidbrowserhelper billing module in
the Bubblewrap project so that it (a) builds against Billing Library 8 or later, and (b)
acknowledges purchases **on the device** with `BillingClient.acknowledgePurchase` after Play
reports `PURCHASED`. The Android Billing Library supports on-device acknowledgement. Google
recommends server verification but does not require it. This keeps L-09 intact. The same patch
can also choose the subscription base plan, which fixes B-3. Once it exists, set
`ACKNOWLEDGEMENT_ROUTE = "native-wrapper"` in `src/billing/catalogue.js`. Nothing else in the web
layer changes. The cost is that purchases are not verified on a server, so a rooted device could
fake one. That is still a large improvement on the old model, where anyone with devtools could
unlock in one line.

There is also **one STOP** (a conflict the owner's record says the agent must report, not
resolve). There are **nine further findings** (B-3 to B-11) that need an owner decision, and all nine are
listed below. The most commercially important is **B-9**. Before this change, the paid Twelve
Palaces showed "interpretation withheld" for all twelve palaces, so the paywall would have sold
an empty box.

---

## Status by decision

| # | Decision | Status | Evidence / what remains |
|---|---|---|---|
| L-01 | Play only; AU/NZ/UK/CA | **Console task.** Nothing in code restricts countries, and nothing needs to. | Set the country list in Play Console → Production → Countries. iOS is not started. |
| L-02 | 18+, Entertainment | **Partly done.** "For adults 18 and over." added to the consent gate and terms §3. | Set the Play content rating questionnaire, target audience 18+ and category Entertainment in the Console. See B-6 on the Health declaration. |
| L-03 | Three SKUs, prices from Play, hard paywall | **Web side done; purchases held closed** (B-1, B-2, B-3). | `src/billing/*`, `src/ui/qise/paywall.js`. Paid content is removed from the view model, not blurred. The weekly plan and Lemon Squeezy links are gone. A weekly, 13-week, trial or intro offer returned by Play is refused, not relabelled. |
| L-04 | Share card, no share reward | **Done.** | `shareGate.js` (share-to-unlock, weekly window, redeem URL and dev-panel free unlocks) deleted. The share cards now drop paid content unless Play lists a purchase. |
| L-05 | The label; quotations only from KR3g0043–0046 | **Label done on every reading surface** (Today, Story, palace cards, both share cards). | `INTERPRETATION_LABEL`. See B-8 (brand) and B-10 (Kanripo licence). Five Elements prose still says "The texts associate…", which paraphrases a source; see B-11. |
| L-06 | Lexicon lint is the only content gate | **Done**, on source and on `dist/`. | `LAUNCH_CONTENT_RULES` in `scripts/copy-scan.js`; 24 reading surfaces; 0 violations. See the design note below. |
| L-07 | Ship the Reflection Engine if both work | **STOP-1.** Not changed. | See STOP-1. The classic Module A view is reachable in the same artefact; see B-5. |
| L-08 | Within-subject; lighting caveat; no streaks | **Done with interim copy.** Audit found no streak, loss-guilt, better/worse or cross-user wording on Qi Se surfaces. | The lighting caveat on the Pattern tab is interim wording (`data-launch-copy="L-08-interim"`). Document "03" is not in the repo (B-7). |
| L-09 | No user data leaves the device | **Confirmed; no STOP.** | No `fetch`, XHR, `sendBeacon`, WebSocket or EventSource carries user data. `report.js` has no transport. The service worker `fetch` is same-origin. MediaPipe is vendored same-origin. Play Billing talks to Play through the TWA, not to us. The RevenueCat mentions were removed from the privacy policy and the lint. |
| L-10 | Falsification-first for billing | **Done for billing and entitlement:** 13 mutations, all caught. | `scripts/billing-falsify.mjs` (`npm run test:falsify`). The scanner and consent gates were not changed here. |
| L-11 | targetSdk 36; Play App Signing | **Template and check done; nothing is built.** | `android/twa-manifest.template.json` (Play Billing on); `scripts/check-android.mjs` rejects targetSdk < 36, missing billing and leftover placeholders. The owner holds the upload key. |

---

## STOP-1: public reading engine

`DR-2026-08-17-REFLECTION-ENGINE-INTERNAL-DEFAULT` and the charter's "Engine posture" amendment
keep the **public** default on the passage engine "until the heritage rights gates close". L-05
makes the rights gates research-track, and L-07 says to ship the Reflection Engine. Neither
record is listed under L-01–L-11 "Supersedes". The owner's rule says an unlisted conflict is
reported, not resolved. So `src/qise/reading-flags.js` is unchanged: public origins still get the
passage engine, and the Reflection Engine stays on the development allowlist.

**Decision needed:** add `DR-2026-08-17-REFLECTION-ENGINE-INTERNAL-DEFAULT` and the charter's
engine posture to the v1 Supersedes list, or keep the passage engine for v1. If the Reflection
Engine becomes the public default, the change is to `reading-flags.js`. Its fail-closed origin
allowlist is deliberate and should be changed as a named origin, not by defaulting to on.

A naming note that is not a STOP: L-03 says "Three Courts". Row R1 of `DR-2026-08-17-B020-CLASS-A`
withdrew that English rendering. I read L-03 as naming the construct, and the UI keeps "Three
Sections".

---

## Findings that need an owner decision

**B-1: purchase acknowledgement against no backend.** See the Verdict. Options: (a) acknowledge
on-device in a patched wrapper (recommended); (b) a minimal acknowledgement backend, which
breaks L-09 as written, because the purchase token leaves the device; (c) do not sell in v1.

**B-2: Billing Library 8.** Uncertain: I could not find a public androidbrowserhelper billing
release built on Billing Library 8. The documented `1.1.0` targets version 7. Check this before
building. The extension to 1 November 2026 is available.
Sources: [Play Billing deprecation FAQ](https://developer.android.com/google/play/billing/deprecation-faq),
[ChromeOS: Digital Goods API on Billing Library 7](https://chromeos.dev/en/posts/upgrade-digital-goods-api-to-google-play-billing-library-7).

**B-3: two base plans under one subscription.** Uncertain. The Digital Goods and Payment Request
purchase call carries only `sku` (the product ID) and has no base-plan field. Play's legacy
purchase path buys the base plan marked "backwards compatible". As built, one of
`quarterly`/`annual` may not be purchasable from the TWA. Options: (a) the patched wrapper from
B-1 maps the choice to an offer token; (b) two subscription products, e.g.
`spiritmaxx_qi_quarterly` and `spiritmaxx_qi_annual`, which changes the L-03 IDs, and Play
product IDs are permanent; (c) launch with one base plan. The web layer already refuses any
period other than P3M/P1Y and displays whatever Play actually returns.

**B-4: what the subscription grants.** L-03 names `spiritmaxx_qi` but says only that the full
trait mapping and palaces are paid. It is mapped to the same features as the lifetime product,
in one declared table (`PRODUCTS[].grants` in `src/billing/catalogue.js`). That makes a
subscription strictly worse value than the AUD 34.99 lifetime product. The product ID suggests
the intent is ongoing Qi Se. If so, which post-baseline Qi Se surfaces become paid? Gating free
behaviour that already exists was not decided, so it was not done.

**B-5: the classic Module A view (`index.html?classic`) and `/beta/` ship in the same
artefact.** The classic view fires `rules-a.js` readings such as "Liver Qi Stagnation", with
sleep and breathwork advice, from the user's own wrinkle measurements. That is an organ mapping
inferred from the user, which exclusion P3 (`OPTION_B_020_DOSSIER.md` §10.2, row R11) forbids in
every mode. `/beta/` is an unfinished surface with a stub "Study" that claims "112 entries" and
says "Depth is paid". **Recommendation:** add a Play build flavour that omits both, using the
mechanism `scripts/build.js` already uses to stub Module B. Not done here because it changes
which surfaces ship, and the tests pin the classic escape hatch.

**B-6: which flavour ships, and the Play Health declaration.** `dist/` builds as `wellness`
(Module B safety referrals ship). With L-02's Entertainment category, the Play Health apps
declaration still has to be answered for Module B. See `flags.js`. Decision needed: `wellness`
or `entertainment-only` for the Play artefact.

**B-7: document "03" is not in the repository.** L-01 and L-08 refer to consent, notice and
lighting copy "in 03". Interim wording was added for the 18+ line and the lighting caveat so the
requirement is not missing. Replace it with the 03 wording, and add 03 to `docs/`.

**B-8: brand.** The L-05 label and product IDs say SpiritMaxx. The manifest, the Play launcher
name, the share cards and the wordmark say "Mien Shiang". Decide the public name before creating
the Play products, because product IDs cannot be reused once created.

**B-9: what the paid product contains (commercial).** Before this change, all twelve palaces
showed "Heritage interpretation withheld", so the product for sale was a list of palace names.
Twelve app-authored interpretations now exist
(`src/reading/palace-interpretations.js`: a lens, an interpretation and a question for each
palace). They are written for the palace, not derived from the face, and the UI says so beside
every card. The disclosure keeps them honest. But AUD 34.99 for the Five Elements frame, the
canon comparison and twelve fixed reflections is thin. The obvious deepening is to read each
palace's **own colour against the user's own baseline**. That is the traditional pairing of qi se
with the palaces, and it reuses the measurement the product already takes. It would be the next
corpus and interpretation task. Editorial review of the twelve interpretations is also owed
(invariant I8).

**B-10: Kanripo licence.** Uncertain: L-05 permits quotation from KR3g0043–0046. Check the
licence of the Kanripo repositories for attribution or share-alike terms before quoted lines
ship in a paid product.

**B-11: character associations.** Two `insights.js` lines named morality ("principled conduct",
"moral consistency"). P5 forbids that in every mode, so they were rewritten. The same file
labelled face-shape temperament lore "TCM tradition", which misattributes physiognomy to medicine.
That was relabelled "Mian Xiang", and its present-tense organ-system default was rewritten (P3).
Still open: the Five Elements and insights prose associates each type with temperaments
("steadiness", "precision"). Those lines are tradition-attributed and pass L-06, but P5 lists
"character" as absolute. The owner should say whether type temperament associations fall inside
P5.

---

## What was implemented

- **Billing** (`src/billing/`): `catalogue.js` (the three offers, the paid features, the period
  wording, and the acknowledgement route held at `null`); `entitlements.js` (reads Play's
  `listPurchases()` on every render and caches nothing on the device; `unsupported` and
  `unverifiable` are separate states; fails closed); `offers.js` (prices from Play; refuses
  weekly, 13-week, trial and intro offers); `purchase.js` (refuses before the sheet opens with
  no acknowledgement route; grants only when Play lists the purchase, never from the payment
  response).
- **Hard paywall.** `gateIntegratedModel()` removes the Five Elements, canon, headline and
  palace fields before any markup is built. The classic `renderReadingGated()` no longer
  renders paid sections under a blur. Both share cards drop paid content by default. The free
  side is the scan, Three Sections and Qi Se.
- **Removed:** `src/shareGate.js` and its test, the Lemon Squeezy checkout links and their
  egress allowlist entry, the weekly plan, the redeem URL, and the dev panel's free unlocks. The
  classic locked share card's "Full TCM Report + Aesthetic Analysis" teaser (a health framing
  plus an attractiveness framing) was replaced.
- **Copy:** twelve palace interpretations; the L-05 label; en-AU fixes ("Analyzing", and the
  gate line "12 palaces unlocked" became neutral); 18+ lines; the lighting caveat; the
  `insights.js` fixes in B-11; the privacy policy "Purchases" section now names Google Play
  Billing and links Google's policy; a "3a. Paid features" section in terms (auto-renewal, no
  trial, refunds through Play).
- **L-06 gate:** claim-shaped rules for prediction, belief attribution and measurement claims.
  They match the claim, not the bare word. A word list would have rejected "Nothing was measured
  to bring to this" (an abstention that invariant I5 requires), "Fortune Palace" (the
  tradition's own name) and "None of that makes them predictive" (a disclaimer). A gate that
  forced those out would make the copy less truthful. Every rule has a positive control, the
  honest sentences are pinned as negative controls, and a missing reading surface fails the
  bundle lint. Writing the positive controls caught a real gap in one of my own rules ("measured
  your cheekbone height" slipped through), which is now fixed.
- **Android:** `android/twa-manifest.template.json` and `scripts/check-android.mjs`.
- **Cache:** `mienshiang-v25` became `v26`, and `index.html` now redirects to `?v=26` (item 15).

## Falsification record (L-10)

`node scripts/billing-falsify.mjs` breaks the code one defect at a time, requires the named test
to go red, and then restores the file. Output from this session:

```
PASS positive control  tests/billing.test.js: 28 passed, 0 failed
PASS positive control  tests/qise/share.test.js: 9 passed, 0 failed
PASS positive control  tests/readingview.test.js: 15 passed, 0 failed
PASS positive control  tests/sharecard-modes.test.js: 12 passed, 0 failed
CAUGHT M1 every feature free
CAUGHT M2 unknown items trusted
CAUGHT M3 unreachable Play read as verified
CAUGHT M4 purchase without an acknowledgement route
CAUGHT M5 grant from the payment response, not from Play
CAUGHT M6 any subscription period offered
CAUGHT M7 free trial offered
CAUGHT M8 element prose survives the paywall
CAUGHT M9 palaces survive the paywall
CAUGHT M10 weekly period added to the catalogue
CAUGHT M11 share card ignores the entitlement
CAUGHT M12 classic view renders paid sections while locked
CAUGHT M13 classic share card shows the element while locked
All 13 mutations caught; positive controls green.
```

## Tests replaced, and why

These tests pinned the product that L-03 and L-04 replaced. They were rewritten to pin the new
decision, not loosened:

- `tests/shareGate.test.js` was deleted with the module (weekly window, share count, redeem URL).
- In `readingview.test.js`, "locked=true still contains gated section text (for search / a11y)"
  pinned the leak that made view-source the unlock. It now asserts the opposite: paid content is
  absent.
- In `insights-view.test.js`, the teaser moved from free to paid (it is shape narrative, which is
  trait mapping), and the report is asserted absent rather than "inside the blur".
- In `sharecard-modes.test.js`, the locked card must not carry the element or the canon value;
  the unlocked card must.
- In `qise/share.test.js`, the structural line needs an entitlement, and new tests pin the
  default-free card and the L-05 label.
- In `about.test.js`, the privacy test now requires Google Play Billing and rejects RevenueCat.
- In `e2e/qise-redesign.spec.js`, the palace-UX tests now run as a Play-entitled user. The
  unpaid path is pinned by `e2e/qise-paywall.spec.js`.

## NOT VERIFIED

- Nothing here ran on a physical Android device, inside a TWA, or against real Google Play.
  Needed: `bubblewrap init` → `node scripts/check-android.mjs <project>` → an internal-testing
  track with licence testers → a purchase, a restore on a second device, a refund (revocation
  must lock the reading on the next open), and a lapsed subscription.
- The real Digital Goods `listPurchases()` behaviour for pending purchases, and whether it works
  offline, is inferred from documentation. It was not observed.
- The Play Console country list, content rating, category, Health declaration and base plans
  (whether "3 months" is offered) were not touched.
- Whether androidbrowserhelper billing has a Billing Library 8 release (B-2) and how base plans
  are selected (B-3) are both Uncertain.
- The Playwright browser suite was run against the pre-installed Chromium through a scratch
  config (`executablePath`), because the pinned Playwright expects a browser build that is not
  installed here. Result: 28 passed, 4 failed. All 4 failures are in
  `e2e/beta-camera-integration.spec.js`, which sets its own `launchOptions` and so overrides the
  scratch `executablePath`. The failure is "Executable doesn't exist" at browser launch, before
  any test body runs. Those 4 tests were not run; they were not observed failing an assertion.
  To run them: `npx playwright test e2e/beta-camera-integration.spec.js` with the pinned browser
  installed.

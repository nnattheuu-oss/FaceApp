# Monetisation audit and programme — September 2026

Status: owner-approved programme (25 September 2026). Binding rulings are recorded in
`docs/DECISION_REGISTER.md` as `DR-2026-09-25-*`. **All six entries this document calls "proposed" were approved on 25 September 2026** (`DR-2026-09-25-SIX-PROPOSALS-APPROVED`). The one narrowing: no price point is approved yet. Line references are against the M0 head unless noted.

**Labels.** "Estimate:" marks a number with no primary source. "Contested:" marks sources that
disagree. Everything else is cited.

---

## Frozen contracts (bind every agent; changed only through a Decision Card)

1. **Entitlement model.** RevenueCat is the single entitlement source for both stores. User IDs are anonymous RevenueCat app-user IDs; there is no account and no email. **Permitted egress:** store purchase token, anonymous app-user ID, product ID, and nothing else. `src/billing/*` keeps the entitlement model (`hasFeature`, `PRODUCTS[].grants`); only the provider layer changes.
2. **Privacy line: "your face never leaves your device."**
   - Face pixels, landmarks and measurements are never uploaded.
   - Pixels and landmarks are never persisted. The one exception is the Daily Portrait display frame, under DR-2026-09-09-CARDS-1-2.
   - A friend's face in two-face compatibility follows the derive-and-discard path in D4 §4.
3. **P1–P14 prohibited inferences** are enforced on every shipped reading surface: `tests/sensitive-inference.test.js` (24 surfaces plus palace data) together with the L-06 gate.
4. **Paywall sequence and catalogue** are as specified in D4. "No trial" is a launch A/B assumption, not a settled fact.
5. **The store build excludes** the classic path, `/beta/` and Module B (`MODULE_B_SAFETY_REFERRALS=false`). The never-billed policy constant (`MODULE_B_IS_NEVER_MONETISED`) stays.

---

## Phase 0 — evidence gate (summary; full tables in the approved plan, reproduced here)

**Verdict on the hypothesis ("restrictions strangle revenue").** Mostly false for the product people use.

- The primary app is `src/qise.html` + `src/ui/qise/app.js`. `src/index.html` redirects there unless `?classic`.
- These surfaces exist **only in the classic path**:
  - the deep-skin redness refusal (`src/engine.js`, `erythemaConfidence`)
  - the "not checked" list (`src/modulebview.js`)
  - the science screen (`src/scienceview.js`)
  - Module B (`src/adapters/safety.js`)
  - the share gate (deleted by launch-v1)
  - the "may suggest" hedges (`src/utils/insights.js`)
- What actually blocked revenue:
  1. **No payment path** in the primary app.
  2. **L-09's ban on any server.** Play refunds unacknowledged purchases at 72 h, and the Digital Goods API cannot acknowledge client-side. [Chrome docs](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
  3. **An empty paid box:** all twelve palaces were withheld.
  4. **The Reflection Engine is off for public origins** (`src/qise/reading-flags.js`).
  5. **A boot dead-end.** A consented user with no stored reading lands on a capture screen whose camera never starts (`src/qise/consent.js` `consentBootTarget` + `src/ui/qise/app.js` boot).

**Scanner (0a).**

- **VERIFIED-BROKEN, fail-closed:**
  - Multi-face is undetectable. `src/landmarker.js` hard-codes `numFaces: 1`, and the live, selfie and beta paths take `faceLandmarks[0]`.
  - The hold latch keeps its start time across a face-loss gap, and `collecting`/`burst` are not reset when the mesh is lost.
  - Burst frames 2–9 are not re-gated.
- **VERIFIED-BROKEN, copy:** a model or WASM load failure reaches `describeCameraError`, whose fallback tells the user to check camera permission.
- **VERIFIED-BROKEN, low severity:** the selfie path hard-codes `mirrored:false`, but phones commonly save selfies mirrored.
- **Gap:** "Use this light anyway" tolerates any illuminant error, and those scans are stored at confidence 0.78, above the 0.6 floor (`src/qise/gates.js` `acceptUnevenLight`; `src/qise/baseline.js`).
- **VERIFIED-SAFE:**
  - Timestamp monotonicity: one `performance.now` clock, and a new landmarker per run.
  - Live mirroring: CSS-only mirror, unflipped analysis buffer.
  - Same-origin, hash-pinned vendored assets.
  - No Web Worker. Upstream [#5292](https://github.com/google-ai-edge/mediapipe/issues/5292) and [#4694](https://github.com/google-ai-edge/mediapipe/issues/4694) are worker-only.
  - Clipping and low-light abstention.
- **PARTIAL:** iOS/Android lifecycle. There is no `visibilitychange` or track-`ended` handling, so recovery is manual via "Restart camera".
- **Falsification sweep** of the 1,400-test base:

  | Class | Tests |
  |---|---|
  | Scanner runtime (only ~47 drive a faked camera/track/factory) | 173 |
  | Scanner pure maths | 198 |
  | Reading/content | 696 |
  | Governance pins | 96 |
  | UI/share | 140 |
  | Other | 97 |

  The live `step()` loop is never executed by a unit test. e2e runs on Desktop Chrome only.
- **Only devices can prove:**
  - track loss on backgrounding
  - AE/AWB convergence and thermal frame-rate collapse
  - GPU context loss
  - two real people in frame
  - deep skin in dim light
  - rotation and permission revoke mid-scan

**Restriction sweep (0b).** 25 rows; the table is reproduced in D1.

---

## D1 — Restriction audit

**Classes:**

| Class | Meaning |
|---|---|
| LEGAL ARMOUR | Keep the minimum |
| PHYSICS | Keep; reframe the copy as mystique, not apology |
| OVERHEAD | Cut |
| MONEY-BLOCKING | Fix |

Changes marked M1a/b/c land in that milestone.

| # | Item | Where | Class | Change | Record |
|---|---|---|---|---|---|
| 1 | Deep-skin redness refusal | `src/engine.js` `erythemaConfidence`; shown only in `modulebview.js` | PHYSICS | No change to the maths. It leaves the store build with classic (row 22). The primary app has none. | proposed DR-2026-09-25-STORE-ARTEFACT-SCOPE |
| 2 | "Not checked" list | `engine.js` `UNAVAILABLE` → `modulebview.js` | OVERHEAD | Leaves with Module B (M1b) | same |
| 3 | Science screen | `reading/science.js`, `scienceview.js` (classic) | OVERHEAD | Excluded from the store build. **Fix `src/terms.html`**: it claims the screen is "reachable in one tap from every reading", which is false for the primary app (M1b). | same |
| 4 | Module B + never-billed | `flags.js`, `adapters/safety.js`, `COMPLIANCE.md` | Policy: LEGAL ARMOUR. Module: OVERHEAD | See "Row 4 detail" below. | same |
| 5 | Share gate | deleted in launch-v1 | MONEY-BLOCKING | Done (L-04) | DR-2026-09-23-LAUNCH-V1 |
| 6 | Classic locked share card leak | `sharecard.js` | MONEY-BLOCKING | Done (v1) | same |
| 7 | Severity hedges | `qise/passages.js` ("a mild showing…") | Voice OVERHEAD; bands are PHYSICS | Rewrite in D3's register; keep the bands (`baseline.js`) | voice agent, M3 |
| 8 | "Tradition-attributed" / "may suggest" hedges | comments only in the primary app; visible only in classic `insights.js` | not supported | Leaves with classic | — |
| 9 | Disclaimers | `qise.html` consent (2 lines), share footer | LEGAL ARMOUR (ACL s18 misleading conduct; Play Entertainment category) | Keep. They are already minimal. | — |
| 10 | P1–P14 | `OPTION_B_020_DOSSIER.md` §10.2 | LEGAL ARMOUR | Keep all 14. Enforcement is widened by `tests/sensitive-inference.test.js` (done in this PR). | DR-2026-08-17-B020-CLASS-A R11 |
| 11 | `auditContentProvenance` store gate | `reading/provenance.js`; `.github/workflows/store-release.yml` → `release:check` | OVERHEAD as a launch gate | `check-release.js` treats L-05-labelled families as non-blocking; the audit stays as a report (M1b) | proposed DR-2026-09-25-RELEASE-CHECK-L05 |
| 12 | Palaces withheld | `reading/twelve-palaces.js` | MONEY-BLOCKING | Done in M0: 10 tradition palaces, plus 2 L-05 interpretations | DR-2026-09-25-M0-CONSOLIDATION |
| 13 | Reflection Engine off for the public | `qise/reading-flags.js` | MONEY-BLOCKING | Add the production origin by name to the allowlist (M1b) | proposed DR-2026-09-25-REFLECTION-PUBLIC-DEFAULT |
| 14 | Boot dead-end | `consent.js` + `app.js` boot | MONEY-BLOCKING bug | Auto-start `runCapture()` (M1a) | M1a |
| 15 | Calibration withholding | `baseline.js` `CALIBRATING_READINGS=3` vs `screens.js` "anchor N of 4" | PHYSICS | Fix the off-by-one (M1a). Reframe as the day 1→4 habit anchor (D3). | M1a / M3 |
| 16 | Two-step consent | `qise.html` consent screens | LEGAL ARMOUR (APP 3 sensitive-information consent; UK GDPR Art. 9) | Keep. Collapse to one screen only if the funnel kill criterion trips (D5). | — |
| 17 | "Nothing leaves the device" copy and "No" store answers | `README.md`, `index.html`, `qise.html` ("nothing reaches us"), `privacy.html`, `COMPLIANCE.md` | MONEY-BLOCKING | Change to "your face never leaves your device" **in the same build as RevenueCat** (M1c), so the forms and the binary match | DR-2026-09-25-FACE-NEVER-LEAVES-DEVICE |
| 18 | No streaks / no reminders / no urgency | `RETENTION_EXPERIENCE_CONTRACT.md` (prohibited mechanics, notifications); L-08 | OVERHEAD | Guilt-free streak; opt-in `.ics` reminder at the paywall; honest timed discount | DR-2026-09-25-RETENTION-STREAK-REMINDER |
| 19 | No weekly plan | charter, L-03 | Keep | Weekly plans behave like trials | — |
| 20 | No trial | L-03 | Contested | A/B assumption (D4) | proposed DR-2026-09-25-CATALOGUE-PRICING |
| 21 | `/beta/` in the artefact | `src/beta/` | OVERHEAD + liability | Excluded from the store build (M1b) | proposed STORE-ARTEFACT-SCOPE |
| 22 | Classic path in the artefact | `index.html?classic` | OVERHEAD | Build-flag exclusion, **not deletion**, so classic tests stay green (M1b) | same |
| 23 | Selfie gate raw message | `app.js` selfie branch | bug | Route through `captureInstruction` (M1a) | M1a |
| 24 | EU/US exclusion | L-01 | LEGAL ARMOUR | Keep (see "EU posture" below) | DR-2026-09-25-DUAL-STORE-REVENUECAT |
| 25 | Broken citations | `provenance.js`, register | housekeeping | Done in M0 | DR-2026-09-25-M0-CONSOLIDATION |

**Row 4 detail (Module B).**
- The policy costs **$0 today**: no paid surface reaches Module B.
- The minimum compliant version is smaller than what ships: **don't ship it.** Set `MODULE_B_SAFETY_REFERRALS=false` for store builds (M1b). The build already stubs the module.
- The Play Health declaration then becomes "no health features".
- Keep `MODULE_B_IS_NEVER_MONETISED`. Charging for a referral would turn it into a paid health function (TGA s41BD 14B; Play Health policy).

**EU posture.**

| Option | Effort |
|---|---|
| (a) First-exposure Art. 50(3) notice | ~0.5 dev-day plus L7 |
| (b) "Expression off for EU" | 0 dev-days: the qise path already builds the landmarker with `outputFaceBlendshapes:false` (`src/ui/qise/app.js` `buildLandmarker`); blendshapes exist only in classic, which leaves the store build |
| (c) Store-level geo-exclusion | 0 dev-days (Console setting) |

**Recommendation: (c) now.** It is the cheapest reversible option and the one already decided. (a) plus (b) are the re-entry package once L7 is answered.

**Store-review armour.**
- The **minimum viable armour for a paid entertainment app** is:
  - the Entertainment category;
  - the consent line ("entertainment and self-reflection, not a rating or a medical opinion");
  - the share-card footer;
  - no health words anywhere in the listing.
- Apple 1.4.1 applies only to M2. The science screen is not needed there, because nothing claims measurement accuracy.

---

## D2 — Market, edge, funnel

**Co-Star mechanics, translated or killed.**
- Co-Star: [~4.3 M MAU](https://www.apptunix.com/blog/how-to-develop-an-astrology-app-like-co-star/). **Contested:** revenue estimates run from ~US$400k/month (app-intelligence estimate) to US$25–50 M/yr (company-data aggregator, same source roundup). Don't plan against either.

| Co-Star mechanic | Mien Shiang translation | Verdict |
|---|---|---|
| Confronting, quotable daily line | One screenshot-quotable line per reading, carried on the share card with a deep link (D3) | **Adopt** |
| Friend compatibility | **Two-face compatibility**: the launch flagship (owner ruling), remote-token first (D4 §4) | **Adopt, flagship** |
| Daily habit from a birth chart that never changes | The face *does* change: a daily Qi Se scan against your own baseline, day 1→4 calibration, guilt-free streak | **Adopt**; stronger than Co-Star's static chart |
| Advanced-reading IAPs | "Ask the Mirror" credits (deterministic) + framework deep-dives (progression) | **Adopt** |
| LLM-written prose | Deterministic corpus composition, $0 per user | **Kill.** Inference cost with no moat. |

**The moat AI competitors don't have.**
- **What it is:** a pinned, provenance-ledgered classical corpus.
  - Taiqing Shenjian folio locators
  - Kanripo KR3g0043–0046 witnesses (`src/heritage/evidence.js`, `docs/heritage-evidence/`)
  - an audit (`auditContentProvenance`) that knows which line comes from which book
- **How to use it:**
  1. Every quoted line shows **book + chapter** (L-05 already requires the locator).
  2. The listing and the share card say "quotes the actual manuals, with the page".
  3. Deep-dives (progression) are chapter-by-chapter walks through the real text.
- An AI app can imitate the voice but cannot show the folio.

**Primary persona** (owner ruling): women aged 22–35, relationship-motivated, AU/NZ/UK/CA, Android first.

**The one-sentence edge they repeat to a friend:** *"Scan your face and mine — it's all on our phones, nothing uploaded — and it shows what the old Chinese face manuals say about us, with the actual page."*

**Benchmarks (cited):**
- **Trial-to-paid:** median 39.9%; top decile 68.3%. This is Health & Fitness, the closest RevenueCat category. [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025)
- **Hard paywall vs freemium:** hard-paywall apps convert **10.7%** of installs to paid by day 35, against **2.1%** for freemium.
- **Revenue per install at day 60:** US$3.09 hard paywall vs US$0.38 freemium.
- **Annual plans:** ~72% churn in year 1. [RevenueCat 2026 benchmarks](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- **Play billing failures:** 31% of Play cancellations (App Store: 14%), from the same RevenueCat 2026 source. This argues for annual plans on Play.
- **The brief's ">90% of downloads churn inside 30 days":** no primary source found. Treated as Estimate: D30 retention of 5–10% for a new entertainment app.

**Funnel.** All values are net of 10% GST (Play and Apple remit it in AU) and the 15% store fee (Play's 15% tier, Apple's Small Business Program).

| Stage | Expected | Pessimistic | Basis |
|---|---|---|---|
| Install → consent granted | 75% | 55% | Estimate: two-screen consent |
| Consent → first reading | 70% | 50% | Estimate. M1a fixes the boot dead-end; the capture-success target is ≥85% in the device gate |
| First reading → paywall view (hard offer) | 100% of readers | 100% | By design |
| Paywall view → purchase (any product) | 8% | 4% | Estimate, bracketed by RevenueCat's 10.7% install-to-paid for hard paywalls |
| **Install → payer** | **4.2%** | **1.1%** | product of the rows above |
| D1 / D7 / D30 retention (of installs) | 30 / 15 / 8% | 20 / 8 / 4% | Estimate; the day 1→4 calibration anchor is the lever |
| 30-day retained payers | 85% | 70% | Estimate. Annual payers can't lapse inside 30 days, only refund. |

**Net value per payer, first 12 months.**

| Case | Payer mix | Net per payer |
|---|---|---|
| Expected | 55% annual (A$61.81 net) + 30% compatibility one-shot (A$7.72 net) + 15% Mirror packs (A$3.86 net), plus A$2 average add-on consumables | **A$38.9** |
| Pessimistic | 35% annual + 45% compatibility + 20% Mirror, no add-ons | **A$25.9** |

**Installs needed for A$1,000/month** (A$12,000/yr net):

| Case | Payers per year | Payers per month | Install → payer | **Installs per month** | Installs per day |
|---|---|---|---|---|---|
| Expected | 12,000 ÷ 38.9 = **309** | 26 | 4.2% | **~620** | ~21 |
| Pessimistic | 12,000 ÷ 25.9 = **463** | 39 | 1.1% | **~3,500** | ~117 |

**That number decides the channel.**
- Paid installs don't pay back:
  - Expected net per install = 4.2% × A$38.9 = **A$1.63**.
  - Estimate: AU/UK CPI for entertainment apps on Meta/TikTok is A$1.50–4.00, so expected payback is marginal at best and negative in the pessimistic case (A$0.28 per install).
- **The primary channel is organic ASO plus the viral compatibility loop.**
  - Each remote compatibility invite needs the friend to install.
  - Estimate: k-factor 0.2–0.4 if 30% of first readers send one invite and 30–50% of invitees install.
- **Paid spend is only a measurement budget:** A$300 once, to read real CPI and paywall conversion. No scale spend until net per install exceeds CPI.
- About 21 installs/day organically is plausible for a well-ranked niche listing in four markets. ~117/day is not without virality, which is why compatibility leads the listing.

---

## D3 — Retention of payers

**Habit anchor. Deterministic, $0 marginal cost, reuses what exists.**
1. **Day 1→4 calibration** is the anchor.
   - `planSegment` keeps one reading per calendar day (`src/qise/baseline.js`), so personal comparison opens on day 4.
   - Copy moves from waiting to mystique: "Your face is being learned. Scan 2 of 4 — the first personal shift opens on day 4."
   - Fix the 3-vs-4 off-by-one first (M1a).
2. **Daily Qi Se line** comes from the stored reading plus a calendar seed. It is already the design (`reflection-corpus.js` rotation). Variation must come from real data, never `Math.random` (the retention contract's novelty rule is kept).
3. **Guilt-free streak** (DR-2026-09-25-RETENTION-STREAK-REMINDER).
   - Shown as "N scans this week".
   - No loss copy, no broken-streak state, and a missed day is a gap.
4. **Opt-in `.ics` reminder offered at the paywall.**
   - A client-generated `RRULE:FREQ=DAILY` event at the user's chosen time, whose URL is the app deep link.
   - Zero backend and zero data.
   - Capacitor local notifications are the M3 upgrade. Superseded prior art: `codex/tier2-reading-repair`.
5. **The Reflection Engine as the public voice** (proposed DR) gives the "why" tab and per-day variation that the passage engine lacks.

No LLM is proposed. For the record:
- Estimate: a cheap model at ~US$0.0005 per 400-token reading, ×30/month, is US$15 per 1,000 MAU.
- Against an expected ARPU of A$38.9 × 4.2% ≈ A$1.63 per install per year, that is tolerable but unnecessary, and it breaks the "on-device" line.

**Social loop (zero backend).**
- Share card = quotable line + deep link (`https://<domain>/r?c=<compat-token>` → store badge, or open the app).
- **App Links need `/.well-known/assetlinks.json` at the origin root.** A GitHub Pages *project* site cannot serve that (`docs/ANDROID_SHIP_ROADMAP.md`), so a custom domain is on the D6 list.
- The OG preview card is rebuilt from the `codex/og-share-card` prior art.
- **A backend becomes worth it** when either:
  - (a) invite attribution is needed to steer more than A$2,000/month of paid spend; or
  - (b) more than 5% of support contacts ask for cross-device reading history.
- Neither happens before A$1,000/month.

**Progression and loss aversion (what a subscriber accumulates).**
- The personal colour column (7/14/30 readings).
- The unlocked framework deep-dives: Five Elements, Three Sections, Twelve Palaces, Five Officers, **chapter by chapter**. This is the marketing claim, answering the category's churn hole.
- Compatibility history.

**Storage-clear erasure.**
- Entitlements restore from the store account through RevenueCat `restorePurchases`, at no cost.
- Readings:
  - JSON export already exists (`store.exportAll()` → `qise-readings.json`).
  - M3 adds **import** of the same file.
  - The Capacitor shell stores data in the app sandbox, which the browser's "clear site data" doesn't touch; that makes it more durable than the PWA.
  - The encrypted user-owned cloud backup (`docs/BACKUP_ARCHIVE_FORMAT.md`) stays M4.

**Voice: current register vs blunt register.**
- Current (`src/qise/passages.js`): "It is a mild showing, close to where these readings normally sit." True, and unquotable.
- The rewrites below stay inside:
  - L-06: no "will", "destined", "fortune" as a claim, no measurement claims;
  - P1–P14: no character/wealth/lifespan claims about the reader;
  - `no-absolutes`: no cross-user comparison, no ITA.
- **Acceptance test (voice agent, M3):**
  - every reading model carries `quotableLine` (≤ 90 characters);
  - the share card renders it plus the deep link;
  - the line passes L-06, `tests/sensitive-inference.test.js` and `no-absolutes`.

| Surface | Blunt rewrite (quotable line in bold) |
|---|---|
| Daily Qi Se (red leads) | "Red is up on your cheeks — more than in your last four scans. The old manuals call that fire rising. **Fire rising: notice what you're running hot on.**" |
| Three Sections (middle longest) | "Your middle section is the longest of the three, 36% of your face in this scan. Mian Xiang reads that span as the years of making your own way. **The manuals put your middle chapter centre stage.**" |
| Wealth Palace (app-authored, L-05) | "The tip of the nose is the spot the old manuals named for money. We don't read money off a face. **So say it out loud: what would 'enough' look like?**" |

Engagement ideas carried from the superseded branch `customer-engagement-optimization-qlwm10`:
- "One region stood out today" (the lead palace, ranked by distance from your own baseline)
- a per-palace keynote on the closed card
- "a different region leads next time"

---

## D4 — Paywall and pricing spec

### §1 Catalogue and prices (proposed DR-2026-09-25-CATALOGUE-PRICING)

Prices are read from the store at runtime, never hard-coded.

| Product (RevenueCat entitlement) | Type | AUD | USD | Reasoning |
|---|---|---|---|---|
| **Annual, "Full Reading"** (entitlement `full`) — **primary** | auto-renew subscription | **A$79.99** | US$49.99 | L-03 already tested this number with the owner. Net A$61.81 after GST and 15%. Annual avoids Play's billing-failure churn. |
| Monthly (entitlement `full`) | auto-renew subscription | A$14.99 | US$9.99 | A price anchor, so annual reads as −56%. Not promoted. |
| **Two-face compatibility** | one-shot (non-consumable per pair; consumable SKU) | **A$9.99** | US$5.99 | The flagship impulse buy. Annual subscribers get it included. |
| Ask the Mirror, 5 answers | consumable | A$4.99 | US$2.99 | First answer free. Deterministic templates. |
| Ask the Mirror, 20 answers | consumable | A$14.99 | US$8.99 | Volume tier |
| Timed discount (after the first hard-offer dismiss) | first-year intro offer on the annual plan | A$49.99 for year 1 | US$29.99 | See "Timed discount rules" below |
| Lifetime | — | not at launch | — | L-03's A$34.99 lifetime undercut the subscription (v1 finding B-4) |

**Timed discount rules.**
- It is a genuine 24-hour window, **once per install**.
- The countdown is real: its expiry is stored locally, and it is never reset to fake urgency.
- Play and App Store intro offers are configured in RevenueCat Offerings.

**Trial.** Arm A (launch) is **no trial**. After 500 paywall views, arm B tests a 7-day free trial on the annual plan. Winner is chosen by net revenue per paywall view. The experiment is switched through RevenueCat Offerings; RevenueCat Experiments may need a paid tier (verify at M1c).

### §2 Paywall placement and sequence

1. **Hard offer:**
   - Screen: `screen-reading`.
   - Trigger: the **first** `renderReading()` after a completed scan.
   - Free before it: Three Sections, the Qi Se anchor and the Today line.
   - Paid (per `gateIntegratedModel`, `src/ui/qise/paywall.js`): the Five Elements frame, the canons, all twelve palaces, deep-dives, compatibility and Mirror beyond the first answer.
2. **Re-ask:** every tap on a locked feature opens the paywall scoped to that feature.
3. **Timed discount:** shown on the first dismiss of the hard offer, once per install.
4. **Opt-in `.ics` reminder** offered on the paywall, whether or not the user buys.

**Paywall copy (draft; must pass L-06 and P1–P14):**
- **Headline:** "Your face has more than three sections."
- **Sub:** "Unlock all twelve palaces, your Five Elements frame and the classical canons — quoted from the manuals, page and chapter. Scan anyone you like with Compatibility."
- **CTA:** "Start Full Reading — A$79.99/year". The price string comes from the store.
- **Secondary:** "Compare two faces — A$9.99".
- **Small print:** "Cultural entertainment, not a health or personality assessment. Renews yearly until cancelled in Google Play. Your face never leaves your device."

### §3 Receipt verification spec (M1c, implementation level)

- **Shell:** Capacitor 7 Android project under `android/`, reused as `ios/` in M2. Bundles `dist/`, so it works offline and loads the model same-origin from the app bundle.
- **Plugin:** `@revenuecat/purchases-capacitor`. Verify the Play Billing Library version it ships at build time; Play requires BL 8+ for new apps ([deprecation FAQ](https://developer.android.com/google/play/billing/deprecation-faq)).
- **Provider layer:** `src/billing/provider-revenuecat.js`.
  - `Purchases.configure({ apiKey })` runs **with no `appUserID`**, so the ID is anonymous.
  - `getOfferings()` → paywall model. It replaces `offers.js`'s Digital Goods read and keeps its refusal rules (no weekly).
  - `purchasePackage(pkg)` → the SDK acknowledges on-device. This kills B-1, and `ACKNOWLEDGEMENT_ROUTE = "revenuecat-sdk"`.
  - `getCustomerInfo()` → `entitlements.active.full`, mapped into `readEntitlement()`.
  - `restorePurchases()` sits behind a "Restore" link on the paywall.
  - The SDK caches `CustomerInfo` on device for offline grace.
- **Web PWA:** provider `none`. The paywall shows store badges and **never a purchase path** (owner ruling).
- **Falsification** (extends `scripts/billing-falsify.mjs`). New mutations, each of which must be caught:
  - V1: entitlement granted from the `purchasePackage` response rather than `CustomerInfo`
  - V2: `appUserID` set to anything non-anonymous
  - V3: an offering with a weekly period is displayed
  - V4: the web provider exposes a purchase call
  - V5: a network call carries anything beyond token, anonymous ID or product
- **Cost:**

  | Payers | MTR (Estimate) | RevenueCat fee |
  |---|---|---|
  | 100 | ~A$500 | **US$0** (free to US$2.5k MTR) |
  | 10,000 | ~US$33k | **~US$330/month** (1% above the free band) |

  Store fees are 15% either way. [RevenueCat pricing](https://www.revenuecat.com/pricing)
- **Maintenance:** ~0.5 h/month (dashboard, refunds via the store) plus ~2 h/quarter of Capacitor/plugin updates.

### §4 Two-face compatibility privacy path (specced before the catalogue locks)

- **Launch path: remote tokens only.** Each person scans **their own** face on **their own** phone. The inviter's share link carries a **derived compatibility token**:
  - element
  - bucketed three-section proportions
  - lead Qi Se colour
  - a version byte

  It carries no pixels, landmarks, raw measurements or identity.
- **Why this path first:**
  - No non-user's biometric data is ever processed. Each person consents on their own device, so **L10 is avoided at launch, not waived.**
  - Every compatibility read requires the friend to install, and that is the viral loop.
- **In-person path (friend present, one phone):**
  - The friend's frame runs through the same volatile pipeline.
  - Only the same derived token survives, and nothing is persisted beyond the comparison result.
  - The **friend** taps an explicit "I agree to be scanned" step.
  - **Held until L10 is answered** (`docs/LEGAL_PARALLEL_TRACK.md`).
- **The listing stays honest:** it advertises remote comparison only until the in-person path ships.
- Prior art: `copilot/dual-face-compatibility-loop`. It is not reused, because it URL-encoded reading data on the classic path.

### §5 Privacy-label changes (land with M1c, not before, so forms match the binary)

**Play Data safety.**

| Question | Before | After |
|---|---|---|
| Does your app collect or share user data? | "No" | "**Yes**" |
| Financial info → Purchase history | — | collected; not shared (RevenueCat is a service provider); required; purpose "App functionality" |
| App activity / identifiers | — | none added, provided no RevenueCat integrations are enabled ([RevenueCat Data safety guidance](https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety)) |
| Encrypted in transit | — | Yes |
| Deletion request | — | via support email; RevenueCat customer deletion |
| Photos/biometrics | No | **No**: the face never leaves the device |
| Health declaration (with Module B out of the store build) | — | no health features |

**Apple privacy label (M2).**
- Before: "Data Not Collected".
- After: **Purchases → Purchase History, not linked to the user, not used for tracking.** Anonymous app-user IDs are not linked to identity.
- Mark this Uncertain: confirm Apple's "linked" definition against RevenueCat's current iOS guidance at M2.

**Copy change**, in the same build: `README.md`, `src/index.html`, `src/qise.html` ("nothing reaches us" → "your face never leaves your device; purchases are verified by Google Play and RevenueCat"), and `src/privacy.html` (RevenueCat named as a processor; APP 8 overseas disclosure, see L9).

### §6 Analytics — resolves Card 9, supersedes `docs/ZKT_TELEMETRY_SCOPE.md` (proposed)

- **No first-party telemetry at M1.** The kill criteria come from:
  - **Play Console:** listing → installs, and D1/D7/D30 retention.
  - **RevenueCat:** paywall impressions if the paywall is rendered with RevenueCat Paywalls (verify the Capacitor UI plugin at M1c); purchases, refunds, churn.
- **Option B**, only if RevenueCat can't report paywall views: six **day-bucketed counters with no identifiers**, sent to a stateless Cloudflare Worker:
  - `first_open`
  - `consent_granted`
  - `scan_complete`
  - `paywall_view`
  - `paywall_dismiss`
  - `compat_invite_sent`

  This adds "App interactions: collected" to Data safety. It needs the owner's Card 9 approval.
- ZKT's device-performance telemetry stays unbuilt. The device gate replaces it.

---

## D5 — Execution

**Stack rule.** PR #1 is layer 1 and this M0 PR is layer 2. **M1a starts only after PR #1 merges** (two-layer rule, `AGENTS.md`).

| Milestone | Scope | Acceptance | Est. dev-days | Monthly maintenance |
|---|---|---|---|---|
| **M0** (this PR) | Base stack, branch triage, housekeeping, D1–D6, P1–P14 test | 1,433 tests green; build; lint; falsify 13/13 | done | 0 |
| **M1a** | Scanner fixes (a)–(g) + boot fix (row 14) + selfie message (row 23) + calibration off-by-one | See "M1a acceptance" below | 2–3 | 0 |
| **M1b** | Store-artefact flags: classic, `/beta/` and Module B out of the store build (`scripts/build.js` flavour `store`); `terms.html` fix; `check-release.js` L-05 treatment; Reflection public default; compliance answer drafts | See "M1b acceptance" below | 1–2 | 0 |
| **M1c** | Capacitor Android + RevenueCat provider + catalogue + paywall sequence + `.ics` reminder + remote compatibility tokens + copy change + store forms. **Play closed test (12 testers × 14 days) starts the day M1c builds.** | Billing falsify incl. V1–V5 all caught; debug AAB built (in CI if the container lacks the Android SDK); privacy copy matches the forms | 4–6 | ~0.5 h RevenueCat + ~1 h Play Console |
| **Release gate** | Device matrix **on Capacitor debug builds**; no browser evidence carries over | See the gate pass criteria below | 0 dev (tester time) | — |
| **M2** | iOS shell (same Capacitor project) + StoreKit 2 via RevenueCat + 4.3(b) defence | See M2 below | 3–4 | +0.5 h |
| **M3** | Voice rewrite (`quotableLine`), share card + deep link + OG card, streak, `.ics` → local notifications, Mirror credits (20 prototyped templates), deep-dives, JSON import | Quotable-line test; Mirror answers deterministic (same seed → same answer); zero inference cost | 5–8 | ~1 h content review |

**M1a acceptance.**
- Each fix has a test **shown failing against the unfixed code**.
- `selectSingleFace` and the timestamp-monotonicity test run on the live, selfie and beta paths.

**M1b acceptance.**
- The store `dist/` contains no `index.html?classic` route, no `beta/` and no referral path.
- The classic tests stay green.

**Release gate — device matrix.**

| Device class | Examples | Pass criteria |
|---|---|---|
| Android flagship | Pixel 8/9 or Galaxy S23+ | see below |
| Android mid | Galaxy A5x | see below |
| Android low-end | ≤3 GB RAM, e.g. Galaxy A1x / Moto G | see below |
| iPhone flagship + older (M2 only) | iPhone 15/16; iPhone 11/SE2 | see below |

Per device class:
- **≥85%** of scans reach a reading within 60 s of the camera opening, in ordinary indoor light (n ≥ 10 per device).
- **Single stable result:** the same person scanned 3× within 5 minutes gets an identical element and sections, and Qi Se within the noise floor.
- **Backgrounding, rotation, thermal:** a 5-minute continuous-scan soak, backgrounded mid-scan → recovers without a manual restart (after M1a fix c).
- **Permission revoked mid-scan** → fail-closed, with the correct copy.
- **Model-load failure** (a corrupted bundle build) → fail-closed, with the correct copy.
- **Two faces** → refusal every time.
- **Bad light** → abstention or the honest reduced-confidence note.
- **Deep skin in dim light:** capture success rate recorded separately per tone band (`rois.js` fairness note). A tone-band gap above 15 points blocks the gate.

**Device-matrix additions from M1a (owner directive, 25 September 2026).**

`e2e/beta-camera-integration.spec.js` holds the only four automated tests that drive the real camera → MediaPipe → gate pipeline. They run in CI's `browser` job (`npm run test:browser`) and passed 4/4 in the M1a session. But their fixture (`tests/fixtures/synthetic-face.y4m`) is a skin-toned ellipse, and MediaPipe finds no face in it. So the **face-dependent half of each test has never been executed by anything**. Each row below must be run on every device class above, on the Capacitor debug build:

| Automated test (what it proves on the ellipse) | Never executed; run on device |
|---|---|
| `synthetic camera feed genuinely attaches and MediaPipe initialises`: the stream attaches, the WASM runtime starts | MediaPipe returns a 478-point mesh for a real face, on the GPU delegate and on the CPU fallback |
| `gates evaluate real frames: gate line settles on a genuine face-detection instruction`: the gate line shows a real instruction; no reading appears | Gates move from red to green on a real face; the 650 ms hold completes; the 9-frame burst completes; a reading renders |
| `media stream termination: camera stops cleanly when capture ends or user aborts`: a reload drops the stream | The camera light goes off after a finished reading, after "Restart camera", and after backgrounding. After backgrounding, the capture restarts by itself (M1a fix c) |
| `gate feedback renders consistently as synthetic frames are processed`: the instruction never blanks | The instruction tracks real pose, distance and light changes on a real face, with no stalls or blank frames |

Plus the M1a fixes that no browser fixture can reach:
- **Two people in frame:** refused every time (fix a).
- **Face leaves and returns mid-hold or mid-burst:** no reading completes without a fresh hold (fix b).
- **Offline after an app update:** the scan still works (fix d: vendor precache).
- **Airplane mode on first scan:** the model-load copy is shown, not the camera-permission copy (fix d).
- **"Use this light anyway" under strongly coloured light:** it is not offered (fix e).
- **Mirrored selfie from a phone that saves mirrored:** with the toggle on, cheeks keep their sides (fix f).
- **Boot:** consent granted, app closed before the first reading, app reopened → the camera starts by itself (boot fix).

**M2 detail.**
- **4.3(b) defence:**
  - Position it as "Chinese face reading and face-colour journal".
  - The listing and keywords contain **no** "fortune", "horoscope", "astrology", "psychic", "destiny", "prediction" or "zodiac".
  - Screenshots lead with the on-device scanner, the 478-point mesh overlay, the personal colour column and compatibility.
  - Review notes explain on-device measurement and within-person baselines.
- **Two-strike kill:** two 4.3(b) rejections after repositioning → park iOS and keep Play revenue.

**Sequencing, with numbers.**
- M1a+b+c ≈ 7–11 dev-days. The Play closed test is 14 calendar days from the M1c build, and **the release gate runs inside that window on the same builds**, with the testers doubling as the device matrix. So the gate adds **0 calendar days** on Android.
- Charging before the gate is impossible anyway: Play production access needs the closed test for a personal account created after 13 Nov 2023 ([Play help](https://support.google.com/googleplay/android-developer/answer/14151465)).
- iPhone users are not served until M2, by owner ruling. A paywall behind an unproven iOS scanner is therefore structurally impossible.

**Kill criteria.**

1. **Copy/persona wrong.**
   - After **500 paywall views**, paywall-view → purchase (any product) is **<2%** (no-trial arm), or paywall-view → trial-start is **<5%** (trial arm).
   - Action: pivot the paywall copy and persona (RevenueCat remote paywall; no release needed) **before building anything else**.
   - Second trip after one pivot: test a single-screen consent (row 16).
2. **Scanner is the problem, not the marketing.** Any one of:
   - device-gate capture success <85% on any Android class;
   - any wrong result in the two-face test;
   - in the field: refunds >8% of purchases in the first 30 days, or >20% of 1–2★ reviews citing scan failure.
   - Action: **stop paid acquisition and pricing changes; fix the scanner first.**
3. **iOS.** Two 4.3(b) rejections after repositioning → park iOS.
4. **Channel.** After the A$300 measurement spend, if net per install is below 0.5 × CPI → no paid scale. Stay on ASO plus compatibility.

**Agents (hub and spoke; briefs from `docs/agents/*.md`).** One component, branch, PR and acceptance test each. They never self-approve.

| Agent | Brief | Milestone |
|---|---|---|
| Scanner | `scanner-engineer.md` | M1a |
| Compliance | `compliance-auditor.md` + `release-gatekeeper.md` | M1b, M2 defence doc |
| Commerce | `commerce-entitlements.md` | M1c |
| Voice | `experience-director.md` | M3 |
| Retention | `daily-loop-program-architect.md` | M3 (Mirror, streak, `.ics`, deep-dives) |
| Heritage | `corpus-research-editor.md` | L8 execution |

**Legal decision rules (conservative option taken; no lawyer).**

| Item | Rule |
|---|---|
| L7 | EU stays excluded until answered |
| L8 | If the Kanripo CC BY-SA terms can't be met with attribution + share-alike, the affected passages fall back to app-authored interpretation |
| L9 | Name RevenueCat and the US transfer in the privacy policy (APP 8.1 disclosure) |
| L10 | Remote-token compatibility only, until answered |

---

## D6 — Human-only checklist (nothing collects money until these are done)

1. **Merge PR #1, then retarget and merge this M0 PR to `main`.** M1a is blocked on this by the two-layer rule.
2. After both merge: push the `archive/<name>` tags and delete the branches exactly as `docs/BRANCH_TRIAGE_2026-09-25.md` lists, or tell Claude to do it.
3. **Decide the public brand before creating any product** (v1 B-8: "SpiritMaxx" vs "Mien Shiang"). Store product IDs are permanent.
4. **Play Console:**
   - Create the developer account. If it is a personal account created after 13 Nov 2023, **start recruiting 12 closed-testers now**: the 14-day clock starts at the M1c build.
   - Set up the payments/merchant profile.
   - Set countries to AU/NZ/UK/CA; EU and US stay excluded.
   - Set the content rating, target audience 18+, the Entertainment category, and the Health declaration "no health features".
5. **RevenueCat:**
   - Create the account and project.
   - Link the Play service-account credentials.
   - Create the products and base plans from D4 §1 in Play, and the offerings and entitlement `full` in RevenueCat.
6. ~~Approve or reject the proposed DR entries~~ **Done, 25 Sep 2026:** all six are approved (`DR-2026-09-25-SIX-PROPOSALS-APPROVED`). CATALOGUE-PRICING is approved **as structure only; no price points are approved**, and those stay pending the D4 lock.
7. **Buy a custom domain** and point the web funnel at it. App Links need `assetlinks.json` at the origin root; a GitHub Pages project site can't serve it.
8. **Run the device matrix** on the M1c debug build with the closed testers. Include deep-skin participants in dim light, and log results against the gate criteria.
9. **Confirm the EU posture** (recommended: stay excluded).
10. **Legal track (L7–L10):** answer or accept the conservative defaults above.
11. **M2 only:**
    - Apple Developer Program (US$99/yr).
    - A Mac or a macOS CI runner for the build.
    - App Store Connect agreements, tax and banking.
    - The listing, written to the 4.3(b) defence.
12. Write the support email and privacy contact into `src/privacy.html`; the owner supplies them.

---

## Self-audit (struck before publishing)

- Struck "the corpus is a remarkable asset"; replaced with how it sells (page-and-chapter on the card and listing).
- Struck "compatibility should perform well"; replaced with the k-factor estimate and the install-dependency mechanism.
- Struck Co-Star's single revenue figure; replaced with the two contested estimates and "don't plan against either".
- Struck ">90% churn in 30 days" as a cited fact; there is no primary source, so it is labelled as an estimate.
- Struck "consider a trial"; replaced with the arm-B trigger (500 paywall views) and the decision metric.

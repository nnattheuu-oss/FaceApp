# Owner Decisions — Launch v1 (Google Play)

Status: DECIDED by owner (M), 23 Sep 2026. Delegated drafting to Claude; owner accepted by instructing execution.
Scope: v1 release only. Where an earlier entry in docs/DECISION_REGISTER.md conflicts AND is listed under "Supersedes" below, this file wins for v1. Any conflict NOT listed here → agent STOPs and reports; it does not resolve it.

Recorded verbatim from the owner's instruction of 23 September 2026. Register entry:
`DR-2026-09-23-LAUNCH-V1` in `docs/DECISION_REGISTER.md`. Implementation status and the conflicts
this record did not resolve: `docs/LAUNCH_V1_AUDIT.md`.

---

## L-01 Platform and markets
- **Decision:** Google Play only (TWA via Bubblewrap). Countries: **Australia, New Zealand, United Kingdom, Canada.**
- **Excluded for v1:** all EU/EEA countries, United States, everything else.
- **Why:** EU exclusion removes EU AI Act Art 50/Art 5 exposure for v1. US exclusion removes state App Store Accountability Act obligations (Texas law in force since the Fifth Circuit stayed the injunction, June 2026; fines up to US$10,000 per violation) until age-signal handling is built.
- **Re-entry conditions:** US once Play age-signal handling + per-IAP age rating is implemented and reviewed. EU once Art 50(3) notice and Art 5(1)(g) review are complete. (Consent/notice copy in 03 is already written to EU standard, so re-entry cost is low.)
- **iOS:** deferred (Guideline 4.3(b)). Not in v1.

## L-02 Audience and category
- Target audience: **18+ only**. App is not designed for or marketed to children.
- Play category: **Entertainment.**

## L-03 Monetisation (supersedes the monetisation doc TL;DR, which contradicts its own decision table)
| Product ID | Type | Base price | Billing |
|---|---|---|---|
| `spiritmaxx_full_reading_lifetime` | In-app product (non-consumable) | AUD 34.99 | One time |
| `spiritmaxx_qi` base plan `quarterly` | Subscription | AUD 24.99 | Every 3 months, auto-renew |
| `spiritmaxx_qi` base plan `annual` | Subscription | AUD 79.99 | Every year, auto-renew |
- **No weekly plan. No free trial. No introductory offers in v1.**
- **13 weeks → 3 months.** Play base plans use standard periods; a 13-week period is not expected to be available. Uncertain: confirm in Play Console when creating the base plan; if "3 months" is offered, use it. All copy says "every 3 months", never "13 weeks" or "each season" alone.
- Prices shown in-app are read from Play (localised per country), never hard-coded.
- Paywall: **hard**, placed after scan + Three Courts + Qi Se baseline (free), before full trait mapping + Twelve Palaces (paid).

## L-04 Sharing
- v1 ships "Share your reading card" (Web Share API; download fallback).
- **No reward for sharing in v1.** No share-to-unlock. Removes incentivised-install/share policy risk and protects the hard paywall.

## L-05 Heritage presentation (supersedes: source-promotion gates and dossier freeze as launch blockers)
- Every reading carries the label: **"SpiritMaxx interpretation, inspired by classical Mien Shiang."**
- A line may be presented as a direct classical quotation ONLY if it comes from the four Kanripo WYG texts (KR3g0043–0046) and carries the locator (text + juan + section). Everything else is presented as SpiritMaxx's own interpretation.
- Consequences:
  - Hash/folio/rights/dossier-freeze gates are **research-track**, not launch gates. They continue in the background; they do not block v1.
  - Cross-family combinations are **permitted** as app-authored synthesis under the L-05 label. They must never be described as traditional.
  - Five Mountains may render as a **symbolic** reading. Copy must never claim measured height, depth, projection, or bone structure.
  - 神相全編 material may appear only as app-authored interpretation, not as quotation.
  - Four Rivers locator correction applies to any quoted line: 太清神鑑 **卷二** (not 卷一).

## L-06 Content gate (the ONLY content gate for v1)
A reading string ships if it passes the existing lexicon lint (`scripts/copy-scan.js`) for:
1. Health / medical / diagnostic vocabulary.
2. Prediction / divination / guarantee vocabulary ("will", "destined", "fortune", "predict" as claims about the user).
3. Belief attribution ("you believe", "you are religious/spiritual") — kept because EU Art 5(1)(g) prohibits inferring religious/philosophical beliefs from biometrics, and it protects EU re-entry.
4. Measurement claims (depth, bone, height, "measured", "scientifically").
Evidence-strength of the heritage claim is NOT a v1 gate (covered by L-05 labelling).

## L-07 Reading engine
- Ship whichever engine produces a complete reading end-to-end on device. If both work, ship the Reflection Engine (`src/qise/*`).
- If Module A (`src/reading/*`) ships, all its strings must pass L-06. Its 26 evidence-deficient claims are not blockers under L-05.

## L-08 Qi Se
- Within-subject only: compared with the user's own previous scans. Never a score, never health, never "better/worse".
- In-app lighting caveat required (copy in 03).
- No streaks, no loss-guilt, no comparison with other users.

## L-09 Data
- **No user data leaves the device in v1.** No analytics SDK, no crash reporter, no backend.
- Funnel metrics come from Play Console (store listing conversion, installs) and Play order reports only.
- If the repo currently makes any network call carrying user data → agent STOPs.

## L-10 Testing standard
- Falsification-first (test demonstrated to fail when the code it covers is broken) is REQUIRED for: scanner pipeline, consent gate, billing/entitlement.
- NOT required for copy/corpus changes; the lexicon lint is sufficient there.

## L-11 Android build
- `targetSdkVersion` **36**. Play requires new apps to target Android 16 (API 36) from 31 Aug 2026. The Bubblewrap template has been reported to ship 35 → must be bumped.
- Play App Signing on. Owner holds the upload key.

## Supersedes (for v1 only)
- Monetisation doc TL;DR "AUD $8.99/week" → L-03.
- Monetisation doc "$24.99 every 13 weeks" → "every 3 months" (L-03).
- Monetisation doc Path A share-to-unlock → L-04.
- Heritage research gates as release blockers (20 Aug audit recommendations 2–3, 23 Aug addendum §6) → L-05. Owner chose §6 option 1 + app-authored labelling.
- `RESEARCH DOSSIER NOT READY TO FREEZE` as a launch blocker → research-track only.

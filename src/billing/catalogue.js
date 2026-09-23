/*
 * Launch v1 product catalogue. Owner decision L-03, recorded as
 * DR-2026-09-23-LAUNCH-V1 in docs/DECISION_REGISTER.md.
 *
 * --- WHAT THIS FILE IS ------------------------------------------------------
 * The ONLY place a product ID, a billing period or a paid/free split is
 * written down. Everything else asks this file. A price is deliberately NOT
 * here: prices are read from Google Play at runtime (localised per country)
 * and never hard-coded, so the AUD base prices in the decision record exist
 * only as documentation of what the Play Console should hold.
 *
 * --- WHAT v1 DOES NOT SELL, AND HOW THAT IS ENFORCED -------------------------
 * No weekly plan, no free trial, no introductory offer (L-03). An offer that
 * arrives from Play carrying any of those is REFUSED by offers.js rather than
 * shown, because the copy around it would then be false: "every 3 months"
 * beside a weekly period, or a price beside a trial nobody disclosed.
 *
 * --- MODULE B IS NEVER A PAID FEATURE ----------------------------------------
 * No safety/referral surface appears in FEATURES. hasFeature() in
 * entitlements.js answers true for anything not listed as paid, so a Module B
 * surface cannot become gated by being forgotten here. See
 * MODULE_B_IS_NEVER_MONETISED in flags.js.
 *
 * ASCII only, for the same reason as flags.js: it is the file most likely to
 * be edited by a release script.
 */

/** Payment method identifier for Google Play Billing inside a TWA. */
export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

export const FEATURE = Object.freeze({
  // Free in v1 (L-03): scan + Three Sections + Qi Se baseline.
  SCAN: "scan",
  THREE_SECTIONS: "three-sections",
  QI_SE_BASELINE: "qi-se-baseline",
  // Paid in v1 (L-03): behind the hard paywall.
  FULL_TRAIT_MAPPING: "full-trait-mapping",
  TWELVE_PALACES: "twelve-palaces",
});

/** Features behind the paywall. Anything not listed here is free. */
export const PAID_FEATURES = Object.freeze([
  FEATURE.FULL_TRAIT_MAPPING,
  FEATURE.TWELVE_PALACES,
]);

/*
 * The launch SKUs. `periods` is the set of ISO 8601 billing periods this
 * catalogue will display for a subscription; Play is the source of the
 * period actually attached to an offer, and anything outside this set is
 * refused (a 13-week or weekly period included -- L-03 "13 weeks -> 3 months").
 *
 * `grants` is which paid features an ACTIVE purchase of the item unlocks.
 *
 * OWNER CONFIRMATION NEEDED (recorded in docs/LAUNCH_V1_AUDIT.md, finding
 * B-4): L-03 names the subscription `spiritmaxx_qi` but does not say what it
 * grants beyond the lifetime product. It is mapped here to the same paid
 * features, because gating any further existing free behaviour (for example
 * post-baseline Qi Se readings) would be a product decision nobody has made.
 */
export const PRODUCTS = Object.freeze([
  Object.freeze({
    id: "spiritmaxx_full_reading_lifetime",
    kind: "product",
    label: "Full reading",
    periods: Object.freeze([]),
    grants: Object.freeze([FEATURE.FULL_TRAIT_MAPPING, FEATURE.TWELVE_PALACES]),
  }),
  Object.freeze({
    id: "spiritmaxx_qi",
    kind: "subscription",
    label: "Qi subscription",
    // quarterly base plan -> P3M, annual base plan -> P1Y.
    periods: Object.freeze(["P3M", "P1Y"]),
    grants: Object.freeze([FEATURE.FULL_TRAIT_MAPPING, FEATURE.TWELVE_PALACES]),
  }),
]);

export const PRODUCT_IDS = Object.freeze(PRODUCTS.map((p) => p.id));

export function productById(id) {
  return PRODUCTS.find((p) => p.id === id) ?? null;
}

/** Plain-language renewal wording. Only periods v1 sells have one. */
export const PERIOD_WORDING = Object.freeze({
  P3M: "every 3 months",
  P1Y: "every year",
});

/*
 * Purchase acknowledgement route.
 *
 * Google Play refunds and revokes any purchase not acknowledged within three
 * days. The Digital Goods API (v2.0+) has NO client-side acknowledge; Chrome's
 * guidance is to acknowledge from a backend via the Play Developer API. L-09
 * forbids a backend in v1. Those two decisions cannot both hold as written, so
 * this stays null until the owner picks a route (docs/LAUNCH_V1_AUDIT.md,
 * finding B-1), and while it is null purchase() refuses to start.
 *
 * Taking money that is automatically handed back 72 hours later -- and
 * revoking the reading the person thought they bought -- is worse than a
 * paywall that says purchases are not open yet.
 *
 * Allowed values once decided: "native-wrapper" (the TWA's Android code
 * acknowledges on-device via BillingClient.acknowledgePurchase) or "backend".
 */
export const ACKNOWLEDGEMENT_ROUTE = null;

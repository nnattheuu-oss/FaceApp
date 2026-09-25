/*
 * Entitlement: who has paid for what, as Google Play says it right now.
 *
 * --- THE SOURCE OF TRUTH IS PLAY, EVERY TIME ----------------------------------
 * Access is derived from `listPurchases()` on the Digital Goods service, on
 * every read. Nothing is cached on the device: no flag, no timestamp, no
 * "last known good". The shareGate.js latch this replaces stored its unlock in
 * localStorage, where anyone with devtools could grant it to themselves in one
 * line. That was acceptable for a share count; it is not acceptable once money
 * changes hands (docs/agents/commerce-entitlements.md: "Do not fake durable
 * entitlement with an unprotected local flag").
 *
 * Play's own client keeps purchases available offline, so reading them each
 * time costs a paying user nothing in ordinary use. When Play genuinely cannot
 * be reached the answer is `unverifiable` with NO paid features, and the UI
 * says it could not check -- never that the person has not paid.
 *
 * --- THREE STATES THAT MUST STAY APART ----------------------------------------
 *   unsupported   -- no Digital Goods API here (a plain browser, not the Play
 *                    build). A platform fact. Purchases are not offered.
 *   unverifiable  -- the API exists but Play could not be asked. A transient
 *                    condition on this device. Retry is offered.
 *   verified      -- Play answered. `entitlement` is what it said.
 * Collapsing unsupported and unverifiable is the same mistake as
 * zoneNotExtracted/colourNotMeasurable (CLAUDE.md item 23) and
 * unsupported/failed on the wake lock (item 52): two different causes, two
 * different fixes, one of them invisible.
 *
 * --- INJECTED, NOT IMPORTED ---------------------------------------------------
 * Every browser object arrives as an argument, for the reason
 * createLandmarkerWithFallback() takes its factory (CLAUDE.md item 14): the
 * paths that matter -- no API, a throwing API, a refunded purchase -- are the
 * ones a developer machine never takes.
 *
 * ASCII only (see catalogue.js).
 */

import { PLAY_BILLING_METHOD, PAID_FEATURES, productById } from "./catalogue.js";

export const BILLING = Object.freeze({
  UNSUPPORTED: "unsupported",
  UNVERIFIABLE: "unverifiable",
  VERIFIED: "verified",
});

export const NO_ENTITLEMENT = Object.freeze({
  items: Object.freeze([]),
  features: Object.freeze([]),
});

/**
 * Connect to Play Billing through the Digital Goods API.
 * @param {object} env window-shaped; only `getDigitalGoodsService` is read.
 * @returns {Promise<{state: string, service: object|null, reason?: string}>}
 */
export async function connectBilling(env = globalThis) {
  if (typeof env?.getDigitalGoodsService !== "function") {
    return { state: BILLING.UNSUPPORTED, service: null, reason: "no-digital-goods-api" };
  }
  try {
    const service = await env.getDigitalGoodsService(PLAY_BILLING_METHOD);
    if (!service) return { state: BILLING.UNVERIFIABLE, service: null, reason: "no-service" };
    return { state: BILLING.VERIFIED, service };
  } catch (error) {
    // Chrome throws when the page is not running inside a TWA whose Android
    // wrapper has Play Billing enabled. Reported, never swallowed.
    console.warn("Play Billing is not reachable from this page.", error);
    return { state: BILLING.UNVERIFIABLE, service: null, reason: error?.name || "error" };
  }
}

/**
 * Pure: the entitlement a list of Play purchases confers.
 *
 * Unknown item IDs are ignored rather than trusted: a purchase of something
 * this catalogue does not sell grants nothing. Features are recomputed from
 * the catalogue, so a purchase record can never name its own grant.
 */
export function entitlementFromPurchases(purchases) {
  const items = new Set();
  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (p && typeof p.itemId === "string" && productById(p.itemId)) items.add(p.itemId);
  }
  const features = new Set();
  for (const id of items) for (const f of productById(id).grants) features.add(f);
  return Object.freeze({
    items: Object.freeze([...items].sort()),
    features: Object.freeze([...features].sort()),
  });
}

/**
 * Ask Play what this account currently owns.
 * @returns {Promise<{status: string, entitlement: object, reason?: string}>}
 */
export async function readEntitlement(connection) {
  if (!connection || connection.state === BILLING.UNSUPPORTED) {
    return { status: BILLING.UNSUPPORTED, entitlement: NO_ENTITLEMENT };
  }
  if (!connection.service || typeof connection.service.listPurchases !== "function") {
    return { status: BILLING.UNVERIFIABLE, entitlement: NO_ENTITLEMENT,
      reason: connection.reason || "no-service" };
  }
  try {
    const purchases = await connection.service.listPurchases();
    return { status: BILLING.VERIFIED, entitlement: entitlementFromPurchases(purchases) };
  } catch (error) {
    console.warn("Could not read purchases from Google Play.", error);
    return { status: BILLING.UNVERIFIABLE, entitlement: NO_ENTITLEMENT,
      reason: error?.name || "error" };
  }
}

/**
 * Is a feature available under this entitlement?
 *
 * Free features answer true for everyone, whatever the entitlement says --
 * including null. A paid feature needs an entitlement that names it. Anything
 * not in PAID_FEATURES is free by construction, which is what keeps Module B
 * (never monetised) out of the paywall even if nobody remembers to list it.
 */
export function hasFeature(entitlement, feature) {
  if (!PAID_FEATURES.includes(feature)) return true;
  return Array.isArray(entitlement?.features) && entitlement.features.includes(feature);
}

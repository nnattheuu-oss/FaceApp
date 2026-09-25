/*
 * The purchase flow: Payment Request with Play as the method, then Play is
 * asked again what the account owns.
 *
 * --- THE RESPONSE IS NOT THE ENTITLEMENT ---------------------------------------
 * A resolved PaymentResponse means the sheet closed with a token. It does not
 * mean the purchase is complete (it may be pending) or that it will survive
 * (an unacknowledged purchase is refunded after three days). Access is granted
 * only by a fresh listPurchases() read, never by the response object.
 *
 * --- IT REFUSES TO START WITHOUT AN ACKNOWLEDGEMENT ROUTE ---------------------
 * See ACKNOWLEDGEMENT_ROUTE in catalogue.js and finding B-1 in
 * docs/LAUNCH_V1_AUDIT.md. The refusal happens BEFORE the payment sheet opens,
 * which is the only point at which refusing costs the person nothing.
 *
 * ASCII only (see catalogue.js).
 */

import { ACKNOWLEDGEMENT_ROUTE, PLAY_BILLING_METHOD, productById } from "./catalogue.js";
import { readEntitlement, hasFeature } from "./entitlements.js";

export const PURCHASE = Object.freeze({
  PURCHASED: "purchased",
  PENDING: "pending",
  CANCELLED: "cancelled",
  FAILED: "failed",
  REFUSED: "refused",
  UNSUPPORTED: "unsupported",
});

const ROUTES = new Set(["native-wrapper", "backend"]);

/**
 * @param {string} itemId a catalogue product ID
 * @param {object} deps
 * @param {object} deps.connection result of connectBilling()
 * @param {object} [deps.env] window-shaped; reads PaymentRequest
 * @param {string|null} [deps.acknowledgementRoute]
 * @param {Function} [deps.acknowledge] required when the route is "backend"
 */
export async function purchase(itemId, {
  connection, env = globalThis, acknowledgementRoute = ACKNOWLEDGEMENT_ROUTE, acknowledge,
} = {}) {
  const product = productById(itemId);
  if (!product) return { status: PURCHASE.REFUSED, reason: "not-in-catalogue" };
  if (!ROUTES.has(acknowledgementRoute)) {
    return { status: PURCHASE.REFUSED, reason: "acknowledgement-route-undecided" };
  }
  if (acknowledgementRoute === "backend" && typeof acknowledge !== "function") {
    return { status: PURCHASE.REFUSED, reason: "no-acknowledger" };
  }
  if (typeof env?.PaymentRequest !== "function" || !connection?.service) {
    return { status: PURCHASE.UNSUPPORTED, reason: "no-play-billing" };
  }

  let response;
  try {
    const request = new env.PaymentRequest(
      [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: itemId } }],
      // Play shows its own localised price; this total is a required
      // placeholder of the Payment Request API and is never displayed.
      { total: { label: "Total", amount: { currency: "AUD", value: "0" } } },
    );
    response = await request.show();
  } catch (error) {
    if (error?.name === "AbortError") return { status: PURCHASE.CANCELLED };
    console.warn("The Play purchase sheet failed.", error);
    return { status: PURCHASE.FAILED, reason: error?.name || "error" };
  }

  const purchaseToken = response?.details?.purchaseToken;
  if (typeof purchaseToken !== "string" || !purchaseToken) {
    await response?.complete?.("fail");
    return { status: PURCHASE.FAILED, reason: "no-purchase-token" };
  }

  if (acknowledgementRoute === "backend") {
    try {
      await acknowledge({ itemId, purchaseToken });
    } catch (error) {
      console.warn("The purchase could not be acknowledged.", error);
      await response.complete("fail");
      // Unacknowledged: Play refunds it automatically. Say so, do not grant.
      return { status: PURCHASE.FAILED, reason: "acknowledgement-failed" };
    }
  }
  await response.complete("success");

  const read = await readEntitlement(connection);
  const granted = product.grants.every((f) => hasFeature(read.entitlement, f));
  return { status: granted ? PURCHASE.PURCHASED : PURCHASE.PENDING, read };
}

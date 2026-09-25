/*
 * The hard paywall (L-03), as pure functions so a test can reach it.
 *
 * `app.js` cannot be imported under node --test (CLAUDE.md items 18a, 44), so
 * the two decisions that make this a HARD paywall live here instead:
 *
 *   1. gateIntegratedModel() REMOVES paid content from the view model before
 *      any markup is built. Locked content is absent from the DOM, not blurred
 *      over it. The classic flow's blurred overlay rendered the paid text into
 *      the page and hid it with CSS; "view source" was the unlock. A blurred
 *      report behind a local flag is theatre (docs/ANDROID_SHIP_ROADMAP.md).
 *   2. paywallModel() decides what the paywall may offer from Play's own
 *      answer. No price is written here; an offer Play did not price is not
 *      shown; and while purchases cannot be acknowledged (catalogue.js
 *      ACKNOWLEDGEMENT_ROUTE) the paywall says purchases are not open rather
 *      than taking money Play will refund three days later.
 *
 * Free in v1: the scan, Three Sections, the Qi Se baseline.
 * Paid in v1: full trait mapping (Five Elements frame, proportion canons) and
 * the Twelve Palaces.
 */

import { FEATURE } from "../../billing/catalogue.js";
import { hasFeature, BILLING } from "../../billing/entitlements.js";

/**
 * @param {object} model integratedReadingModel() output
 * @param {object|null} entitlement from readEntitlement()
 */
export function gateIntegratedModel(model, entitlement) {
  if (!model?.available) return model;
  const traitMapping = !hasFeature(entitlement, FEATURE.FULL_TRAIT_MAPPING);
  const palaces = !hasFeature(entitlement, FEATURE.TWELVE_PALACES);
  const gated = { ...model, locks: Object.freeze({ traitMapping, palaces }) };
  if (traitMapping) {
    // The headline, synthesis and frame line all name the element, so they go
    // with it. Three Sections (free) keeps its own fields untouched.
    gated.element = null;
    gated.headline = null;
    gated.synthesis = null;
    gated.frameLine = null;
    gated.harmony = null;
  }
  if (palaces) {
    // Counts only. No name, location, interpretation or status survives.
    gated.palaces = Object.freeze({
      locked: true,
      totalCount: model.palaces?.totalCount ?? 12,
    });
  }
  return gated;
}

export const PAYWALL_COPY = Object.freeze({
  heading: "The full reading",
  body: "Your Three Sections and colour baseline are free. The full reading adds the Five Elements frame, the proportion canons and all twelve palaces.",
  pricesFromPlay: "Prices are shown by Google Play in your currency.",
  notOpen: "Purchases are not open yet. Your free reading is complete as it stands.",
  unsupported: "The full reading is sold only through the app on Google Play.",
  unverifiable: "Google Play could not be reached to check your purchases. Your free reading is unaffected.",
  noOffers: "Prices could not be loaded from Google Play just now.",
  retry: "Check again",
  restore: "Already bought it? Check your purchases",
});

/**
 * @param {object} input
 * @param {string} input.billingStatus BILLING.* from readEntitlement()
 * @param {Array}  input.offers        offersFromDetails().offers
 * @param {boolean} input.purchasesOpen an acknowledgement route is configured
 */
export function paywallModel({ billingStatus, offers = [], purchasesOpen = false }) {
  if (billingStatus === BILLING.UNSUPPORTED) {
    return { state: "unsupported", message: PAYWALL_COPY.unsupported, offers: [] };
  }
  if (billingStatus !== BILLING.VERIFIED) {
    return { state: "unverifiable", message: PAYWALL_COPY.unverifiable, offers: [], retry: true };
  }
  if (!purchasesOpen) {
    return { state: "not-open", message: PAYWALL_COPY.notOpen, offers: [] };
  }
  if (!offers.length) {
    return { state: "no-offers", message: PAYWALL_COPY.noOffers, offers: [], retry: true };
  }
  return {
    state: "offers",
    message: PAYWALL_COPY.pricesFromPlay,
    offers: offers.map((o) => ({
      itemId: o.itemId,
      title: o.title,
      priceText: o.priceText,
      terms: o.autoRenews
        ? `Renews automatically ${o.renewal} until cancelled in Google Play.`
        : "One payment. Yours to keep on this Google account.",
    })),
    restore: true,
  };
}

/** String renderer. `esc` is injected so this file owns no escaping policy. */
export function paywallMarkup(model, esc) {
  const offers = model.offers.map((o) =>
    `<div class="paywall-offer">
       <button type="button" class="primary wide" data-buy="${esc(o.itemId)}">${esc(o.title)} · ${esc(o.priceText)}</button>
       <p class="muted">${esc(o.terms)}</p>
     </div>`).join("");
  return `<section class="structure-section paywall" data-paywall-state="${esc(model.state)}" aria-labelledby="paywall-h">
      <p class="eyebrow">Full reading</p>
      <h2 id="paywall-h">${esc(PAYWALL_COPY.heading)}</h2>
      <p>${esc(PAYWALL_COPY.body)}</p>
      ${offers}
      <p class="muted" role="status" aria-live="polite" data-paywall-status>${esc(model.message)}</p>
      ${model.retry ? `<button type="button" data-paywall-retry>${esc(PAYWALL_COPY.retry)}</button>` : ""}
      ${model.restore ? `<button type="button" data-paywall-retry>${esc(PAYWALL_COPY.restore)}</button>` : ""}
    </section>`;
}

const PURCHASE_MESSAGES = Object.freeze({
  purchased: "Thank you. The full reading is open.",
  pending: "Google Play is still processing this purchase. The full reading opens once Play confirms it.",
  cancelled: "Purchase cancelled. Nothing was charged.",
  failed: "The purchase did not complete. If a payment cannot be confirmed, Google Play refunds it automatically.",
  refused: PAYWALL_COPY.notOpen,
  unsupported: PAYWALL_COPY.unsupported,
});

/** What the paywall says after a purchase attempt. Unknown states read as failed. */
export function purchaseMessage(status) {
  return PURCHASE_MESSAGES[status] ?? PURCHASE_MESSAGES.failed;
}

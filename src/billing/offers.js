/*
 * What the paywall may offer, built from what Google Play reports.
 *
 * Prices are Play's, localised per country (L-03: "never hard-coded"). This
 * file never supplies a price of its own; an item Play did not price is not
 * offered.
 *
 * --- REFUSE, DO NOT RELABEL ---------------------------------------------------
 * The paywall copy states the renewal period and says nothing about trials.
 * If Play reports an offer the catalogue does not sell -- a weekly or 13-week
 * period, a free trial, an introductory price -- that copy would be false next
 * to it. So the offer is REFUSED, with a reason, rather than rendered with the
 * wording bent to fit. A refused offer is a Play Console misconfiguration to
 * fix, and it is reported so somebody can.
 *
 * ASCII only (see catalogue.js).
 */

import { PRODUCTS, PERIOD_WORDING, productById } from "./catalogue.js";

const ORDER = new Map(PRODUCTS.flatMap((p) =>
  p.kind === "product" ? [[p.id, 0]] : p.periods.map((period, i) => [`${p.id}:${period}`, 1 + i])));

function formatPrice(price, locale) {
  if (!price || typeof price.currency !== "string") return null;
  const value = Number(price.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(value);
  } catch {
    return null; // an unknown currency code: not offered rather than mis-rendered
  }
}

/**
 * Pure. Turn Digital Goods `getDetails()` output into offers.
 * @param {Array} details ItemDetails from Play
 * @param {{locale?: string}} options
 * @returns {{offers: Array, refused: Array<{itemId: string, reason: string}>}}
 */
export function offersFromDetails(details, { locale = "en-AU" } = {}) {
  const offers = [];
  const refused = [];
  for (const d of Array.isArray(details) ? details : []) {
    const itemId = d?.itemId;
    const product = productById(itemId);
    const refuse = (reason) => refused.push({ itemId: String(itemId), reason });
    if (!product) { refuse("not-in-catalogue"); continue; }
    if (d.type && d.type !== product.kind) { refuse("type-mismatch"); continue; }
    if (d.freeTrialPeriod) { refuse("free-trial-not-sold-in-v1"); continue; }
    if (d.introductoryPrice || d.introductoryPricePeriod) { refuse("introductory-offer-not-sold-in-v1"); continue; }

    let period = null;
    if (product.kind === "subscription") {
      period = d.subscriptionPeriod;
      if (!product.periods.includes(period)) { refuse(`period-not-sold:${period ?? "missing"}`); continue; }
    } else if (d.subscriptionPeriod) {
      refuse("one-time-product-reported-a-period"); continue;
    }

    const priceText = formatPrice(d.price, locale);
    if (!priceText) { refuse("no-usable-price"); continue; }

    offers.push(Object.freeze({
      itemId,
      kind: product.kind,
      title: product.label,
      period,
      priceText,
      renewal: product.kind === "subscription" ? PERIOD_WORDING[period] : "one time",
      autoRenews: product.kind === "subscription",
    }));
  }
  offers.sort((a, b) =>
    (ORDER.get(a.period ? `${a.itemId}:${a.period}` : a.itemId) ?? 99)
    - (ORDER.get(b.period ? `${b.itemId}:${b.period}` : b.itemId) ?? 99));
  return { offers, refused };
}

/**
 * Ask Play for the catalogue's items and build offers from the answer.
 * Refusals are logged so a Console misconfiguration is visible, not silent.
 */
export async function loadOffers(connection, { locale } = {}) {
  if (!connection?.service || typeof connection.service.getDetails !== "function") {
    return { offers: [], refused: [], status: "unavailable" };
  }
  try {
    const details = await connection.service.getDetails(PRODUCTS.map((p) => p.id));
    const result = offersFromDetails(details, { locale });
    if (result.refused.length) console.warn("Play offers refused by the v1 catalogue:", result.refused);
    return { ...result, status: "ok" };
  } catch (error) {
    console.warn("Could not load prices from Google Play.", error);
    return { offers: [], refused: [], status: "unavailable" };
  }
}

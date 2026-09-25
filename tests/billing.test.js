/*
 * Play Billing entitlement, offers and purchase flow (DR-2026-09-23-LAUNCH-V1,
 * L-03, L-09, L-10).
 *
 * L-10 requires billing/entitlement tests to be FALSIFICATION-FIRST: each must
 * be shown to fail when the code it covers is broken. The mutation record for
 * this file -- which mutation, which test caught it -- is in
 * docs/LAUNCH_V1_AUDIT.md under "Falsification record", and
 * scripts/billing-falsify.mjs re-runs every mutation on demand.
 *
 * Every browser object is a hand-built fake passed as an argument; nothing
 * here touches a global.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCTS, PRODUCT_IDS, PAID_FEATURES, FEATURE, PLAY_BILLING_METHOD,
  ACKNOWLEDGEMENT_ROUTE,
} from "../src/billing/catalogue.js";
import {
  connectBilling, readEntitlement, entitlementFromPurchases, hasFeature, BILLING,
} from "../src/billing/entitlements.js";
import { offersFromDetails } from "../src/billing/offers.js";
import { purchase, PURCHASE } from "../src/billing/purchase.js";
import { gateIntegratedModel, paywallModel, purchaseMessage } from "../src/ui/qise/paywall.js";

const LIFETIME = "spiritmaxx_full_reading_lifetime";
const QI = "spiritmaxx_qi";

const service = ({ purchases = [], details = [], listThrows = null } = {}) => ({
  calls: [],
  async listPurchases() {
    this.calls.push("listPurchases");
    if (listThrows) throw listThrows;
    return typeof purchases === "function" ? purchases() : purchases;
  },
  async getDetails(ids) { this.calls.push(["getDetails", ids]); return details; },
});
const connected = (svc) => ({ state: BILLING.VERIFIED, service: svc });

// ───────────────────────────────────────────────────────── catalogue (L-03) ─

test("the catalogue is exactly the three L-03 offers, with no weekly plan", () => {
  assert.deepEqual(PRODUCT_IDS, [LIFETIME, QI]);
  const lifetime = PRODUCTS.find((p) => p.id === LIFETIME);
  const qi = PRODUCTS.find((p) => p.id === QI);
  assert.equal(lifetime.kind, "product");
  assert.deepEqual([...lifetime.periods], []);
  assert.equal(qi.kind, "subscription");
  assert.deepEqual([...qi.periods], ["P3M", "P1Y"]);
  for (const p of PRODUCTS) {
    for (const period of p.periods) assert.doesNotMatch(period, /W|D$/, `${p.id}: no weekly or day-count period`);
  }
  assert.equal(PLAY_BILLING_METHOD, "https://play.google.com/billing");
});

test("the paid features are exactly full trait mapping and the Twelve Palaces", () => {
  assert.deepEqual([...PAID_FEATURES].sort(), [FEATURE.FULL_TRAIT_MAPPING, FEATURE.TWELVE_PALACES].sort());
  for (const free of [FEATURE.SCAN, FEATURE.THREE_SECTIONS, FEATURE.QI_SE_BASELINE]) {
    assert.equal(hasFeature(null, free), true, `${free} is free in v1`);
  }
});

test("Module B surfaces can never be a paid feature", () => {
  // MODULE_B_IS_NEVER_MONETISED: anything not listed as paid is free, so a
  // safety surface cannot become gated by being forgotten.
  for (const name of ["safety-referral", "module-b", "consent-withdrawal", "data-export", "data-deletion"]) {
    assert.equal(hasFeature(null, name), true, name);
  }
  assert.ok(!PAID_FEATURES.some((f) => /safety|referral|consent|export|delet/i.test(f)));
});

// ───────────────────────────────────────────────────────────── entitlement ─

test("no purchase, no paid feature: a null or empty entitlement fails CLOSED", () => {
  for (const ent of [null, undefined, {}, { features: "twelve-palaces" }, entitlementFromPurchases([])]) {
    assert.equal(hasFeature(ent, FEATURE.TWELVE_PALACES), false);
    assert.equal(hasFeature(ent, FEATURE.FULL_TRAIT_MAPPING), false);
  }
});

test("each owned product grants exactly its catalogue features", () => {
  const life = entitlementFromPurchases([{ itemId: LIFETIME, purchaseToken: "t1" }]);
  assert.deepEqual([...life.items], [LIFETIME]);
  assert.equal(hasFeature(life, FEATURE.TWELVE_PALACES), true);
  assert.equal(hasFeature(life, FEATURE.FULL_TRAIT_MAPPING), true);

  const qi = entitlementFromPurchases([{ itemId: QI, purchaseToken: "t2" }]);
  assert.equal(hasFeature(qi, FEATURE.TWELVE_PALACES), true);
});

test("an item this catalogue does not sell grants nothing, however it is named", () => {
  const ent = entitlementFromPurchases([
    { itemId: "spiritmaxx_weekly", purchaseToken: "x" },
    { itemId: "twelve-palaces", purchaseToken: "x" },
    { itemId: "SPIRITMAXX_FULL_READING_LIFETIME", purchaseToken: "x" },
    { itemId: 42 }, null, "spiritmaxx_qi",
  ]);
  assert.deepEqual([...ent.items], []);
  assert.equal(hasFeature(ent, FEATURE.TWELVE_PALACES), false);
});

test("a purchase record cannot name its own grant", () => {
  const ent = entitlementFromPurchases([{ itemId: LIFETIME, grants: ["everything"], features: ["x"] }]);
  assert.deepEqual([...ent.features].sort(), [FEATURE.FULL_TRAIT_MAPPING, FEATURE.TWELVE_PALACES].sort());
});

test("entitlement is re-read from Play every time, so a refund revokes at once", async () => {
  let owned = [{ itemId: LIFETIME, purchaseToken: "t" }];
  const svc = service({ purchases: () => owned });
  const first = await readEntitlement(connected(svc));
  assert.equal(hasFeature(first.entitlement, FEATURE.TWELVE_PALACES), true);

  owned = []; // refunded / revoked / subscription lapsed
  const second = await readEntitlement(connected(svc));
  assert.equal(second.status, BILLING.VERIFIED);
  assert.equal(hasFeature(second.entitlement, FEATURE.TWELVE_PALACES), false,
    "a revoked purchase must not survive in any cache");
  assert.equal(svc.calls.filter((c) => c === "listPurchases").length, 2);
});

test("nothing about who paid is written to device storage", async () => {
  const writes = [];
  const storage = { setItem: (k, v) => writes.push([k, v]), getItem: () => null };
  const g = globalThis;
  const had = Object.prototype.hasOwnProperty.call(g, "localStorage");
  const prior = g.localStorage;
  g.localStorage = storage;
  try {
    await readEntitlement(connected(service({ purchases: [{ itemId: LIFETIME, purchaseToken: "t" }] })));
  } finally {
    if (had) g.localStorage = prior; else delete g.localStorage;
  }
  assert.deepEqual(writes, []);
});

test("unsupported and unverifiable are different states, and both grant nothing", async () => {
  const none = await connectBilling({});
  assert.equal(none.state, BILLING.UNSUPPORTED);
  const r1 = await readEntitlement(none);
  assert.equal(r1.status, BILLING.UNSUPPORTED);

  const warn = console.warn; console.warn = () => {};
  try {
    const refused = await connectBilling({ getDigitalGoodsService: async () => { throw new DOMException("no", "NotSupportedError"); } });
    assert.equal(refused.state, BILLING.UNVERIFIABLE);
    assert.equal(refused.reason, "NotSupportedError");

    const offline = await readEntitlement(connected(service({ listThrows: new Error("offline") })));
    assert.equal(offline.status, BILLING.UNVERIFIABLE);
    assert.equal(hasFeature(offline.entitlement, FEATURE.TWELVE_PALACES), false,
      "an unreachable Play must not read as paid");
  } finally { console.warn = warn; }
});

test("connectBilling asks for the Play Billing method and nothing else", async () => {
  const asked = [];
  const conn = await connectBilling({ getDigitalGoodsService: async (m) => { asked.push(m); return service(); } });
  assert.equal(conn.state, BILLING.VERIFIED);
  assert.deepEqual(asked, ["https://play.google.com/billing"]);
});

// ────────────────────────────────────────────────────────────────── offers ─

const detail = (over) => ({
  itemId: LIFETIME, title: "Full reading", price: { currency: "AUD", value: "34.99" }, ...over,
});

test("offers use Play's price and currency, never one of ours", () => {
  const { offers, refused } = offersFromDetails([
    detail({ price: { currency: "GBP", value: "17.99" } }),
    detail({ itemId: QI, type: "subscription", subscriptionPeriod: "P3M", price: { currency: "GBP", value: "12.99" } }),
  ], { locale: "en-GB" });
  assert.deepEqual(refused, []);
  assert.equal(offers.length, 2);
  assert.equal(offers[0].priceText, "£17.99");
  assert.equal(offers[1].priceText, "£12.99");
  assert.equal(offers[1].renewal, "every 3 months");
  assert.doesNotMatch(JSON.stringify(offers), /34\.99|24\.99|79\.99/, "no hard-coded AUD price");
});

test("a weekly, 13-week or day-count period from Play is refused, not relabelled", () => {
  for (const period of ["P1W", "P13W", "P91D", "P1M", undefined]) {
    const { offers, refused } = offersFromDetails([
      detail({ itemId: QI, type: "subscription", subscriptionPeriod: period, price: { currency: "AUD", value: "8.99" } }),
    ]);
    assert.equal(offers.length, 0, `period ${period} must not be offered`);
    assert.match(refused[0].reason, /^period-not-sold/);
  }
});

test("a free trial or introductory offer from Play is refused (none in v1)", () => {
  const trial = offersFromDetails([detail({ itemId: QI, type: "subscription", subscriptionPeriod: "P1Y", freeTrialPeriod: "P7D" })]);
  assert.equal(trial.offers.length, 0);
  assert.equal(trial.refused[0].reason, "free-trial-not-sold-in-v1");
  const intro = offersFromDetails([detail({ itemId: QI, type: "subscription", subscriptionPeriod: "P1Y", introductoryPrice: { currency: "AUD", value: "1" } })]);
  assert.equal(intro.offers.length, 0);
  assert.equal(intro.refused[0].reason, "introductory-offer-not-sold-in-v1");
});

test("an unpriced, zero-priced or unknown item is not offered", () => {
  const { offers, refused } = offersFromDetails([
    detail({ price: null }), detail({ price: { currency: "AUD", value: "0" } }),
    detail({ price: { currency: "NOTACODE", value: "1" } }), detail({ itemId: "spiritmaxx_weekly" }),
  ]);
  assert.equal(offers.length, 0);
  assert.deepEqual(refused.map((r) => r.reason),
    ["no-usable-price", "no-usable-price", "no-usable-price", "not-in-catalogue"]);
});

test("renewal wording is 'every 3 months', never 13 weeks or a season", () => {
  const { offers } = offersFromDetails([detail({ itemId: QI, type: "subscription", subscriptionPeriod: "P3M" })]);
  const terms = paywallModel({ billingStatus: BILLING.VERIFIED, offers, purchasesOpen: true }).offers[0].terms;
  assert.match(terms, /every 3 months/);
  assert.match(terms, /Renews automatically/);
  assert.doesNotMatch(terms, /week|season/i);
});

// ─────────────────────────────────────────────────────────────── purchase ─

function fakePaymentRequest({ token = "tok", showThrows = null } = {}) {
  const log = { constructed: [], completed: [] };
  class PaymentRequest {
    constructor(methods, details) { log.constructed.push({ methods, details }); }
    async show() {
      if (showThrows) throw showThrows;
      return { details: { purchaseToken: token }, complete: async (r) => { log.completed.push(r); } };
    }
  }
  return { PaymentRequest, log };
}

test("purchase REFUSES to open the sheet while no acknowledgement route exists", async () => {
  // Play refunds unacknowledged purchases after three days (finding B-1).
  const { PaymentRequest, log } = fakePaymentRequest();
  const r = await purchase(LIFETIME, {
    connection: connected(service()), env: { PaymentRequest }, acknowledgementRoute: null,
  });
  assert.equal(r.status, PURCHASE.REFUSED);
  assert.equal(r.reason, "acknowledgement-route-undecided");
  assert.equal(log.constructed.length, 0, "the payment sheet must never open");
});

test("the shipped configuration has no acknowledgement route yet (finding B-1)", () => {
  // Flip this deliberately, with the owner's decision recorded, not to get green.
  assert.equal(ACKNOWLEDGEMENT_ROUTE, null);
});

test("an unknown product is refused before the sheet opens", async () => {
  const { PaymentRequest, log } = fakePaymentRequest();
  const r = await purchase("spiritmaxx_weekly", {
    connection: connected(service()), env: { PaymentRequest }, acknowledgementRoute: "native-wrapper",
  });
  assert.equal(r.status, PURCHASE.REFUSED);
  assert.equal(log.constructed.length, 0);
});

test("a completed sheet grants access only once Play lists the purchase", async () => {
  const { PaymentRequest, log } = fakePaymentRequest();
  // Play has not (yet) listed it: a pending purchase, not an unlock.
  const pending = await purchase(LIFETIME, {
    connection: connected(service({ purchases: [] })), env: { PaymentRequest },
    acknowledgementRoute: "native-wrapper",
  });
  assert.equal(pending.status, PURCHASE.PENDING);
  assert.equal(hasFeature(pending.read.entitlement, FEATURE.TWELVE_PALACES), false);

  const done = await purchase(LIFETIME, {
    connection: connected(service({ purchases: [{ itemId: LIFETIME, purchaseToken: "tok" }] })),
    env: { PaymentRequest }, acknowledgementRoute: "native-wrapper",
  });
  assert.equal(done.status, PURCHASE.PURCHASED);
  assert.deepEqual(log.constructed[0].methods, [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: LIFETIME } }]);
  assert.deepEqual(log.completed, ["success", "success"]);
});

test("a backend route acknowledges BEFORE completing, and a failed acknowledgement grants nothing", async () => {
  const order = [];
  const { PaymentRequest } = fakePaymentRequest();
  const Wrapped = class extends PaymentRequest {
    async show() {
      const r = await super.show();
      return { ...r, complete: async (x) => { order.push(`complete:${x}`); } };
    }
  };
  const ok = await purchase(QI, {
    connection: connected(service({ purchases: [{ itemId: QI, purchaseToken: "tok" }] })),
    env: { PaymentRequest: Wrapped }, acknowledgementRoute: "backend",
    acknowledge: async ({ itemId, purchaseToken }) => { order.push(`ack:${itemId}:${purchaseToken}`); },
  });
  assert.equal(ok.status, PURCHASE.PURCHASED);
  assert.deepEqual(order, ["ack:spiritmaxx_qi:tok", "complete:success"]);

  order.length = 0;
  const warn = console.warn; console.warn = () => {};
  try {
    const failed = await purchase(QI, {
      connection: connected(service({ purchases: [{ itemId: QI, purchaseToken: "tok" }] })),
      env: { PaymentRequest: Wrapped }, acknowledgementRoute: "backend",
      acknowledge: async () => { throw new Error("down"); },
    });
    assert.equal(failed.status, PURCHASE.FAILED);
    assert.equal(failed.reason, "acknowledgement-failed");
    assert.deepEqual(order, ["complete:fail"]);
  } finally { console.warn = warn; }
});

test("a backend route with no acknowledger is refused before the sheet opens", async () => {
  const { PaymentRequest, log } = fakePaymentRequest();
  const r = await purchase(LIFETIME, {
    connection: connected(service()), env: { PaymentRequest }, acknowledgementRoute: "backend",
  });
  assert.equal(r.reason, "no-acknowledger");
  assert.equal(log.constructed.length, 0);
});

test("cancel, failure and a missing token are distinct and never grant", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const base = { connection: connected(service({ purchases: [{ itemId: LIFETIME, purchaseToken: "t" }] })), acknowledgementRoute: "native-wrapper" };
    const cancel = await purchase(LIFETIME, { ...base, env: fakePaymentRequest({ showThrows: new DOMException("x", "AbortError") }) });
    assert.equal(cancel.status, PURCHASE.CANCELLED);
    const fail = await purchase(LIFETIME, { ...base, env: fakePaymentRequest({ showThrows: new DOMException("x", "NotSupportedError") }) });
    assert.equal(fail.status, PURCHASE.FAILED);
    const { PaymentRequest, log } = fakePaymentRequest({ token: "" });
    const noToken = await purchase(LIFETIME, { ...base, env: { PaymentRequest } });
    assert.equal(noToken.status, PURCHASE.FAILED);
    assert.equal(noToken.reason, "no-purchase-token");
    assert.deepEqual(log.completed, ["fail"]);
    for (const r of [cancel, fail, noToken]) assert.equal(r.read, undefined, "no entitlement read on a failed purchase");
  } finally { console.warn = warn; }
});

test("no Payment Request API means unsupported, not an attempted purchase", async () => {
  const r = await purchase(LIFETIME, { connection: connected(service()), env: {}, acknowledgementRoute: "native-wrapper" });
  assert.equal(r.status, PURCHASE.UNSUPPORTED);
});

// ───────────────────────────────────────────────────────── hard paywall ─

const integratedModel = () => ({
  available: true,
  headline: "Chi today, over Earth",
  synthesis: "reads as Earth structure",
  frameLine: "square geometry · Upper",
  element: { name: "Earth", shape: "square", reading: "ELEMENT-PROSE", sourcesDiffer: "x" },
  courts: { label: "Upper", percentages: { upper: 34 } },
  palaces: {
    all: [{ key: "life", name: "Life Palace", interpretation: { interpretation: "PALACE-PROSE" } }],
    measuredCount: 1, totalCount: 12,
  },
  harmony: { label: "60% alignment", components: [] },
});

test("locked: paid content is REMOVED from the view model, not hidden", () => {
  const gated = gateIntegratedModel(integratedModel(), null);
  assert.deepEqual({ ...gated.locks }, { traitMapping: true, palaces: true });
  const json = JSON.stringify(gated);
  for (const leak of ["ELEMENT-PROSE", "PALACE-PROSE", "Earth", "Life Palace", "60% alignment"]) {
    assert.ok(!json.includes(leak), `paid content survived gating: ${leak}`);
  }
  assert.equal(gated.courts.label, "Upper", "Three Sections stays free");
  assert.equal(gated.palaces.totalCount, 12);
});

test("entitled: the model passes through intact", () => {
  const ent = entitlementFromPurchases([{ itemId: LIFETIME }]);
  const gated = gateIntegratedModel(integratedModel(), ent);
  assert.deepEqual({ ...gated.locks }, { traitMapping: false, palaces: false });
  assert.equal(gated.element.reading, "ELEMENT-PROSE");
  assert.equal(gated.palaces.all[0].interpretation.interpretation, "PALACE-PROSE");
});

test("the paywall never offers anything while purchases are not open or Play is unreachable", () => {
  const { offers } = offersFromDetails([detail({})]);
  assert.equal(paywallModel({ billingStatus: BILLING.VERIFIED, offers, purchasesOpen: false }).offers.length, 0);
  assert.equal(paywallModel({ billingStatus: BILLING.UNVERIFIABLE, offers, purchasesOpen: true }).offers.length, 0);
  assert.equal(paywallModel({ billingStatus: BILLING.UNSUPPORTED, offers, purchasesOpen: true }).offers.length, 0);
  const open = paywallModel({ billingStatus: BILLING.VERIFIED, offers, purchasesOpen: true });
  assert.equal(open.state, "offers");
  assert.equal(open.offers[0].priceText, "$34.99", "en-AU renders AUD with a bare dollar sign");
});

test("an unverifiable Play says it could not check, never that nothing was bought", () => {
  const m = paywallModel({ billingStatus: BILLING.UNVERIFIABLE });
  assert.match(m.message, /could not be reached/);
  assert.equal(m.retry, true);
  assert.equal(purchaseMessage("mystery"), purchaseMessage("failed"));
  assert.match(purchaseMessage("failed"), /refunds it automatically/);
});

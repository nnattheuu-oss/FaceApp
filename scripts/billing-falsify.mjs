#!/usr/bin/env node
/*
 * Falsification record for the billing/entitlement/paywall tests (L-10).
 *
 * L-10: "Falsification-first (test demonstrated to fail when the code it
 * covers is broken) is REQUIRED for ... billing/entitlement." A green test
 * proves nothing on its own; this script breaks the code on purpose, one
 * defect at a time, and requires the named test to go RED. Then it restores
 * the file byte for byte.
 *
 *   node scripts/billing-falsify.mjs
 *
 * Exit 0 only if EVERY mutation was caught AND the unmutated suite is green
 * (the positive control -- a runner that fails everything would otherwise
 * "catch" every mutation). A mutation whose search string no longer exists is
 * a failure too: it means the record has drifted from the code.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const MUTATIONS = [
  {
    id: "M1 every feature free",
    file: "src/billing/entitlements.js",
    find: "if (!PAID_FEATURES.includes(feature)) return true;",
    replace: "return true;",
    test: "tests/billing.test.js",
    expect: "no purchase, no paid feature",
  },
  {
    id: "M2 unknown items trusted",
    file: "src/billing/entitlements.js",
    find: 'if (p && typeof p.itemId === "string" && productById(p.itemId)) items.add(p.itemId);',
    replace: 'if (p && typeof p.itemId === "string") items.add(p.itemId);',
    test: "tests/billing.test.js",
    expect: "an item this catalogue does not sell grants nothing",
  },
  {
    id: "M3 unreachable Play read as verified",
    file: "src/billing/entitlements.js",
    find: "return { status: BILLING.UNVERIFIABLE, entitlement: NO_ENTITLEMENT,\n      reason: error?.name || \"error\" };",
    replace: "return { status: BILLING.VERIFIED, entitlement: entitlementFromPurchases([{ itemId: \"spiritmaxx_full_reading_lifetime\" }]) };",
    test: "tests/billing.test.js",
    expect: "unsupported and unverifiable are different states",
  },
  {
    id: "M4 purchase without an acknowledgement route",
    file: "src/billing/purchase.js",
    find: "if (!ROUTES.has(acknowledgementRoute)) {",
    replace: "if (false) {",
    test: "tests/billing.test.js",
    expect: "purchase REFUSES to open the sheet",
  },
  {
    id: "M5 grant from the payment response, not from Play",
    file: "src/billing/purchase.js",
    find: "status: granted ? PURCHASE.PURCHASED : PURCHASE.PENDING",
    replace: "status: PURCHASE.PURCHASED",
    test: "tests/billing.test.js",
    expect: "a completed sheet grants access only once Play lists the purchase",
  },
  {
    id: "M6 any subscription period offered",
    file: "src/billing/offers.js",
    find: "if (!product.periods.includes(period)) { refuse(`period-not-sold:${period ?? \"missing\"}`); continue; }",
    replace: "",
    test: "tests/billing.test.js",
    expect: "a weekly, 13-week or day-count period",
  },
  {
    id: "M7 free trial offered",
    file: "src/billing/offers.js",
    find: "if (d.freeTrialPeriod) { refuse(\"free-trial-not-sold-in-v1\"); continue; }",
    replace: "",
    test: "tests/billing.test.js",
    expect: "a free trial or introductory offer",
  },
  {
    id: "M8 element prose survives the paywall",
    file: "src/ui/qise/paywall.js",
    find: "    gated.element = null;\n",
    replace: "",
    test: "tests/billing.test.js",
    expect: "locked: paid content is REMOVED",
  },
  {
    id: "M9 palaces survive the paywall",
    file: "src/ui/qise/paywall.js",
    find: "  if (palaces) {\n    // Counts only.",
    replace: "  if (false) {\n    // Counts only.",
    test: "tests/billing.test.js",
    expect: "locked: paid content is REMOVED",
  },
  {
    id: "M10 weekly period added to the catalogue",
    file: "src/billing/catalogue.js",
    find: 'periods: Object.freeze(["P3M", "P1Y"]),',
    replace: 'periods: Object.freeze(["P3M", "P1Y", "P1W"]),',
    test: "tests/billing.test.js",
    expect: "the catalogue is exactly the three L-03 offers",
  },
  {
    id: "M11 share card ignores the entitlement",
    file: "src/ui/qise/share.js",
    find: "newest && hasFeature(entitlement, FEATURE.FULL_TRAIT_MAPPING)",
    replace: "newest",
    test: "tests/qise/share.test.js",
    expect: "without a purchase the share card carries no structural line",
  },
  {
    id: "M12 classic view renders paid sections while locked",
    file: "src/readingview.js",
    find: "  if (locked) {\n    return `<div class=\"reading\">",
    replace: "  if (false) {\n    return `<div class=\"reading\">",
    test: "tests/readingview.test.js",
    expect: "does NOT put paid content in the DOM",
  },
  {
    id: "M13 classic share card shows the element while locked",
    file: "src/sharecard.js",
    find: "shapeLine: unlocked && fe?.available",
    replace: "shapeLine: fe?.available",
    test: "tests/sharecard-modes.test.js",
    expect: "the locked card carries the teaser, CTA and caveat, and NO paid trait mapping",
  },
];

function run(testFile) {
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", testFile], { cwd: ROOT, encoding: "utf8" });
  const out = `${r.stdout}\n${r.stderr}`;
  const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  const passed = [...out.matchAll(/^ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { status: r.status, failed, passed };
}

let ok = true;
const files = [...new Set(MUTATIONS.map((m) => m.test))];
for (const f of files) {
  const base = run(f);
  const good = base.status === 0 && base.failed.length === 0 && base.passed.length > 0;
  console.log(`${good ? "PASS" : "FAIL"} positive control  ${f}: ${base.passed.length} passed, ${base.failed.length} failed`);
  if (!good) ok = false;
}

for (const m of MUTATIONS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.find)) {
    console.log(`FAIL ${m.id}: search string not found in ${m.file} -- the record has drifted`);
    ok = false;
    continue;
  }
  try {
    writeFileSync(path, original.replace(m.find, m.replace));
    const r = run(m.test);
    const caught = r.failed.some((name) => name.includes(m.expect));
    console.log(`${caught ? "CAUGHT" : "MISSED"} ${m.id} -> ${caught ? `"${m.expect}"` : `failed: ${JSON.stringify(r.failed)}`}`);
    if (!caught) ok = false;
  } finally {
    writeFileSync(path, original);
  }
}

console.log(ok ? `\nAll ${MUTATIONS.length} mutations caught; positive controls green.` : "\nFALSIFICATION FAILED");
process.exit(ok ? 0 : 1);

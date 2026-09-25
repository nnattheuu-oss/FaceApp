/*
 * M1a row 15 (docs/MONETISATION_AUDIT_2026-09.md, restriction sweep): the
 * calibration screen's anchor count must be the count the ENGINE uses.
 *
 * interpretReading needs CALIBRATING_READINGS (3) prior readings, and
 * computeBaseline holds out the BASELINE_EXCLUDE_RECENT (3) most recent ones,
 * so the first personal comparison is reading FIVE: readings 1-4 calibrate.
 * The screen was built for four and assumed the comparison came on reading
 * four, so, measured before this fix:
 *
 *   reading 3: "One more anchor scan will reveal change."   (it did not)
 *   reading 4: "Your personal comparison is ready."          (no compass exists)
 *              "0 more comparable scans will unlock..."
 *   share:     "One mark. Three more to reveal what changes." (four more)
 *
 * The habit loop D3 builds on is exactly this promise, so a broken count is a
 * broken promise on the fourth day. The engine is not changed here: holding
 * out recent readings is a measurement decision. The copy follows the engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { interpretReading } from "../../src/qise/baseline.js";
import { calibrationModel } from "../../src/ui/qise/screens.js";

const metrics = { hueVector: { a: 14, b: 12 }, meanL: 62, meanChroma: 18, periorbitalL: 55, basis: "x" };
const day = (i) => new Date(Date.UTC(2026, 6, 1 + i)).toISOString();
const history = (n) => Array.from({ length: n }, (_, i) => ({
  timestampIso: day(i), valid: true, baselineVersion: "v2", captureClass: "auto",
  axes: { a: 14, b: 12, L: 62, C: 18, periorbitalL: 55, ming: 10, run: 20 },
}));

/** Reading N (1-based) as the app sees it: N-1 prior readings, N stored. */
function readingAt(n) {
  const today = interpretReading(metrics, history(n - 1));
  const tomorrow = interpretReading(metrics, history(n));
  const ui = calibrationModel({ timestampIso: day(n - 1), compass: today.compass }, history(n));
  return { today, tomorrow, ui };
}

const engineAnchors = (() => {
  let n = 1;
  while (interpretReading(metrics, history(n - 1)).state !== "read") n++;
  return n - 1;
})();

test("precondition: the engine calibrates four readings and compares on the fifth", () => {
  assert.equal(engineAnchors, 4);
});

test("the screen counts the anchors the engine actually needs", () => {
  assert.equal(readingAt(1).ui.required, engineAnchors);
});

for (let n = 1; n <= 6; n++) {
  test(`reading ${n}: the calibration copy tells the truth about the next scan`, () => {
    const { today, tomorrow, ui } = readingAt(n);
    const text = `${ui.title} ${ui.verdict}`;
    if (!today.compass) {
      assert.equal(ui.active, true);
      assert.doesNotMatch(text, /comparison is ready|pattern is ready/i,
        `reading ${n} has no comparison, but the screen says one is ready`);
    }
    if (ui.active) {
      const nextCompares = tomorrow.state === "read";
      assert.equal(ui.remaining === 1, nextCompares,
        `reading ${n}: remaining=${ui.remaining} but the next scan ${nextCompares ? "does" : "does not"} compare`);
      if (!nextCompares) {
        assert.doesNotMatch(text, /reveal change|next scan (is|will)/i,
          `reading ${n} promises the next scan reveals change; it is still an anchor`);
      }
    }
  });
}

test("no screen hard-codes the anchor count", () => {
  const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /of 4 anchor|\/ 4 anchors|length: 4 \}, \(_, index\)/,
    "the progress dots and count must come from calibration.required");
  assert.doesNotMatch(app, /baselineProgress: Math\.min\(4,/);
  const share = readFileSync(new URL("../../src/ui/qise/share.js", import.meta.url), "utf8");
  assert.doesNotMatch(share, /Three more to reveal/);
  const screens = readFileSync(new URL("../../src/ui/qise/screens.js", import.meta.url), "utf8");
  assert.doesNotMatch(screens, /anchor \$\{current\} of 4\b/);
});

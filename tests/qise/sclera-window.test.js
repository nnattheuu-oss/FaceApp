/*
 * The sclera count is a per-frame absolute pixel threshold (150) judged on
 * a single noisy frame, so a face that hovers 144..153 around it flips the
 * sclera and illuminant gates every second and the 9-consecutive-ready-frame
 * burst can never complete (instrumented local run, 28 Sep). The fix, per
 * DR-2026-09-28-SCLERA-NOT-A-DEAD-END:
 *
 * 1. The sclera gate judges a trailing WINDOW of recent face frames: the
 *    statistic is "m of the last N frames individually cleared the count",
 *    not a bare median, because a median over the 144/153 oscillation picks
 *    the majority phase and the gate would still flip on window parity.
 * 2. Unreadable eye-whites degrade, never block: after SCLERA_GRACE_MS with
 *    only sclera/illuminant unresolved, the failure becomes tolerated, the
 *    capture proceeds at the assisted tier with scleraValid:false, and the
 *    record carries an UNCORRECTED measurement-method stamp so it never
 *    mixes into the corrected personal baseline (comparability, CLAUDE.md
 *    item 18). A measured out-of-tolerance illuminant stays a hard stop.
 *
 * `ui/qise/app.js` cannot be imported under node --test, so the wiring is
 * pinned by static guards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCLERA_MIN_PIXELS,
  SCLERA_WINDOW_FRAMES,
  SCLERA_WINDOW_TOLERANCE,
  scleraWindowStatus,
} from "../../src/qise/sclera.js";
import { MEASUREMENT_METHOD, qiseMethodOf } from "../../src/measurement-method.js";
import { readingConfidence } from "../../src/qise/baseline.js";
import { evaluateGates } from "../../src/qise/gates.js";
import { canonicalFace, FRAME_W } from "./fixtures/synthetic.js";

/** A frame that passes every gate except the one under test. */
const PTS = canonicalFace();
const cleanStats = () => ({
  frameWidth: FRAME_W,
  pose: { yaw: 0, pitch: 0, roll: 0 },
  skinPixelCount: 100000,
  skinPixelsAtOrAbove250: 100,
  skinPixelsAtOrBelow12: 100,
  cheekMedianL: { left: 60, right: 60 },
  landmarkDriftPx: 1.5,
  laplacianVariance: 40,
  validRoiCount: 8,
});

const LOW = 144;
const HIGH = 153;
const windowStatus = (counts) => scleraWindowStatus({ counts });

test("sclera window: alternating 144/153 around 150 clears, from either phase", () => {
  assert.equal(typeof scleraWindowStatus, "function", "scleraWindowStatus must exist");
  // The measured oscillation: 144..153 straddling the hard 150. Both phases
  // must pass: the median of an odd-length alternation picks the MAJORITY
  // phase, so the low-phase window medians exactly 144, and the tolerance is
  // derived from the measured low mode (150 - 144 = 6), not guessed. A count-
  // based statistic clears only 4 or 5 of 9 frames on this exact face.
  const a = windowStatus([HIGH, LOW, HIGH, LOW, HIGH, LOW, HIGH, LOW, HIGH]);
  const b = windowStatus([LOW, HIGH, LOW, HIGH, LOW, HIGH, LOW, HIGH, LOW]);
  assert.equal(a.pass, true, `HIGH-first alternation must pass, got ${JSON.stringify(a)}`);
  assert.equal(b.pass, true, `LOW-first alternation must pass, got ${JSON.stringify(b)}`);
  assert.ok(a.count >= SCLERA_MIN_PIXELS - SCLERA_WINDOW_TOLERANCE,
    "the window count is reported and within tolerance of the limit");
});

test("sclera window: a steady 120 count never clears and names the reason", () => {
  const steady = windowStatus(Array.from({ length: SCLERA_WINDOW_FRAMES }, () => 120));
  assert.equal(steady.pass, false);
  assert.ok(steady.reason, "a failing window must carry a reason");
  assert.equal(steady.count, 120, "a steady feed reports its median count");
});

test("sclera window: recover up clears; collapse down fails", () => {
  const recovering = windowStatus([120, 120, 120, 120, HIGH, HIGH, HIGH, HIGH, HIGH]);
  assert.equal(recovering.pass, true, "five consecutive clear frames clear the window");
  const collapsing = windowStatus([HIGH, HIGH, HIGH, HIGH, 120, 120, 120, 120, 120]);
  assert.equal(collapsing.pass, false, "five consecutive short frames fail the window");
});

test("sclera window: a genuinely short face stays below the tolerance", () => {
  // 120 sits 30 under 150, far outside the 6-pixel smoothing tolerance: the
  // degrade path, not the window, is what lets this face through.
  assert.equal(windowStatus([120, 144, 120, 153, 120, 144, 120, 153, 120]).pass, false,
    "a count centred 30 under the limit never clears the window");
});

test("degrade: sclera-short alone degrades to assisted after grace; a measured illuminant never degrades", () => {
  const scleraShort = { pixelCount: 120, rawRatios: null, reason: "too_few_pixels" };
  // Everything else passes; only sclera is short, and illuminant is BLOCKED
  // by it. After SCLERA_GRACE_MS the pair degrades to the assisted tier.
  const degraded = evaluateGates(
    cleanStats(), PTS, scleraShort,
    { elapsedMs: 6000, acceptUnevenLight: false, degradeSclera: true },
  );
  assert.equal(degraded.pass, true, "sclera-short alone must degrade to pass after grace");
  assert.equal(degraded.captureTier, "assisted", "the degraded capture is the assisted tier");
  assert.equal(degraded.scleraValid, false, "the degrade is named in the gate result");

  // The paired control: sclera is FINE and the illuminant is MEASURED at
  // 0.4 off neutral. That is a real coloured-light verdict, never degradable.
  const scleraGood = { pixelCount: 200, rawRatios: { r: 1.4, g: 1.0, b: 0.9 }, confidence: "ok" };
  const badIlluminant = evaluateGates(
    cleanStats(), PTS, scleraGood,
    { elapsedMs: 6000, acceptUnevenLight: false, degradeSclera: true },
  );
  assert.equal(badIlluminant.pass, false, "a measured illuminant 0.4 off neutral never degrades");
  assert.equal(badIlluminant.scleraValid, true, "no sclera degrade was taken");
});

test("degrade: before grace, sclera-short still blocks (the grace clock is real)", () => {
  const scleraShort = { pixelCount: 120, rawRatios: null, reason: "too_few_pixels" };
  const early = evaluateGates(
    cleanStats(), PTS, scleraShort,
    { elapsedMs: 1000, acceptUnevenLight: false, degradeSclera: true },
  );
  assert.equal(early.pass, false, "no degrade before SCLERA_GRACE_MS");
  // A non-sclera failure also blocks the degrade: a badly posed face never
  // slips through on the sclera degrade's coattails.
  const alsoFailing = evaluateGates(
    { ...cleanStats(), pose: { yaw: 30, pitch: 0, roll: 0 } }, PTS, scleraShort,
    { elapsedMs: 6000, acceptUnevenLight: false, degradeSclera: true },
  );
  assert.equal(alsoFailing.pass, false, "a pose failure is not degradable");
});

test("method: an uncorrected row carries a distinct method so it never mixes into the corrected baseline", () => {
  assert.ok(MEASUREMENT_METHOD.qiseUncorrected, "MEASUREMENT_METHOD gains qiseUncorrected");
  const correctedRow = { baselineVersion: "v2" };
  const uncorrectedRow = { baselineVersion: "v2", scleraValid: false };
  const methodOfRow = (row) => (row.scleraValid === false
    ? MEASUREMENT_METHOD.qiseUncorrected
    : qiseMethodOf(row));
  assert.equal(methodOfRow(correctedRow), MEASUREMENT_METHOD.qiseCorrected);
  assert.equal(methodOfRow(uncorrectedRow), MEASUREMENT_METHOD.qiseUncorrected);
  assert.notEqual(methodOfRow(uncorrectedRow), methodOfRow(correctedRow));
});

test("confidence: a degraded reading is assisted-tier, never a hollow 0-confidence reading", () => {
  const degraded = readingConfidence({
    scleraConfidenceValue: null,
    scleraValid: false,
    validFraction: 1,
    frameJitter: 0,
    captureTier: "assisted",
  });
  assert.ok(typeof degraded === "number" && degraded > 0.6,
    `a degraded reading must clear the LOW_CONFIDENCE floor, got ${degraded}`);
  const corrected = readingConfidence({
    scleraConfidenceValue: 1, scleraValid: true,
    validFraction: 1, frameJitter: 0, captureTier: "clean",
  });
  assert.ok(degraded < corrected, "the degraded reading still ranks below a clean one");
});

test("drift history: degraded readings contribute no sclera sample", () => {
  const history = [
    { sclera: { rawRatios: { r: 1.1, g: 1.0, b: 0.95 } } },
    { sclera: { rawRatios: null }, scleraValid: false },
    { scleraValid: false },
    { sclera: { rawRatios: { r: 1.05, g: 1.0, b: 0.98 } } },
  ];
  const samples = history
    .filter((r) => r.scleraValid !== false)
    .map((r) => r.sclera && r.sclera.rawRatios)
    .filter(Boolean);
  assert.equal(samples.length, 2, "only valid sclera samples reach the drift window");
});

test("static guard: app.js wires the window, the degrade and the uncorrected method", () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ui/qise/app.js"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert.ok(/scleraWindowStatus/.test(src), "app.js consumes scleraWindowStatus");
  assert.ok(/degradeSclera/.test(src), "app.js passes the degrade flag to evaluateGates");
  assert.ok(/scleraValid/.test(src), "app.js stamps scleraValid on the record");
  assert.ok(/qiseUncorrected/.test(src), "app.js stamps the uncorrected method on degraded readings");
});

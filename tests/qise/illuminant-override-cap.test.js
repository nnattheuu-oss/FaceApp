/*
 * M1a fix (e): "Use this light anyway" must not accept ANY coloured light.
 * docs/MONETISATION_AUDIT_2026-09.md, Phase 0 item 6.
 *
 * The override tolerated every illuminant failure regardless of size, skipping
 * ASSISTED_LIMITS entirely. An override-accepted reading is stored at the
 * assisted confidence (0.78), above the baseline floor (0.6), so a reading
 * taken under light too far off neutral for any correction to be trusted
 * entered the person's own baseline and moved every later comparison.
 *
 * The cap is ASSISTED_LIMITS.illuminant (0.35) — the same limit the grace
 * window already applies, so the override can widen WHEN a coloured light is
 * accepted but never HOW coloured it may be. Side light is deliberately not
 * capped: an uneven face is still measurable, and the existing test "unavoidable
 * side light gets an explicit reduced-confidence escape hatch" pins that.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGates, canUseCurrentLight, ASSISTED_LIMITS, LIGHT_OVERRIDE_DELAY_MS,
} from "../../src/qise/gates.js";
import { SCLERA_ABSOLUTE_TOLERANCE } from "../../src/qise/sclera.js";
import { canonicalFace, FRAME_W } from "./fixtures/synthetic.js";

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
/** A sclera whose worst channel is `offset` from neutral. */
const tinted = (offset) => ({
  pixelCount: 400, rawRatios: { r: 1 + offset, g: 1.0, b: 1.0 }, confidence: "ok",
});
const withOverride = (offset) => evaluateGates(cleanStats(), PTS, tinted(offset),
  { elapsedMs: LIGHT_OVERRIDE_DELAY_MS, acceptUnevenLight: true });
const plain = (offset) => evaluateGates(cleanStats(), PTS, tinted(offset),
  { elapsedMs: LIGHT_OVERRIDE_DELAY_MS });

test("the fixture brackets the cap: both tints fail the strict illuminant gate", () => {
  assert.ok(0.3 > SCLERA_ABSOLUTE_TOLERANCE && 0.3 <= ASSISTED_LIMITS.illuminant);
  assert.ok(0.6 > ASSISTED_LIMITS.illuminant);
  for (const offset of [0.3, 0.6]) {
    assert.ok(plain(offset).failures.some((f) => f.id === "illuminant" && f.status === "fail")
      || plain(offset).tolerated.some((f) => f.id === "illuminant"));
  }
});

test("a coloured light within the cap is accepted by the override (positive control)", () => {
  const report = withOverride(0.3);
  assert.equal(report.pass, true);
  assert.equal(report.captureTier, "assisted");
  assert.ok(report.tolerated.some((f) => f.id === "illuminant"));
});

test("a coloured light beyond the cap is NOT accepted, even with the override", () => {
  const report = withOverride(0.6);
  assert.equal(report.pass, false,
    "a light too far off neutral for any correction entered the baseline at 0.78 confidence");
  assert.ok(report.failures.some((f) => f.id === "illuminant"));
  assert.ok(!report.tolerated.some((f) => f.id === "illuminant"));
});

test("the escape hatch is not OFFERED for a light it cannot accept", () => {
  // Offering a button that then changes nothing is a dead end.
  assert.equal(canUseCurrentLight(plain(0.6), LIGHT_OVERRIDE_DELAY_MS), false);
});

test("side light stays uncapped under the override (unchanged behaviour)", () => {
  const report = evaluateGates({ ...cleanStats(), cheekMedianL: { left: 90, right: 40 } }, PTS,
    tinted(0), { elapsedMs: LIGHT_OVERRIDE_DELAY_MS, acceptUnevenLight: true });
  assert.equal(report.pass, true);
  assert.equal(canUseCurrentLight(
    evaluateGates({ ...cleanStats(), cheekMedianL: { left: 90, right: 40 } }, PTS, tinted(0),
      { elapsedMs: LIGHT_OVERRIDE_DELAY_MS }),
    LIGHT_OVERRIDE_DELAY_MS), true);
});

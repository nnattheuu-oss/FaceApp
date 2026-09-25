/*
 * M1a row 23 (docs/MONETISATION_AUDIT_2026-09.md, restriction sweep): the
 * selfie path printed `gates.failures[0].message` — CLAUDE.md item 54's defect
 * on the one path its fix never reached. `failures` is sorted by margin, and
 * a BLOCKED gate carries margin -1, the floor, so an unmeasured illuminant
 * outranks the real cause: a selfie too dark to read the eyes was told to
 * change its lamps to daylight.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateGates } from "../../src/qise/gates.js";
import { selfieGateMessage } from "../../src/qise/upload.js";
import { canonicalFace, FRAME_W } from "./fixtures/synthetic.js";

const PTS = canonicalFace();
const perfectStats = () => ({
  frameWidth: FRAME_W,
  pose: { yaw: 0, pitch: 0, roll: 0 },
  skinPixelCount: 100000,
  skinPixelsAtOrAbove250: 0,
  skinPixelsAtOrBelow12: 0,
  cheekMedianL: { left: 60, right: 60 },
  landmarkDriftPx: 1,
  laplacianVariance: 80,
  validRoiCount: 12,
});
const darkSclera = {
  gains: null, pixelCount: 200, rawRatios: null, personalDelta: null,
  confidence: "insufficient", confidenceValue: 0, reason: "too_dark",
  medianL: 10, withinAbsoluteTolerance: false, stages: {},
};
const report = () => evaluateGates(perfectStats(), PTS, darkSclera,
  { elapsedMs: Number.POSITIVE_INFINITY });

test("the raw first failure is the wrong message for a dark selfie (the defect, reproduced)", () => {
  const r = report();
  assert.equal(r.pass, false);
  assert.equal(r.failures[0].status, "blocked");
  assert.match(r.failures[0].message, /daylight|white lamp/i,
    "precondition: the unmeasured illuminant sorts first");
});

test("the selfie message names the real cause, never a lamp nobody measured", () => {
  const message = selfieGateMessage(report());
  assert.doesNotMatch(message, /daylight|white lamp|unusual/i);
  assert.ok(message.length > 0);
});

test("a genuinely measured failure still gets its own instruction (paired control)", () => {
  const r = evaluateGates({ ...perfectStats(), laplacianVariance: 1 }, PTS, {
    gains: { r: 1, g: 1, b: 1 }, pixelCount: 400, rawRatios: { r: 1, g: 1, b: 1 },
    confidence: "ok", confidenceValue: 1, reason: null, medianL: 60,
    withinAbsoluteTolerance: true, stages: {},
  }, { elapsedMs: Number.POSITIVE_INFINITY });
  assert.equal(r.pass, false);
  assert.match(selfieGateMessage(r), /\S/);
  assert.doesNotMatch(selfieGateMessage(r), /daylight|white lamp/i);
});

test("ui/qise/app.js no longer prints a raw gate message on the selfie path", () => {
  const source = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  const body = source.match(/async function runSelfie\([\s\S]*?\r?\n}\r?\n/)?.[0] || "";
  assert.ok(body);
  assert.doesNotMatch(body, /failures\[0\]\.message/);
  assert.match(body, /selfieGateMessage\(gates\)/);
});

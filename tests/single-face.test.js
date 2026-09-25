/*
 * M1a fix (a): a reading is meaningful only for exactly one face.
 * Ported and generalised from codex/scanner-single-face (13ca956), which fixed
 * the classic path only (docs/BRANCH_TRIAGE_2026-09-25.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createLandmarkerWithFallback, selectSingleFace, SINGLE_FACE_NUM_FACES,
} from "../src/landmarker.js";

const face = (tag) => [{ x: 0.5, y: 0.5, z: 0, tag }];

test("selectSingleFace refuses zero and two faces, and never picks one implicitly", () => {
  assert.deepEqual(selectSingleFace(null), { status: "none", landmarks: null });
  assert.deepEqual(selectSingleFace({ faceLandmarks: [] }), { status: "none", landmarks: null });
  const one = selectSingleFace({ faceLandmarks: [face("a")] });
  assert.equal(one.status, "single");
  assert.equal(one.landmarks[0].tag, "a");
  assert.deepEqual(selectSingleFace({ faceLandmarks: [face("a"), face("b")] }),
    { status: "multiple", landmarks: null });
});

test("the capture paths ask MediaPipe for two faces, so a second one is visible", async () => {
  assert.equal(SINGLE_FACE_NUM_FACES, 2);
  const calls = [];
  await createLandmarkerWithFallback(async (_f, opts) => { calls.push(opts); return {}; }, {},
    { modelAssetPath: "m.task", numFaces: SINGLE_FACE_NUM_FACES });
  assert.equal(calls[0].numFaces, 2);
});

test("the classic path also refuses an ambiguous multi-face photo", () => {
  const src = readFileSync(new URL("../src/analysis.js", import.meta.url), "utf8");
  assert.match(src, /numFaces:\s*SINGLE_FACE_NUM_FACES/);
  assert.match(src, /selectSingleFace\(/);
  assert.doesNotMatch(src, /faceLandmarks\s*(\?\.)?\s*\[\s*0\s*\]/);
});

/*
 * M1a fix (d), part 1: a face-model load failure must not be reported as a
 * camera-permission failure. docs/MONETISATION_AUDIT_2026-09.md, Phase 0
 * item 5.
 *
 * Before M1a, production's buildLandmarker() failures (bundle import, WASM
 * fetch, model fetch, both delegates failing) reached describeCameraError(),
 * whose fallback reads "The camera did not open… check this site's camera
 * permission, or choose a selfie below". The camera HAD opened, the
 * permission was fine, and the selfie path needs the same model — every
 * suggested fix was wrong. The beta bench already had its own message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  describeCameraError, describeSelfieError, loadFaceModel, ModelLoadError,
} from "../../src/qise/camera.js";
import { ConsentRequiredError } from "../../src/qise/consent.js";

test("a model-load failure names the engine and the connection, never the camera permission", () => {
  const message = describeCameraError(new ModelLoadError(new TypeError("Failed to fetch")));
  assert.doesNotMatch(message, /permission/i, "the permission is not the problem");
  assert.doesNotMatch(message, /selfie/i, "a selfie needs the same model, so it is not a fix");
  assert.match(message, /connection/i);
  assert.match(message, /Restart camera/, "the retry control the screen actually has");
});

test("a real camera error still gets the camera message (paired control)", () => {
  const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  assert.match(describeCameraError(denied), /Camera access is off/);
  assert.match(describeCameraError(new Error("unknown")), /camera did not open/i);
});

test("the selfie path says the same, and a bad photo still gets the photo message", () => {
  const load = describeSelfieError(new ModelLoadError(new Error("wasm")));
  assert.match(load, /did not load/);
  assert.doesNotMatch(load, /Choose another/, "a different photo cannot fix a missing model");
  assert.match(describeSelfieError(new Error("decode")), /Choose another original photo/);
});

test("loadFaceModel tags a load failure and keeps the original cause", async () => {
  const cause = new TypeError("Failed to fetch");
  await assert.rejects(loadFaceModel(async () => { throw cause; }), (error) => {
    assert.ok(error instanceof ModelLoadError);
    assert.equal(error.name, "ModelLoadError");
    assert.equal(error.cause, cause);
    return true;
  });
});

test("loadFaceModel never relabels a consent refusal as a model failure", async () => {
  const refusal = new ConsentRequiredError("FaceLandmarker");
  await assert.rejects(loadFaceModel(async () => { throw refusal; }), (error) => error === refusal);
});

test("loadFaceModel passes a built landmarker straight through", async () => {
  const landmarker = { detectForVideo() {} };
  assert.equal(await loadFaceModel(async () => landmarker), landmarker);
});

test("ui/qise/app.js routes selfie failures through describeSelfieError", () => {
  const source = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  assert.match(source, /textContent = describeSelfieError\(error\)/);
});

test("ui/qise/app.js builds every landmarker through loadFaceModel", () => {
  const source = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  const body = source.match(/async function buildLandmarker\([\s\S]*?\n}\n/)?.[0] || "";
  assert.ok(body, "buildLandmarker not found");
  assert.match(body, /loadFaceModel\(/,
    "a raw model failure falls through to the camera-permission message");
  assert.match(body, /await import\(MEDIAPIPE_BUNDLE\)/);
  // The bundle import and the WASM fileset must be INSIDE the wrapped step,
  // not before it: those are the fetches that fail offline.
  const wrapped = body.slice(body.indexOf("loadFaceModel("));
  assert.match(wrapped, /import\(MEDIAPIPE_BUNDLE\)/);
  assert.match(wrapped, /forVisionTasks\(/);
});

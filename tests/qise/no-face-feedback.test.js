/*
 * Owner's Gate 0 retest (28 Sep): permission allowed, no camera-in-use dot,
 * black preview, and the screen said "Opening the camera" indefinitely — on
 * the build that already bounded camera start. Reproduced in a Pixel-7
 * emulation against the built dist/: the camera WAS open (srcObject set,
 * videoWidth 320, MediaPipe graph running), yet the line never left
 * "Opening the camera". Two defects:
 *
 * 1. On every no-face frame the loop set "Come into view" and then called
 *    renderCaptureGuide() with no report, which wrote captureInstruction(null)
 *    = "Opening the camera" over it. So "no face found" was reported to the
 *    person as "the camera is still starting", forever.
 * 2. Darkness was only ever measured INSIDE the face branch (the underexposed
 *    gate needs ROIs), so a frame too dark — or a stream delivering pure black,
 *    which is what Android's Quick Settings "Camera access" OFF does: the app
 *    gets permission, the sensor never runs, no green dot — could never be
 *    named, and the screen-light assist could never arm.
 *
 * Evidence for the black-frame threshold (28 Sep, headless Chromium, the
 * pinned MediaPipe model, the owner's own backlit phone photo scaled down in
 * brightness; nothing committed): a face was still detected down to a centre
 * mean luma of 3.4 and lost at 2.5. BLACK_FRAME_LUMA = 2 sits below every
 * brightness at which a real face was found, so it cannot tell a detectable
 * face that it is a dead camera.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  centreLuma, noFaceState, BLACK_FRAME_LUMA, BLACK_FRAME_MS, DIM_NO_FACE_LUMA,
} from "../../src/qise/no-face.js";

const frame = (w, h, rgb) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
};

test("centreLuma reads the guide region, not the edges", () => {
  const img = frame(200, 300, [0, 0, 0]);
  // Paint the centre white; the corners stay black.
  for (let y = 100; y < 200; y++) for (let x = 70; x < 130; x++) {
    const p = (y * 200 + x) * 4; img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
  }
  assert.ok(centreLuma(img) > 50, "the bright centre must dominate");
  assert.equal(centreLuma(frame(200, 300, [0, 0, 0])), 0);
  assert.ok(Math.abs(centreLuma(frame(200, 300, [100, 100, 100])) - 100) < 0.5);
});

test("the black-frame threshold sits below every luma at which a real face was detected", () => {
  assert.ok(BLACK_FRAME_LUMA < 3.4, "measured: a dim real face was still found at 3.4");
  assert.ok(BLACK_FRAME_MS >= 1500, "one dark frame is not a dead camera");
  assert.ok(DIM_NO_FACE_LUMA > BLACK_FRAME_LUMA);
});

test("no face, never 'Opening the camera' — whatever the frame looks like", () => {
  for (const luma of [0, 1, 2.5, 10, 40, 120, 250]) {
    for (const blackForMs of [0, 500, 5000]) {
      const s = noFaceState({ multiple: false, luma, blackForMs });
      assert.doesNotMatch(s.title, /Opening the camera/, `luma ${luma}, black ${blackForMs}ms`);
    }
  }
});

test("a sustained black picture is named, with the Android fix", () => {
  const s = noFaceState({ multiple: false, luma: 0.4, blackForMs: BLACK_FRAME_MS });
  assert.equal(s.id, "black-frames");
  assert.match(s.detail, /Camera access/);
  assert.equal(s.dark, false, "a screen flash cannot light a camera that is off");
});

test("a brief black moment is treated as dark, not as a dead camera (paired control)", () => {
  const s = noFaceState({ multiple: false, luma: 0.4, blackForMs: 300 });
  assert.equal(s.id, "too-dark-no-face");
  assert.equal(s.dark, true);
});

test("a dim frame with no face asks for light and arms the screen assist", () => {
  const s = noFaceState({ multiple: false, luma: 8, blackForMs: 0 });
  assert.equal(s.id, "too-dark-no-face");
  assert.equal(s.dark, true);
});

test("a lit frame with no face asks the person into the oval; two faces are named", () => {
  assert.equal(noFaceState({ multiple: false, luma: 90, blackForMs: 0 }).id, "no-face");
  assert.equal(noFaceState({ multiple: true, luma: 90, blackForMs: 0 }).id, "multiple");
});

const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");

test("a bare renderCaptureGuide() call can no longer overwrite the prompt", () => {
  const fn = app.match(/function renderCaptureGuide\([\s\S]*?\r?\n}\r?\n/)?.[0] || "";
  assert.ok(fn);
  assert.match(fn, /if \(!instruction\) return;/,
    "without a report or an explicit instruction the prompt must be left alone");
});

test("the no-face branch measures the frame and routes through noFaceState", () => {
  assert.match(app, /centreLuma\(image\)/);
  assert.match(app, /noFaceState\(\{/);
  assert.match(app, /renderCaptureGuide\(null, noFace\)/);
  assert.match(app, /issuePresent: noFace\.dark/, "darkness with no face must be able to arm the assist");
});

/*
 * Owner's Gate 0 run, 28 Sep: Chrome's camera permission was ALLOWED, no
 * green camera dot ever appeared, and the screen sat on "Opening the camera"
 * with a black oval indefinitely. Two defects could each produce exactly that,
 * and nothing on screen could tell them apart:
 *
 * 1. getUserMedia() was awaited with no time limit. A request that never
 *    settles leaves the capture screen on its first prompt forever.
 * 2. A capture run superseded by a newer one released its camera and returned
 *    SILENTLY, leaving whatever prompt was last painted.
 *
 * Fix: openCamera() is bounded (CAMERA_OPEN_TIMEOUT_MS) and a stream that
 * arrives after the deadline is stopped, never leaked; the live loop names
 * each startup step on screen; a superseded run logs why it stopped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  openCamera, describeCameraError, CAMERA_OPEN_TIMEOUT_MS,
} from "../../src/qise/camera.js";
import { createConsent, memoryStorage } from "../../src/qise/consent.js";

const granted = () => {
  const c = createConsent(memoryStorage());
  c.grant();
  return c;
};
const fakeStream = () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getVideoTracks: () => [track], getTracks: () => [track] };
};
const manualTimer = () => {
  let fire = null;
  return {
    setTimer: (fn) => { fire = fn; return 1; },
    clearTimer: () => { fire = null; },
    elapse: () => fire && fire(),
  };
};

test("a camera request that never settles fails with a named timeout, not a hang", async () => {
  const timer = manualTimer();
  const pending = openCamera({
    consent: granted(), negotiate: false,
    mediaDevices: { getUserMedia: () => new Promise(() => {}) },
    setTimer: timer.setTimer, clearTimer: timer.clearTimer,
  });
  timer.elapse();
  await assert.rejects(pending, (error) => error.name === "CameraTimeoutError");
  assert.ok(CAMERA_OPEN_TIMEOUT_MS >= 8000 && CAMERA_OPEN_TIMEOUT_MS <= 20000,
    "long enough for a permission prompt, short enough to be noticed");
});

test("a stream that arrives after the deadline is stopped, never left running", async () => {
  const timer = manualTimer();
  const late = fakeStream();
  let resolve;
  const pending = openCamera({
    consent: granted(), negotiate: false,
    mediaDevices: { getUserMedia: () => new Promise((r) => { resolve = r; }) },
    setTimer: timer.setTimer, clearTimer: timer.clearTimer,
  });
  timer.elapse();
  await assert.rejects(pending);
  resolve(late);
  await new Promise((r) => setImmediate(r));
  assert.equal(late.track.stopped, true, "a camera nobody is using must not keep running");
});

test("a prompt answer inside the deadline opens the camera normally (paired control)", async () => {
  const timer = manualTimer();
  const stream = fakeStream();
  const opened = await openCamera({
    consent: granted(), negotiate: false,
    mediaDevices: { getUserMedia: async () => stream },
    setTimer: timer.setTimer, clearTimer: timer.clearTimer,
  });
  assert.equal(opened.stream, stream);
  assert.equal(stream.track.stopped, false);
});

test("the timeout tells the person what to do, not that the camera is broken", () => {
  const message = describeCameraError(Object.assign(new Error("t"), { name: "CameraTimeoutError" }));
  assert.match(message, /camera/i);
  assert.match(message, /Restart camera/);
  assert.doesNotMatch(message, /did not open\. Retry, check/);
});

const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
const runCapture = app.match(/async function runCapture\(\)[\s\S]*?\r?\n}\r?\n/)?.[0] || "";

test("the live capture names each startup step on screen, in order", () => {
  assert.ok(runCapture, "runCapture not found");
  const steps = ["Asking for the camera", "Starting the preview", "Loading the face reader", "Finding your face"];
  let at = -1;
  for (const step of steps) {
    const i = runCapture.indexOf(step);
    assert.ok(i > at, `"${step}" missing or out of order`);
    at = i;
  }
});

test("a superseded capture run says why it stopped instead of returning silently", () => {
  const silent = runCapture.match(/if \(runId !== captureRun\) \{[^}]*\}/g) || [];
  assert.ok(silent.length >= 2);
  for (const block of silent) {
    assert.match(block, /console\.(warn|info)\(/, `silent superseded-run exit: ${block}`);
  }
});

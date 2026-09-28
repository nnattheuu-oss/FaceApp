/*
 * Blind-spot sweep after PR #9 (28 Sep). Every step between "camera allowed"
 * and "Finding your face" must end in a named state within a bounded time.
 * Three paths still could not:
 *
 * 1. attachCameraPreview awaited video.play() BEFORE its 8 s timer existed.
 *    For a MediaStream, play() settles only once a frame has been decoded, so
 *    a stream that never delivers one (a camera held by another app, a track
 *    that opens muted) left the screen on "Starting the preview" forever.
 * 2. Once the loop was running, a stream that stopped delivering frames never
 *    reached step() at all — no frame, no no-face branch, no message. rVFC
 *    simply never fires again, and the lifecycle watcher only hears `ended`
 *    and `mute` events, not a track that was already muted when it opened.
 * 3. Each restart builds a new lifecycle watcher, and each watcher fires once.
 *    A camera that keeps muting therefore restarted itself without limit —
 *    the screen cycling through its startup steps with no way to say why.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { attachCameraPreview, describeCameraError, loadFaceModel } from "../../src/qise/camera.js";
import {
  frameStall, FRAME_STALL_MS, shouldAutoRecover, MAX_AUTO_RECOVERIES,
} from "../../src/qise/frame-watchdog.js";

const manualTimer = () => {
  let fire = null;
  return {
    setTimer: (fn) => { fire = fn; return 1; },
    clearTimer: () => { fire = null; },
    elapse: () => fire && fire(),
    armed: () => fire !== null,
  };
};
const fakeVideo = (play) => ({
  videoWidth: 0, videoHeight: 0, srcObject: null, play,
  listeners: {},
  addEventListener(n, f) { this.listeners[n] = f; },
  removeEventListener(n) { delete this.listeners[n]; },
});

test("a play() that never settles still ends in a named no-frames error", async () => {
  const timer = manualTimer();
  const video = fakeVideo(() => new Promise(() => {}));
  const pending = attachCameraPreview(video, {}, timer);
  await new Promise((r) => setImmediate(r));
  assert.ok(timer.armed(), "the deadline must exist while play() is pending");
  timer.elapse();
  await assert.rejects(pending, (e) => e.name === "CameraNoFramesError");
});

test("a first frame arriving while play() is pending still starts the preview (paired control)", async () => {
  const timer = manualTimer();
  const video = fakeVideo(() => new Promise(() => {}));
  const pending = attachCameraPreview(video, {}, timer);
  video.videoWidth = 640; video.videoHeight = 480;
  video.listeners.loadedmetadata();
  assert.equal(await pending, video);
  assert.equal(timer.armed(), false, "the deadline is cleared once a frame exists");
});

test("a play() rejection is surfaced, not waited out", async () => {
  const timer = manualTimer();
  const video = fakeVideo(() => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })));
  await assert.rejects(attachCameraPreview(video, {}, timer), (e) => e.name === "NotAllowedError");
});

test("the no-frames message names the camera and the fix, not the network", () => {
  const m = describeCameraError({ name: "CameraNoFramesError" });
  assert.match(m, /isn't sending pictures/);
  assert.match(m, /Camera access/);
  assert.match(m, /Restart camera/);
});

test("a stream that stops delivering frames is named after FRAME_STALL_MS", () => {
  assert.ok(FRAME_STALL_MS >= 3000 && FRAME_STALL_MS <= 8000);
  const base = { startedAt: 0, visibleSince: 0, visible: true };
  assert.equal(frameStall({ ...base, lastFrameAt: 100, now: 100 + FRAME_STALL_MS - 1 }), null,
    "a normal gap between frames is not a stall (paired control)");
  const s = frameStall({ ...base, lastFrameAt: 100, now: 100 + FRAME_STALL_MS });
  assert.equal(s.id, "no-frames");
  assert.match(s.title, /isn't sending pictures/);
  assert.equal(frameStall({ ...base, lastFrameAt: null, now: FRAME_STALL_MS }).id, "no-frames",
    "a loop that never received its FIRST frame is a stall too");
});

test("a hidden page is never a stall, and returning to it restarts the clock", () => {
  assert.equal(frameStall({ startedAt: 0, visibleSince: 0, lastFrameAt: 0, now: 60000, visible: false }), null);
  assert.equal(frameStall({ startedAt: 0, visibleSince: 59000, lastFrameAt: 0, now: 60000, visible: true }), null,
    "frames resume a moment after the page comes back; that moment is not a stall");
});

test("automatic restarts are budgeted; a face found refills the budget", () => {
  assert.equal(MAX_AUTO_RECOVERIES, 1);
  assert.equal(shouldAutoRecover({ recoveriesSinceFace: 0 }), true);
  assert.equal(shouldAutoRecover({ recoveriesSinceFace: 1 }), false);
});

test("a face-model load that never settles fails as a model error, and a late landmarker is closed", async () => {
  const timer = manualTimer();
  let resolve;
  const pending = loadFaceModel(() => new Promise((r) => { resolve = r; }), timer);
  timer.elapse();
  await assert.rejects(pending, (e) => e.name === "ModelLoadError");
  const late = { closed: false, close() { this.closed = true; } };
  resolve(late);
  await new Promise((r) => setImmediate(r));
  assert.equal(late.closed, true, "a landmarker nobody is using must not stay open");
});

test("a face-model load inside the deadline returns normally (paired control)", async () => {
  const timer = manualTimer();
  const lm = { close() {} };
  assert.equal(await loadFaceModel(async () => lm, timer), lm);
});

const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");

test("the live loop runs the frame watchdog and budgets its restarts", () => {
  assert.match(app, /frameStall\(\{/);
  assert.match(app, /shouldAutoRecover\(\{/);
  assert.match(app, /lastFrameAt = /, "every processed frame must feed the watchdog");
  assert.match(app, /clearInterval\(watchdog\);\s*\n\s*await finish\(/,
    "a slow save after the burst must not read as a stalled camera");
  const restart = app.match(/\$\("restart-capture"\)\.addEventListener\([\s\S]*?\r?\n  \}\);/)?.[0] || "";
  assert.match(restart, /autoRecoveriesSinceFace = 0/, "a manual restart refills the budget");
});

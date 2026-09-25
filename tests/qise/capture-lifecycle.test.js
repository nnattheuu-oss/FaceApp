/*
 * M1a fix (c): a capture must recover on its own when the OS takes the
 * camera away (backgrounding, a call, lock screen, permission revoked
 * mid-scan). Before M1a the loop had no visibilitychange / pagehide / track
 * `ended` / `mute` handling at all (only wakelock.js listened): rVFC simply
 * stopped firing and the screen froze on its last prompt until the user
 * found "Restart camera". docs/MONETISATION_AUDIT_2026-09.md Phase 0 item 4.
 *
 * Browser objects are injected (CLAUDE.md item 14), so the paths that matter
 * — the ones a desktop never takes — run under node --test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { watchCaptureLifecycle } from "../../src/qise/capture-lifecycle.js";

function fakeTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of [...(listeners.get(type) || [])]) fn({ type }); },
    count(type) { return listeners.get(type)?.size || 0; },
  };
}

const setup = ({ readyState = "live", muted = false } = {}) => {
  const documentRef = fakeTarget({ visibilityState: "visible" });
  const track = fakeTarget({ readyState, muted });
  const reasons = [];
  const watcher = watchCaptureLifecycle({ documentRef, track, onRecover: (r) => reasons.push(r) });
  return { documentRef, track, reasons, watcher };
};

test("returning to the page with an ENDED track restarts the capture", () => {
  const { documentRef, track, reasons } = setup();
  documentRef.visibilityState = "hidden"; documentRef.emit("visibilitychange");
  track.readyState = "ended";
  documentRef.visibilityState = "visible"; documentRef.emit("visibilitychange");
  assert.deepEqual(reasons, ["track-ended"]);
});

test("returning with a MUTED track (iOS interruption) restarts the capture", () => {
  const { documentRef, track, reasons } = setup();
  documentRef.visibilityState = "hidden"; documentRef.emit("visibilitychange");
  track.muted = true;
  documentRef.visibilityState = "visible"; documentRef.emit("visibilitychange");
  assert.deepEqual(reasons, ["track-muted"]);
});

test("returning with a healthy live track does NOT interrupt a working capture", () => {
  const { documentRef, reasons } = setup();
  documentRef.visibilityState = "hidden"; documentRef.emit("visibilitychange");
  documentRef.visibilityState = "visible"; documentRef.emit("visibilitychange");
  assert.deepEqual(reasons, []);
});

test("a track that ends while visible (permission revoked mid-scan) recovers at once", () => {
  const { track, reasons } = setup();
  track.readyState = "ended";
  track.emit("ended");
  assert.deepEqual(reasons, ["track-ended"]);
});

test("a track that ends while hidden waits for the page to be visible again", () => {
  const { documentRef, track, reasons } = setup();
  documentRef.visibilityState = "hidden"; documentRef.emit("visibilitychange");
  track.readyState = "ended"; track.emit("ended");
  assert.deepEqual(reasons, [], "no camera can be reopened for a hidden page");
  documentRef.visibilityState = "visible"; documentRef.emit("visibilitychange");
  assert.deepEqual(reasons, ["track-ended"]);
});

test("recovery fires once, and dispose removes every listener", () => {
  const { documentRef, track, reasons, watcher } = setup();
  track.readyState = "ended"; track.emit("ended"); track.emit("ended");
  assert.deepEqual(reasons, ["track-ended"], "a second event must not start a second capture");
  watcher.dispose();
  assert.equal(documentRef.count("visibilitychange"), 0);
  assert.equal(track.count("ended"), 0);
  assert.equal(track.count("mute"), 0);
});

test("a host with no event API degrades to a no-op instead of throwing", () => {
  const watcher = watchCaptureLifecycle({ documentRef: null, track: {}, onRecover: () => {} });
  assert.doesNotThrow(() => watcher.dispose());
});

for (const file of ["src/ui/qise/app.js", "src/beta/beta.js"]) {
  test(`${file}: the live capture is watched and the watcher is released with it`, () => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.match(source, /watchCaptureLifecycle\(\{/);
    assert.match(source, /lifecycle[,}\s]/, "the watcher is not handed to the capture scratch for release");
  });
}

test("releaseCapture disposes a lifecycle watcher on every way out", async () => {
  const { releaseCapture } = await import("../../src/qise/camera.js");
  let disposed = 0;
  const released = releaseCapture({ images: [], landmarks: [], lifecycle: { dispose: () => { disposed++; } } });
  assert.equal(disposed, 1);
  assert.equal(released.lifecycleDisposed, true);
});

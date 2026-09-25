/*
 * M1a scanner fixes (a), (b) and (g) — docs/MONETISATION_AUDIT_2026-09.md,
 * Phase 0 item 1 and item 2.
 *
 * (a) Single-face fail-closed. `numFaces: 1` made a second face invisible:
 *     MediaPipe returned whichever face it ranked first and every capture
 *     path read `faceLandmarks[0]`. The live, selfie, beta and classic paths
 *     now ask for two faces and refuse anything but exactly one.
 * (b) The hold latch kept its start time across a face-loss gap, so a
 *     returning face could fire the burst on its first frame back, and burst
 *     frames 2..9 were collected without re-checking the gates. The hold and
 *     the burst now live in one pure state machine that resets on a lost face
 *     and aborts the burst on any frame that is not ready.
 * (g) MediaPipe's detectForVideo requires strictly increasing timestamps and
 *     nothing enforced or tested it.
 *
 * `ui/qise/app.js` and `beta/beta.js` cannot be imported under node --test
 * (CLAUDE.md items 18a/44), so the behaviour is tested on the pure modules and
 * the WIRING is pinned by static guards over both loops.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BurstController, createMonotonicTimestamps,
} from "../../src/qise/capture-integrity.js";
import { GATES_GREEN_MS, BURST_FRAMES } from "../../src/qise/camera.js";

const sample = (v) => ({ tian: { L: v, a: 0, b: 0 } });

/** Drive `n` frames `stepMs` apart, all ready, starting at `t0`. */
function runReady(bc, { t0 = 0, n, stepMs = 33, value = 1 }) {
  let t = t0;
  let last = null;
  for (let i = 0; i < n; i++, t += stepMs) {
    last = bc.frame({ ready: true, nowMs: t, sample: () => sample(value) });
    if (last.done) return { ...last, t };
  }
  return { ...last, t };
}

// ── (b) the hold and the burst ────────────────────────────────────────────

test("a burst starts only after the gates hold for GATES_GREEN_MS", () => {
  const bc = new BurstController();
  const early = bc.frame({ ready: true, nowMs: 0, sample: () => sample(1) });
  assert.equal(early.collecting, false);
  const beforeHold = bc.frame({ ready: true, nowMs: GATES_GREEN_MS - 1, sample: () => sample(1) });
  assert.equal(beforeHold.collecting, false);
  const armed = bc.frame({ ready: true, nowMs: GATES_GREEN_MS, sample: () => sample(1) });
  assert.equal(armed.collecting, true, "the hold completed; the burst must start");
});

test("a sustained ready run yields exactly BURST_FRAMES samples per region", () => {
  const bc = new BurstController();
  const r = runReady(bc, { n: 200 });
  assert.equal(r.done, true);
  assert.equal(r.burst.tian.length, BURST_FRAMES);
});

test("a face lost mid-HOLD restarts the hold: the first frame back cannot fire the burst", () => {
  const bc = new BurstController();
  bc.frame({ ready: true, nowMs: 0, sample: () => sample(1) });
  bc.frame({ ready: true, nowMs: GATES_GREEN_MS - 10, sample: () => sample(1) });
  bc.faceLost();
  // Two seconds later the face returns, ready. Before the fix the latch still
  // carried its t=0 start, so heldMs was 2000 and the burst fired here.
  const back = bc.frame({ ready: true, nowMs: 2000, sample: () => sample(1) });
  assert.equal(back.collecting, false, "a returning face must earn a fresh hold");
  assert.equal(back.progress, 0);
});

test("a face lost mid-BURST discards the partial burst; nothing from before the gap survives", () => {
  const bc = new BurstController();
  let t = 0;
  // Arm and collect three frames of person A.
  for (; ; t += 33) {
    const r = bc.frame({ ready: true, nowMs: t, sample: () => sample(10) });
    if (r.collecting && r.collected === 3) break;
  }
  bc.faceLost();
  // Person B (or A again) returns; run to completion.
  const r = runReady(bc, { t0: t + 1000, n: 400, value: 99 });
  assert.equal(r.done, true);
  assert.equal(r.burst.tian.length, BURST_FRAMES);
  assert.ok(r.burst.tian.every((s) => s.L === 99),
    "samples from before the face-loss gap leaked into the burst");
});

test("every burst frame is re-gated: a frame that is not ready aborts the burst", () => {
  const bc = new BurstController();
  let t = 0;
  for (; ; t += 33) {
    const r = bc.frame({ ready: true, nowMs: t, sample: () => sample(1) });
    if (r.collecting && r.collected === 2) break;
  }
  const bad = bc.frame({ ready: false, nowMs: t + 33, sample: () => sample(1) });
  assert.equal(bad.aborted, true, "a failed gate mid-burst must abort, not be sampled");
  assert.equal(bad.collecting, false);
  // And it needs a fresh hold, not an instant re-arm.
  const next = bc.frame({ ready: true, nowMs: t + 66, sample: () => sample(1) });
  assert.equal(next.collecting, false);
});

test("a hold that completes inside the settle window does not start a burst", () => {
  const bc = new BurstController();
  bc.frame({ ready: true, nowMs: 0, settleUntil: 5000, sample: () => sample(1) });
  const r = bc.frame({ ready: true, nowMs: GATES_GREEN_MS, settleUntil: 5000, sample: () => sample(1) });
  assert.equal(r.collecting, false);
});

test("the controller reports the gate margins from the frame that armed the burst", () => {
  const bc = new BurstController();
  let armedWith = null;
  for (let t = 0; t < 2000; t += 33) {
    const r = bc.frame({ ready: true, nowMs: t, sample: () => sample(1), armContext: { margin: t } });
    if (r.done) { armedWith = r.armContext; break; }
  }
  assert.ok(armedWith, "the burst never completed");
  assert.ok(armedWith.margin >= GATES_GREEN_MS && armedWith.margin < GATES_GREEN_MS + 33,
    "armContext must come from the frame that armed the burst, not a later one");
});

// ── (g) monotonic timestamps ──────────────────────────────────────────────

test("detect timestamps are strictly increasing even when the clock repeats or steps back", () => {
  const next = createMonotonicTimestamps();
  const seen = [100, 100, 99, 150, 150.5, 20].map((t) => next(t));
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] > seen[i - 1], `timestamp ${seen[i]} did not increase past ${seen[i - 1]}`);
  }
  assert.equal(seen[0], 100, "a clean first timestamp passes through");
  assert.equal(seen[3], 150, "an increasing timestamp passes through unchanged");
});

test("a fresh timestamp sequence starts over (one per landmarker instance)", () => {
  const a = createMonotonicTimestamps();
  a(5000);
  const b = createMonotonicTimestamps();
  assert.equal(b(10), 10);
});

// ── the wiring, pinned statically in both capture loops ───────────────────

const loops = {
  "src/ui/qise/app.js": readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8"),
  "src/beta/beta.js": readFileSync(new URL("../../src/beta/beta.js", import.meta.url), "utf8"),
};

for (const [file, source] of Object.entries(loops)) {
  test(`${file}: no capture path reads faceLandmarks[0] directly (a)`, () => {
    assert.doesNotMatch(source, /faceLandmarks\s*(\?\.)?\s*\[\s*0\s*\]/,
      "reading the first face silently picks one of two people");
    assert.match(source, /selectSingleFace\(/);
  });

  test(`${file}: the landmarker is built to see a second face (a)`, () => {
    const calls = source.match(/createLandmarkerWithFallback\([\s\S]*?\n\s*\);/g) || [];
    assert.ok(calls.length >= 1);
    for (const call of calls) {
      assert.match(call, /numFaces:\s*SINGLE_FACE_NUM_FACES/,
        "numFaces: 1 makes a second face invisible, so it can never be refused");
    }
  });

  test(`${file}: the hold and burst run through BurstController, reset on face loss (b)`, () => {
    assert.match(source, /new BurstController\(/);
    assert.match(source, /\.faceLost\(\)/);
    assert.doesNotMatch(source, /collecting--/, "an inline burst counter bypasses the re-gate");
  });

  test(`${file}: detectForVideo gets a strictly increasing timestamp (g)`, () => {
    assert.match(source, /createMonotonicTimestamps\(/);
    assert.doesNotMatch(source, /detectForVideo\(video,\s*nowMs\)/,
      "the raw frame clock reaches MediaPipe unguarded");
  });
}

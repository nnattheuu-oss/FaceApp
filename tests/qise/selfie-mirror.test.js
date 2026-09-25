/*
 * M1a fix (f): a mirrored selfie must be able to say so.
 * docs/MONETISATION_AUDIT_2026-09.md, Phase 0 item 3.
 *
 * Many phones save front-camera photos mirrored. The selfie path hard-coded
 * `mirrored: false` and drew the photo as-is, so for a mirrored selfie every
 * off-midline region sampled the other side of the face (quan_l / quan_r
 * swapped, CLAUDE.md items 5 and 44), and a history mixing camera and selfie
 * readings compared each cheek against the other one. The classic path asks
 * (analysis.js drawToCanvas `unmirror`); the primary one did not.
 *
 * The fix flips the PIXELS before landmarking, exactly like the classic path,
 * so pose, sclera and every region downstream see one consistent, un-mirrored
 * face and `mirrored: false` stays true of the buffer. Default off: an
 * unflipped photo is the common case on most current phones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { drawSelfie } from "../../src/qise/upload.js";

/** A canvas context that honours translate/scale/setTransform for one row. */
function fakeContext(width) {
  const out = new Array(width).fill(null);
  let m = [1, 0, 0, 1, 0, 0];
  return {
    out,
    translate(x, y) { m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y]; },
    scale(sx, sy) { m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]]; },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    drawImage(source, dx, _dy, dw) {
      for (let i = 0; i < source.length; i++) {
        const x = dx + (i + 0.5) * (dw / source.length);
        const tx = Math.floor(m[0] * x + m[4]);
        out[tx] = source[i];
      }
    },
    get matrix() { return m; },
  };
}

const row = ["R0", "R1", "R2", "R3", "R4", "R5"];

test("an unmirrored selfie is drawn as-is", () => {
  const ctx = fakeContext(row.length);
  drawSelfie(ctx, row, row.length, 1, { mirrored: false });
  assert.deepEqual(ctx.out, row);
});

test("a selfie marked mirrored is flipped before anything measures it", () => {
  const ctx = fakeContext(row.length);
  drawSelfie(ctx, row, row.length, 1, { mirrored: true });
  assert.deepEqual(ctx.out, [...row].reverse(),
    "the subject's right cheek must land where an un-mirrored camera frame puts it");
});

test("the flip does not leak into later drawing on the same context", () => {
  const ctx = fakeContext(row.length);
  drawSelfie(ctx, row, row.length, 1, { mirrored: true });
  assert.deepEqual(ctx.matrix, [1, 0, 0, 1, 0, 0]);
});

test("mirrored is required, never defaulted (same rule as rois.js)", () => {
  const ctx = fakeContext(row.length);
  assert.throws(() => drawSelfie(ctx, row, row.length, 1, {}), /mirrored/);
});

test("the selfie screen offers the toggle, OFF by default", () => {
  const html = readFileSync(new URL("../../src/qise.html", import.meta.url), "utf8");
  const input = html.match(/<input[^>]*id="selfie-mirrored"[^>]*>/)?.[0];
  assert.ok(input, "no mirrored-selfie toggle on the selfie panel");
  assert.match(input, /type="checkbox"/);
  assert.doesNotMatch(input, /\schecked/, "flipping by default would mirror every correct photo");
});

test("ui/qise/app.js draws the selfie through drawSelfie with the toggle's value", () => {
  const source = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  const body = source.match(/async function runSelfie\([\s\S]*?\n}\n/)?.[0] || "";
  assert.ok(body, "runSelfie not found");
  assert.match(body, /drawSelfie\(ctx, decoded\.source,[^)]*mirrored: \$\("selfie-mirrored"\)\.checked/);
  assert.doesNotMatch(body, /ctx\.drawImage\(decoded\.source/,
    "a direct draw bypasses the mirror choice");
});

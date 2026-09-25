/*
 * M1a — capture integrity: the hold, the burst and the detect clock.
 * docs/MONETISATION_AUDIT_2026-09.md, Phase 0 items 1 and 2; fixes (b) and (g).
 *
 * Pure and DOM-free, like everything else in this tree, because the two loops
 * that use it (ui/qise/app.js, beta/beta.js) cannot be imported under
 * node --test (CLAUDE.md items 18a and 44). A rule kept inline in those files
 * is a rule nothing checks — which is exactly how both defects below shipped.
 *
 * ── WHY THE HOLD MUST RESET WHEN THE FACE IS LOST ─────────────────────────
 * The loops fed GreenLatch only inside `if (mesh)`. With no face there was no
 * update and no reset, so the latch kept the start time it took before the gap.
 * A face returning two seconds later read heldMs = 2000 >= GATES_GREEN_MS on
 * its FIRST frame back and fired the burst with no sustained hold at all —
 * and with `numFaces: 1`, the face that returned need not have been the same
 * person.
 *
 * ── WHY EVERY BURST FRAME IS RE-GATED ──────────────────────────────────────
 * Once armed, the old loop pushed nine frames of ROI samples whatever the
 * gates said on those frames, and a lost face did not clear `collecting` or
 * the partial `burst`. A burst could therefore span a gap, a light change, or
 * a different face. Here any frame that is not ready ABORTS the burst — the
 * partial samples are discarded, not kept — and the hold must be earned again.
 * A burst either describes nine consecutive ready frames or it does not exist.
 *
 * ── WHY THE DETECT CLOCK IS GUARDED ────────────────────────────────────────
 * detectForVideo requires strictly increasing timestamps per landmarker. The
 * frame scheduler's `now` is increasing in practice (one outstanding
 * callback, performance.now timeline), but nothing enforced or tested it, and
 * a repeat or a step back throws inside MediaPipe. The guard nudges a
 * non-increasing value 1 ms past the last one instead of throwing; a clean
 * clock passes through untouched.
 */
import { GreenLatch, BURST_FRAMES, GATES_GREEN_MS } from "./camera.js";

export class BurstController {
  /**
   * @param {{frames?:number, holdMs?:number}} [options]
   */
  constructor({ frames = BURST_FRAMES, holdMs = GATES_GREEN_MS } = {}) {
    this.frames = frames;
    this.latch = new GreenLatch(holdMs);
    this._clearBurst();
  }

  _clearBurst() {
    this.collecting = 0;
    this.collected = 0;
    this.burst = {};
    this.armContext = null;
  }

  /**
   * One processed frame with exactly one face.
   *
   * @param {{ready:boolean, nowMs:number, settleUntil?:number,
   *          sample:()=>Object<string,*>, armContext?:*}} input
   *   `ready` is the caller's full hold condition (gates pass, capture
   *   settled, no screen assist...). `sample` is called only on frames that
   *   are actually banked. `armContext` is remembered from the frame that arms
   *   the burst (the gate margins and capture tier the reading must record).
   * @returns {{done:boolean, collecting:boolean, collected:number,
   *            progress:number, aborted:boolean, burst?:Object, armContext?:*}}
   */
  frame({ ready, nowMs, settleUntil = 0, sample, armContext = null }) {
    if (this.collecting > 0) {
      if (!ready) {
        // Re-gate: a frame that is not ready ends this burst outright.
        this._clearBurst();
        this.latch.reset();
        return { done: false, collecting: false, collected: 0, progress: 0, aborted: true };
      }
      return this._bank(sample);
    }

    const held = this.latch.update(ready, nowMs);
    if (held.ready) {
      if (nowMs < settleUntil) {
        this.latch.reset();
        return { done: false, collecting: false, collected: 0, progress: 0, aborted: false };
      }
      this.collecting = this.frames;
      this.armContext = armContext;
      return this._bank(sample);
    }
    return { done: false, collecting: false, collected: 0, progress: held.progress, aborted: false };
  }

  _bank(sample) {
    for (const [name, value] of Object.entries(sample() || {})) {
      if (value === null || value === undefined) continue;
      (this.burst[name] ||= []).push(value);
    }
    this.collecting--;
    this.collected++;
    if (this.collecting === 0) {
      const result = {
        done: true, collecting: false, collected: this.collected, progress: 1, aborted: false,
        burst: this.burst, armContext: this.armContext,
      };
      this._clearBurst();
      this.latch.reset();
      return result;
    }
    return { done: false, collecting: true, collected: this.collected, progress: 1, aborted: false };
  }

  /**
   * No single face this frame (none, or more than one). Nothing measured here
   * may count towards the hold or survive into the burst.
   */
  faceLost() {
    this._clearBurst();
    this.latch.reset();
  }

  /** The caller changed the lighting or the capture class: start again. */
  reset() {
    this.faceLost();
  }
}

/**
 * A strictly increasing timestamp sequence for ONE landmarker instance.
 * @returns {(nowMs:number)=>number}
 */
export function createMonotonicTimestamps() {
  let last = -Infinity;
  return (nowMs) => {
    const value = Number.isFinite(nowMs) && nowMs > last ? nowMs : last + 1;
    last = value;
    return value;
  };
}

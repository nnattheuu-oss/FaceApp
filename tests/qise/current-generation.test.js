/*
 * Gate 0 hardening (Part B): rows written by an earlier scanner generation
 * must not reach any production surface.
 *
 * The 9 Aug build (v13) and the current app share one IndexedDB store
 * (`qise` / `qise_readings`). The DB_VERSION 1 -> 2 upgrade rewrites every
 * old row through toRecord(), which stamps `baselineVersion: null`.
 * interpretReading() already refused those rows for the baseline, but every
 * other consumer read store.all() unfiltered:
 *
 * - planSegment adopted a legacy row's lineage and kept it, so the first
 *   current-generation scan was stamped baselineProgress = 2 and read
 *   "anchor 2 of 4" (verified by simulation, review RV1/RV10);
 * - scleraHistory fed old sclera samples into the personal drift window;
 * - history, the share column, patterns and the boot's "last reading" all
 *   showed them.
 *
 * Beta-bench rows are deliberately NOT excluded: src/beta/beta-model.js writes
 * the same v2 shape into the same store on purpose ("same origin, same person
 * ... a shared baseline"), and they carry captureClass like production rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  currentGenerationReadings, planSegment, BASELINE_VERSION,
} from "../../src/qise/baseline.js";
import { calibrationModel } from "../../src/ui/qise/screens.js";

const day = (i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString();
const axes = { a: 14, b: 12, L: 62, C: 18, periorbitalL: 55, ming: 10, run: 20 };
/** A v13 row after the DB upgrade: toRecord stamped baselineVersion null. */
const legacy = (i) => ({
  timestampIso: day(i), canonicalDay: day(i).slice(0, 10), valid: true, axes,
  baselineVersion: null, lineageId: null, captureClass: "auto",
  sclera: { rawRatios: { r: 1.2, g: 1, b: 0.9 } },
});
const current = (i, extra = {}) => ({
  timestampIso: day(i), canonicalDay: day(i).slice(0, 10), valid: true, axes,
  baselineVersion: BASELINE_VERSION, lineageId: "v1", captureClass: "auto",
  sclera: { rawRatios: { r: 1, g: 1, b: 1 } }, ...extra,
});

test("only current-generation rows survive, in order; nothing else is invented", () => {
  const rows = [legacy(0), current(1), legacy(2), current(3)];
  assert.deepEqual(currentGenerationReadings(rows).map((r) => r.timestampIso), [day(1), day(3)]);
  assert.deepEqual(currentGenerationReadings(null), []);
  assert.deepEqual(currentGenerationReadings([null, undefined, {}]), []);
});

test("beta-bench rows share the baseline by design and are kept", () => {
  const beta = current(4, { captureClass: "auto", integrated: null });
  assert.equal(currentGenerationReadings([beta]).length, 1);
});

test("a first scan after the upgrade is anchor 1, not anchor 2 (the stamped progress)", () => {
  const history = currentGenerationReadings([legacy(0)]);
  const plan = planSegment(history, {
    timestampIso: day(5), canonicalDay: day(5).slice(0, 10), captureClass: "auto", current: axes,
  });
  const progress = plan.history.filter((item) => item && item.valid !== false).length + 1;
  assert.equal(progress, 1, "a legacy row counted as an anchor");
  // Paired control: the unfiltered history is what shipped, and it gives 2.
  const unfiltered = planSegment([legacy(0)], {
    timestampIso: day(5), canonicalDay: day(5).slice(0, 10), captureClass: "auto", current: axes,
  });
  assert.equal(unfiltered.history.filter((item) => item && item.valid !== false).length + 1, 2);
});

test("the sclera drift window sees no legacy sample", () => {
  const samples = currentGenerationReadings([legacy(0), current(1)])
    .map((reading) => reading.sclera?.rawRatios).filter(Boolean);
  assert.deepEqual(samples, [{ r: 1, g: 1, b: 1 }]);
});

test("a row already stamped with inflated progress still reads its true anchor", () => {
  // Written between the v27 deploy and this fix: stored 2, but it is the only
  // current-generation reading.
  const reading = current(6, { baselineProgress: 2 });
  const model = calibrationModel(reading, currentGenerationReadings([legacy(0), reading]));
  assert.equal(model.current, 1);
  assert.match(model.verdict, /anchor 1 of 4/);
});

test("a correctly stored progress is still honoured when history is not available", () => {
  const reading = current(7, { baselineProgress: 3 });
  assert.equal(calibrationModel(reading, []).current, 3);
});

test("every production store.all() read goes through the generation filter", () => {
  const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  const reads = app.match(/store\.all\(\)/g) || [];
  assert.equal(reads.length, 1, "store.all() read outside the single filtered accessor");
  assert.match(app, /async function currentReadings\(\)\s*\{\s*return currentGenerationReadings\(await store\.all\(\)\);/);
  assert.match(app, /store\.exportAll\(\)/, "export must keep the complete set");
  for (const site of ["renderReading", "renderHistory", "shareReadings", "runSelfie"]) {
    assert.ok(app.includes(site), `${site} missing`);
  }
});

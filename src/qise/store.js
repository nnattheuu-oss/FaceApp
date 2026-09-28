/*
 * PHASE 7 — persistence.
 *
 * ── WHAT MAY BE STORED, AND WHY THE LIST IS SHORT ──────────────────────────
 * Derived observation vectors, and nothing a face could be reconstructed or
 * recognised from. No image, no ROI pixels, no landmark coordinates, no
 * embeddings. A 478-point mesh IS a biometric template: in Australia that is
 * sensitive information under the Privacy Act, in Illinois it carries a
 * private right of action with per-violation statutory damages under BIPA, and
 * Washington's My Health My Data Act is broader still. The safest way to hold
 * biometric data is not to.
 *
 * Trends compute perfectly well from the derived vectors, which is the whole
 * reason this feature can exist at all.
 *
 * ── WHY THE RECORD SHAPE IS A PURE FUNCTION ────────────────────────────────
 * `toRecord()` is separated from the IndexedDB wrapper so the assertion that
 * matters — that no persisted key looks like an image, a pixel, a landmark or
 * an embedding — runs under `node --test` against the real shaping code,
 * rather than against a description of it. A privacy guarantee tested only
 * through a database mock is a guarantee about the mock.
 */

import { projectIntegratedReading } from "./integrated.js";
import { MEASUREMENT_METHOD, sameMeasurementMethod } from "../measurement-method.js";

export const DB_NAME = "qise";
export const DB_VERSION = 2;
export const STORE_READINGS = "qise_readings";

/**
 * Keys that must never appear in a persisted record, at any depth.
 *
 * Enforced positively by `toRecord` building an explicit object, and again
 * negatively by `findForbiddenKeys` — belt and braces, because the failure
 * mode is silent and the consequence is a category of data this product has
 * promised never to hold.
 */
export const FORBIDDEN_KEY_PATTERN = /image|pixel|landmark|embedding|blob|dataUrl/i;

/** The five colours a compass component may be keyed by. */
const COMPASS_COMPONENTS = Object.freeze(["qing", "chi", "huang", "bai", "hei"]);

/**
 * Keep the scalars, drop everything else.
 *
 * ── WHY A SPREAD IS NOT AN ALLOW-LIST ──────────────────────────────────────
 * `{...r.compass.components}` looked like a copy of a map of five numbers, and
 * it is — right up until something hangs a debug payload off it. Then the
 * spread carries the payload straight through the allow-list the rest of this
 * function is built on, and the record has landmark data in it under a key
 * nobody would think to look at. That was a live defect here, caught by the
 * Phase 7 gate scanning three levels down.
 *
 * So every map persisted from this file passes through a filter that keeps
 * numbers, booleans, strings and null, and drops objects and arrays. A nested
 * structure in one of these maps is not data this record is allowed to hold.
 */
function scalarMap(obj, allowKeys = null) {
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowKeys && !allowKeys.includes(k)) continue;
    if (v === null || ["number", "boolean", "string"].includes(typeof v)) out[k] = v;
  }
  return out;
}

/**
 * Shape one reading for storage. Explicit allow-list, never a spread.
 *
 * A `{...reading}` here would persist whatever the capture path happened to
 * hang off the object — and the capture path is precisely where the pixels and
 * the mesh live.
 */
export function toRecord(reading) {
  const r = reading || {};
  // The existing v2 schema encodes sclera-corrected axes. Do not strip an
  // incompatible method tag and accidentally relabel it as a legacy v2 row.
  // Other methods need their own approved schema, not a silent migration.
  if (Object.hasOwn(r, "methodVersion")
      && !sameMeasurementMethod(r.methodVersion, MEASUREMENT_METHOD.qiseCorrected)
      && !sameMeasurementMethod(r.methodVersion, MEASUREMENT_METHOD.qiseUncorrected)) {
    throw new TypeError("Incompatible measurement method for the Qi Se record schema.");
  }
  return {
    timestampIso: r.timestampIso,

    // Both pipelines. Phase 5b needs both, and whichever loses stays stored.
    metrics: {
      raw: cleanMetrics(r.metrics && r.metrics.raw),
      corrected: cleanMetrics(r.metrics && r.metrics.corrected),
    },

    axes: scalarMap(r.axes),
    deltas: scalarMap(r.deltas),
    z: scalarMap(r.z, ["ming", "run"]),
    compass: r.compass ? {
      ascendant: r.compass.ascendant ?? null,
      magnitude: r.compass.magnitude ?? null,
      band: r.compass.band ?? null,
      components: scalarMap(r.compass.components, COMPASS_COMPONENTS),
    } : null,

    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string") : [],

    captureClass: r.captureClass ?? r.captureMode ?? null,
    captureTier: r.captureTier ?? null,
    lineageId: r.lineageId ?? null,
    baselineVersion: r.baselineVersion ?? null,
    canonicalDay: r.canonicalDay ?? null,
    readingState: r.readingState ?? null,
    baselineProgress: Number.isInteger(r.baselineProgress) ? r.baselineProgress : null,
    consentVersion: r.consentVersion ?? null,

    // Categorical experiment metadata only. Raw reflected channel responses
    // are removed before this boundary by publicIlluminationSummary().
    illumination: r.illumination ? {
      version: r.illumination.version ?? null,
      requested: Boolean(r.illumination.requested),
      outcome: r.illumination.outcome ?? "skipped",
      phasesRead: Number.isInteger(r.illumination.phasesRead) ? r.illumination.phasesRead : 0,
      reason: r.illumination.reason ?? null,
    } : null,
    composition: r.composition ? {
      basis: r.composition.basis ?? null,
      lead: r.composition.lead ?? null,
      support: r.composition.support ?? null,
      segments: scalarMap(r.composition.segments, COMPASS_COMPONENTS),
    } : null,

    // Structural and palace observations have already crossed the biometric
    // boundary. Project them again here so storage remains a positive list
    // even if a future caller attaches temporary measurement data.
    integrated: projectIntegratedReading(r.integrated),

    gateMargins: scalarMap(r.gateMargins),
    // The sclera degrade's own flag: false says this reading's colour metrics
    // are raw and it carries the qiseUncorrected method stamp. The method
    // key is emitted only when present: the schema guard below rejects an
    // unknown method, and a null written for pre-degrade rows would be
    // indistinguishable from one on the read path.
    scleraValid: r.scleraValid !== false,
    ...(Object.hasOwn(r, "methodVersion") ? { methodVersion: r.methodVersion } : {}),

    sclera: r.sclera ? {
      gains: scalarMap(r.sclera.gains, ["r", "g", "b"]),
      rawRatios: scalarMap(r.sclera.rawRatios, ["r", "g", "b"]),
      // `mads` is a nested object and is deliberately not carried: the delta
      // is what a later reading is compared against, and the MADs behind it
      // are recomputed from the history every time.
      personalDelta: scalarMap(r.sclera.personalDelta, ["r", "g", "b"]),
      confidence: r.sclera.confidence ?? null,
      // No `pixelCount`. It is a scalar integer and harmless in itself, but it
      // matches /pixel/i and so trips the Phase 7 guard — and the right
      // response to a guard firing on a field the brief never asked for is to
      // drop the field, not to loosen the pattern. Loosening it is how the
      // next thing called `...Pixels` gets through.
    } : null,

    // Per-region VALIDITY, which is a boolean and a reason — never the region's
    // geometry and never its contents.
    roiValidity: scalarMap(r.roiValidity),

    frameJitter: r.frameJitter ?? null,
    confidence: r.confidence ?? null,
    valid: r.valid !== false,
  };
}

function cleanMetrics(m) {
  if (!m) return null;
  return {
    hueVector: m.hueVector ? { a: m.hueVector.a, b: m.hueVector.b } : null,
    ming: m.ming ?? null,
    run: m.run ?? null,
    han: m.han ?? null,
    xue: m.xue ?? null,
    meanChroma: m.meanChroma ?? null,
    meanL: m.meanL ?? null,
    periorbitalL: m.periorbitalL ?? null,
    basis: m.basis ?? null,
    roisRead: m.roisRead ?? null,
  };
}

/** Every forbidden key found anywhere in a value. Used by the Phase 7 gate. */
export function findForbiddenKeys(value, path = "", found = []) {
  if (value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, found));
    return found;
  }
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(k)) found.push(`${path}${path ? "." : ""}${k}`);
    findForbiddenKeys(v, `${path}${path ? "." : ""}${k}`, found);
  }
  return found;
}

/* ── the IndexedDB wrapper ───────────────────────────────────────────────── */

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error("qise/store: request failed"));
});

/** Long enough for a slow phone's first open; short enough to be noticed. */
export const STORE_OPEN_TIMEOUT_MS = 10000;

/** The readings database could not be opened: `reason` is "blocked" or "timeout". */
export class StoreUnavailableError extends Error {
  constructor(reason) {
    super(`qise/store: the readings database could not be opened (${reason})`);
    this.name = "StoreUnavailableError";
    this.reason = reason;
  }
}

/** What to tell a person when the app cannot start because of its store. */
export function describeStoreError(error) {
  if (error?.name === "StoreUnavailableError" && error.reason === "blocked") {
    return "Mien Shiang is still open in another tab or in the installed app. Close it, then reload this page.";
  }
  if (error?.name === "StoreUnavailableError") {
    return "Your saved readings could not be opened. Close other tabs of this app, then reload this page.";
  }
  if (/no IndexedDB/.test(String(error?.message))) {
    return "This browser is not letting the app keep readings on this device. Allow site storage, then reload this page.";
  }
  return "The app did not start. Reload this page.";
}

/**
 * Open the store.
 *
 * The factory is injected for the same reason everything else here is: so the
 * wrapper can be driven under `node --test` by a fake, and so a host with no
 * IndexedDB fails loudly at the call site rather than at some later `undefined`.
 */
export async function openStore(indexedDBFactory, {
  timeoutMs = STORE_OPEN_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const idb = indexedDBFactory || (typeof indexedDB !== "undefined" ? indexedDB : null);
  if (!idb) throw new Error("qise/store: no IndexedDB available on this host");

  const req = idb.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_READINGS)) {
      db.createObjectStore(STORE_READINGS, { keyPath: "timestampIso" });
      return;
    }

    // Version 2 removes the unused device fingerprint from version 1 rows.
    const upgradeStore = req.transaction?.objectStore(STORE_READINGS);
    const cursorRequest = upgradeStore?.openCursor?.();
    if (cursorRequest) {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.update(toRecord(cursor.value));
        cursor.continue();
      };
    }
  };
  // ── AN OPEN THAT CANNOT FINISH MUST SAY SO ─────────────────────────────
  // boot() awaits this before it wires a single button. Another tab or an
  // installed copy holding an older version open BLOCKS the upgrade: the
  // browser fires `blocked` and then leaves the request pending until that
  // connection closes, which for the 9 Aug build (no versionchange handler)
  // is never. So a blocked upgrade, or an open that simply never settles,
  // ends here in a named error rather than a dead welcome screen.
  // tests/qise/store-open-bounded.test.js.
  let gaveUp = false;
  let timer = null;
  const db = await new Promise((resolve, reject) => {
    const giveUp = (reason) => {
      if (gaveUp) return;
      gaveUp = true;
      if (timer !== null) clearTimer(timer);
      reject(new StoreUnavailableError(reason));
    };
    req.onblocked = () => giveUp("blocked");
    // An upgrade that has STARTED is not blocked; a slow migration on an old
    // phone must not be reported as a hang, so the deadline stops here.
    const upgrade = req.onupgradeneeded;
    req.onupgradeneeded = (event) => {
      if (timer !== null) { clearTimer(timer); timer = null; }
      if (typeof upgrade === "function") upgrade(event);
    };
    req.onsuccess = () => {
      if (gaveUp) {
        // Opened after the page gave up: close it, or this tab becomes the
        // connection that blocks the next attempt.
        if (req.result && typeof req.result.close === "function") req.result.close();
        return;
      }
      if (timer !== null) clearTimer(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      if (gaveUp) return;
      if (timer !== null) clearTimer(timer);
      reject(req.error || new Error("qise/store: request failed"));
    };
    timer = setTimer(() => giveUp("timeout"), timeoutMs);
  });
  // The other half: this build must never be the copy that blocks a newer
  // one. Close on request; the next store call fails loudly and a reload
  // picks up the new version.
  db.onversionchange = () => {
    console.warn("qise/store: a newer version of the app needs the database; closing this connection");
    db.close();
  };

  const tx = (mode) => db.transaction(STORE_READINGS, mode).objectStore(STORE_READINGS);

  return {
    db,

    async put(reading) {
      const record = toRecord(reading);
      if (!record.timestampIso) throw new TypeError("qise/store: a reading needs a timestamp to be keyed by");

      // The guard runs on every write, not only in tests. A record shaped by a
      // future code path that forgot the allow-list must fail here rather than
      // reach the disk.
      const forbidden = findForbiddenKeys(record);
      if (forbidden.length) {
        throw new Error(`qise/store: refusing to persist ${forbidden.join(", ")} — `
          + "no image, pixel, landmark or embedding data may be stored");
      }
      await request(tx("readwrite").put(record));
      return record;
    },

    /** Oldest first, which is the order every consumer here wants. */
    async all() {
      const rows = await request(tx("readonly").getAll());
      return (rows || []).map(toRecord)
        .sort((a, b) => String(a.timestampIso).localeCompare(String(b.timestampIso)));
    },

    async exportAll() {
      return { exportedAt: new Date().toISOString(), version: DB_VERSION, readings: await this.all() };
    },

    /**
     * Wipe the object store.
     *
     * This is the bulk erase behind consent withdrawal. The production caller
     * is consent.withdraw(), which runs this as its eraser and then clears the
     * consent record itself, so it passes no clearConsent.
     *
     * clearConsent is optional, and exists for callers that own consent
     * storage directly rather than going through consent.withdraw(). It is
     * passed in rather than imported so the store never reaches into another
     * module's storage. Erasing readings while leaving a standing grant is
     * "delete everything" that deletes not-quite-everything — but preventing
     * that is consent.withdraw()'s job, not this method's.
     */
    async deleteAll({ clearConsent } = {}) {
      await request(tx("readwrite").clear());
      if (typeof clearConsent === "function") clearConsent();
      return { cleared: true, consentCleared: typeof clearConsent === "function" };
    },

    /**
     * Remove exactly one reading, by its primary key.
     *
     * This is the same-day retake path and nothing else. It is not a wipe:
     * deleteAll() above is the wipe, and the two must not be confused.
     */
    async delete(timestampIso) {
      await request(tx("readwrite").delete(timestampIso));
      return { deleted: timestampIso };
    },
  };
}

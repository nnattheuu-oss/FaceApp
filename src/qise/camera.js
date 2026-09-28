/*
 * PHASE 4 — camera capture, burst-based.
 *
 * ── WHY EVERY BROWSER OBJECT IS AN ARGUMENT ────────────────────────────────
 * `mediaDevices`, the landmarker and the clock are all injected, for the same
 * reason `createLandmarkerWithFallback()` takes its factory (CLAUDE.md item
 * 14): the paths that matter here are the FALLBACK paths — the browser that
 * strips the constraint, the browser that throws instead — and a fallback
 * nothing can execute is a fallback nobody has run. Injecting them is also the
 * only way any of this runs under `node --test`.
 *
 * ── WHY LOCKING IS AN IMPROVEMENT AND NEVER A PRECONDITION ─────────────────
 * `applyConstraints` does not reject an unsupported constraint. It silently
 * strips it and resolves successfully, so the only way to know what you got is
 * to read `getSettings()` back afterwards. Assume 'auto' is the common case:
 * Safari's ImageCapture support is partial and late, Firefox hides it behind
 * dom.imagecapture.enabled, and even where the constraint is accepted an
 * OS-level routine may override it. Every downstream metric must be valid
 * without locking, and `captureMode` is recorded on the reading so the
 * baseline can be reset when the class of capture changes.
 */
import { assertConsentGranted } from "./consent.js";
import { NO_FRAMES_MESSAGE } from "./frame-watchdog.js";

/** Nine frames keep a real median while shortening the post-lock capture. */
export const BURST_FRAMES = 9;

/** All gates must hold for this long before the burst starts. */
export const GATES_GREEN_MS = 650;

/** Trailing frames the ROI polygon vertices are averaged over. */
export const SMOOTHING_FRAMES = 20;

/** Fraction dropped from each end by L* before the per-frame median. */
export const TRIM_FRACTION = 0.10;

export const CAPTURE_CONSTRAINTS = Object.freeze({
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
});

export const CAMERA_READY_TIMEOUT_MS = 8000;

/**
 * How long getUserMedia may take, permission prompt included, before the
 * capture screen says so. Without a bound, a request that never settles left
 * the screen on "Opening the camera" forever (owner's Gate 0 run, 28 Sep:
 * permission allowed, no camera-in-use dot, no error).
 */
export const CAMERA_OPEN_TIMEOUT_MS = 12000;

/**
 * Ask mobile browsers to keep autofocus alive without touching exposure or
 * white balance. Capability detection is mandatory: unsupported advanced
 * constraints are commonly stripped without an error.
 */
export async function ensureContinuousFocus(track) {
  if (!track || typeof track.applyConstraints !== "function") {
    return { supported: false, requested: null, applied: false, error: null };
  }
  const capabilities = (typeof track.getCapabilities === "function"
    ? track.getCapabilities() : null) || {};
  const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  if (!modes.includes("continuous")) {
    return { supported: false, requested: null, applied: false, error: null };
  }
  try {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    const settings = (typeof track.getSettings === "function" ? track.getSettings() : null) || {};
    return {
      supported: true,
      requested: "continuous",
      applied: settings.focusMode === "continuous",
      error: null,
    };
  } catch (error) {
    const message = String(error?.message || error);
    console.warn("qise/camera: continuous autofocus request failed:", message);
    return { supported: true, requested: "continuous", applied: false, error: message };
  }
}

/**
 * Trigger a fresh focus scan after the sharpness gate has stayed soft. Phones
 * that expose only continuous focus simply receive the idempotent continuous
 * request; fixed-focus cameras are left untouched.
 */
export async function requestCameraRefocus(track, { settleMs = 450, wait = sleep } = {}) {
  if (!track || typeof track.applyConstraints !== "function") {
    return { supported: false, requested: null, restoredContinuous: false, error: null };
  }
  const capabilities = (typeof track.getCapabilities === "function"
    ? track.getCapabilities() : null) || {};
  const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  const requested = modes.includes("single-shot")
    ? "single-shot"
    : (modes.includes("continuous") ? "continuous" : null);
  if (!requested) {
    return { supported: false, requested: null, restoredContinuous: false, error: null };
  }
  try {
    await track.applyConstraints({ advanced: [{ focusMode: requested }] });
    let restoredContinuous = requested === "continuous";
    if (requested === "single-shot" && modes.includes("continuous")) {
      if (settleMs > 0) await wait(settleMs);
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      restoredContinuous = true;
    }
    return { supported: true, requested, restoredContinuous, error: null };
  } catch (error) {
    const message = String(error?.message || error);
    console.warn("qise/camera: refocus request failed:", message);
    return { supported: true, requested, restoredContinuous: false, error: message };
  }
}

/**
 * The face model (bundle, WASM runtime or model file) did not load, or no
 * delegate could run it. Distinct from every camera error on purpose: the
 * camera opened and the permission is fine, so describeCameraError's
 * permission advice is the wrong fix (M1a fix (d)).
 */
export class ModelLoadError extends Error {
  constructor(cause) {
    super("The face model did not load", { cause });
    this.name = "ModelLoadError";
  }
}

/**
 * Run the landmarker build step and tag any failure as a ModelLoadError. A
 * consent refusal passes through untouched: that is a gate doing its job,
 * not a load failure, and it must keep its own type.
 * @template T
 * @param {()=>Promise<T>} step
 * @returns {Promise<T>}
 */
export async function loadFaceModel(step, {
  timeoutMs = MODEL_LOAD_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let timedOut = false;
  const building = Promise.resolve().then(step);
  // A build that finishes after the deadline is closed, never left holding
  // a GPU context and a WASM heap for a capture that has already given up.
  building.then((late) => {
    if (timedOut && late && typeof late.close === "function") late.close();
  }, (error) => {
    if (timedOut) console.warn("qise/camera: face model failed after its deadline", error);
  });
  try {
    return await Promise.race([
      building,
      new Promise((_, reject) => {
        timer = setTimer(() => {
          timedOut = true;
          reject(new Error(`The face model did not load within ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error?.name === "ConsentRequiredError" || error instanceof ModelLoadError) throw error;
    throw new ModelLoadError(error);
  } finally {
    if (timer !== null && !timedOut) clearTimer(timer);
  }
}

/**
 * The first load fetches ~13 MB (WASM runtime + model) on a phone that may be
 * on a slow connection, so the bound is generous: it exists to end an
 * indefinite "Loading the face reader", not to hurry a slow network.
 */
export const MODEL_LOAD_TIMEOUT_MS = 60000;

/** A stream that opened but never delivered a decodable frame. */
export class CameraNoFramesError extends Error {
  constructor() {
    super("The camera opened but delivered no frame");
    this.name = "CameraNoFramesError";
  }
}

/** Turn browser camera errors into a useful next action rather than a dead preview. */
export function describeCameraError(error) {
  const name = error?.name || "";
  if (name === "CameraTimeoutError") {
    return "The camera didn't start. Close other apps using it, then tap Restart camera. If Chrome asked, make sure camera access is allowed.";
  }
  if (name === "CameraNoFramesError") return NO_FRAMES_MESSAGE;
  if (name === "ModelLoadError") {
    return "The face reader did not load. Your camera is fine. Check your connection, then tap Restart camera.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera access is off. Allow it in this site's settings, or choose a selfie below.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No front camera was found. Choose a selfie below instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Another app may be using the camera. Close it, retry, or choose a selfie below.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This camera could not use the requested setup. Retry, or choose a selfie below.";
  }
  if (name === "SecurityError") {
    return "The camera needs a secure page. Open the HTTPS link, or choose a selfie below.";
  }
  return "The camera did not open. Retry, check this site's camera permission, or choose a selfie below.";
}

/** The selfie path needs the same model; a load failure is not a bad photo. */
export function describeSelfieError(error) {
  if (error?.name === "ModelLoadError") {
    return "The face reader did not load. Your photo is fine. Check your connection, then choose it again.";
  }
  return "That selfie could not be read. Choose another original photo.";
}

/**
 * Attach a stream and wait for real frame dimensions before drawing it.
 * `video.play()` can resolve while Safari still reports a 0x0 frame; drawing
 * that frame throws inside requestAnimationFrame and used to leave a frozen
 * preview with the camera light still on.
 */
export async function attachCameraPreview(video, stream, {
  timeoutMs = CAMERA_READY_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!video || !stream) throw new TypeError("attachCameraPreview requires a video and stream");
  video.srcObject = stream;
  const hasFrame = () => video.videoWidth > 0 && video.videoHeight > 0;

  // The deadline is armed BEFORE play(). For a MediaStream, play() settles
  // only once a frame has been decoded, so awaiting it first left a stream
  // that never delivers one (another app holding the camera, a track that
  // opens muted) on "Starting the preview" forever, with the timer below it
  // never reached. tests/qise/camera-watchdog.test.js.
  await new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const canListen = typeof video.addEventListener === "function"
      && typeof video.removeEventListener === "function";
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (canListen) {
        video.removeEventListener("loadedmetadata", ready);
        video.removeEventListener("canplay", ready);
        video.removeEventListener("error", failed);
      }
      if (timer !== null) clearTimer(timer);
      fn(value);
    };
    const ready = () => { if (hasFrame()) finish(resolve, video); };
    const failed = () => finish(reject, new Error("The camera preview could not be decoded."));
    if (canListen) {
      video.addEventListener("loadedmetadata", ready);
      video.addEventListener("canplay", ready);
      video.addEventListener("error", failed);
    }
    timer = setTimer(() => finish(reject, new CameraNoFramesError()), timeoutMs);
    const played = typeof video.play === "function"
      ? Promise.resolve().then(() => video.play())
      : Promise.resolve();
    played.then(() => {
      if (hasFrame()) finish(resolve, video);
      else if (!canListen) finish(reject, new Error("The camera preview did not expose frame dimensions."));
    }, (error) => finish(reject, error));
  });
  return video;
}

/* ── capture mode negotiation ────────────────────────────────────────────── */

const LOCKABLE = ["whiteBalanceMode", "exposureMode"];

/**
 * How long auto-exposure and auto-white-balance get before anything is locked.
 *
 * ── WHY A LOCK WITHOUT THIS IS WORSE THAN NO LOCK ──────────────────────────
 * `exposureMode: "manual"` with no `exposureTime` alongside it does not choose
 * an exposure. It FREEZES whatever the sensor happens to be at. Applied the
 * instant `getUserMedia` resolves — before a single frame has been shown, and
 * before AE has run at all — it pins the capture to the sensor's opening
 * value, which on Android is dark because AE ramps up over roughly half a
 * second to two seconds.
 *
 * The result is a camera that visibly comes on and then stays dark for as long
 * as the user is willing to hold it there, with the underexposed gate firing
 * on every frame and the advice "find more light" unable to help, because a
 * locked exposure cannot respond to more light. That was the shipped
 * behaviour: `openCamera()` called `negotiateCaptureMode()` on the line after
 * `getUserMedia`, and the preview was not attached until afterwards.
 *
 * Locking is still worth doing — a burst measured under a moving AE is a burst
 * measured under two different illuminants. It just has to happen at a
 * converged exposure, which means after frames are flowing, not before.
 */
export const EXPOSURE_WARMUP_MS = 1500;

/** A dark frame gets an immediate preview lift and a neutral-light offer shortly after. */
export const DARK_ASSIST_DELAY_MS = 1800;

/**
 * Lock only after the sensor has produced a frame that is actually usable.
 * Elapsed time alone is not proof that Android auto-exposure has converged.
 */
export function canNegotiateCaptureMode({ gatesPass, elapsedMs, negotiationStarted }) {
  return gatesPass === true
    && Number.isFinite(elapsedMs)
    && elapsedMs >= EXPOSURE_WARMUP_MS
    && negotiationStarted !== true;
}

/** Pure UI decision for a dark scene; the raw measurement pixels are unchanged. */
export function exposureAssistState({
  underexposed, underexposedForMs = 0, screenLightEnabled = false,
}) {
  if (!underexposed) {
    return { liftPreview: false, offerScreenLight: false, message: null };
  }
  if (screenLightEnabled) {
    return {
      liftPreview: true,
      offerScreenLight: true,
      message: "Using neutral screen light — keep your face inside the guide.",
    };
  }
  const offerScreenLight = underexposedForMs >= DARK_ASSIST_DELAY_MS;
  return {
    liftPreview: true,
    offerScreenLight,
    message: offerScreenLight
      ? "This scene is too dark to measure accurately. Face a light or use the screen light."
      : "Camera is brightening the frame…",
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Let the camera settle, then lock what it settled on.
 *
 * `wait` is injected for the same reason every other browser object here is:
 * a test must not spend a real second and a half, and the warm-up is the whole
 * point of the function, so a version that skipped it under test would be
 * testing nothing.
 */
export async function settleAndNegotiate(track, { warmUpMs = EXPOSURE_WARMUP_MS, wait = sleep } = {}) {
  if (warmUpMs > 0) await wait(warmUpMs);
  return negotiateCaptureMode(track);
}

/**
 * Hand exposure and white balance back to the camera's own routine.
 *
 * Needed because a lock can be correct when taken and wrong a moment later —
 * the subject turns towards a window, or a light is switched off. Without a
 * way back, the underexposed gate tells the user to find more light while the
 * only thing that could act on more light is switched off. An instruction the
 * app has made impossible to follow is worse than no instruction.
 */
export async function releaseCaptureMode(track) {
  if (!track || typeof track.applyConstraints !== "function") {
    return { captureMode: "auto", reverted: false, error: null };
  }
  const capabilities = (typeof track.getCapabilities === "function" ? track.getCapabilities() : null) || {};
  const before = (typeof track.getSettings === "function" ? track.getSettings() : null) || {};
  const detected = LOCKABLE.filter((key) =>
    (Array.isArray(capabilities[key]) && capabilities[key].includes("continuous"))
    || before[key] === "manual");
  // A track can expose applyConstraints while hiding both capabilities and
  // settings (notably older WebViews). Ask for both, but never call it
  // reverted unless getSettings verifies the result below.
  const requested = detected.length ? detected : LOCKABLE;
  try {
    await track.applyConstraints({ advanced: [
      Object.fromEntries(requested.map((key) => [key, "continuous"])),
    ] });
    const after = (typeof track.getSettings === "function" ? track.getSettings() : null) || {};
    const reverted = requested.every((key) => after[key] === "continuous");
    const stillManual = LOCKABLE.filter((key) => after[key] === "manual");
    const captureMode = reverted
      ? "auto"
      : (stillManual.length === LOCKABLE.length ? "locked" : (stillManual.length ? "partial" : "auto"));
    return { captureMode, reverted, requested, error: null };
  } catch (e) {
    // Not swallowed. If the revert fails the capture is stuck at a bad
    // exposure, and that is worth seeing in a console rather than presenting
    // as a user who cannot find a well-lit room.
    const error = String(e && e.message ? e.message : e);
    console.warn("qise/camera: could not hand exposure back to the camera:", error);
    return { captureMode: "auto", reverted: false, requested, error };
  }
}

/**
 * Try to lock white balance and exposure, then find out what actually stuck.
 *
 * @returns {{captureMode:"locked"|"partial"|"auto", requested:string[],
 *            locked:string[], capabilities:Object, error:string|null}}
 */
export async function negotiateCaptureMode(track) {
  const capabilities = (typeof track?.getCapabilities === "function" ? track.getCapabilities() : null) || {};

  const requested = LOCKABLE.filter((k) => {
    const values = capabilities[k];
    return Array.isArray(values) && values.includes("manual");
  });

  if (requested.length === 0) {
    return { captureMode: "auto", requested: [], locked: [], capabilities, error: null };
  }

  const advanced = Object.fromEntries(requested.map((k) => [k, "manual"]));
  let error = null;
  try {
    await track.applyConstraints({ advanced: [advanced] });
  } catch (e) {
    // Not swallowed. Some browsers DO reject rather than strip, and a silent
    // catch here would present a hard failure as a successful auto capture.
    error = String(e && e.message ? e.message : e);
    console.warn("qise/camera: applyConstraints was rejected:", error);
  }

  // The verification step. A resolved applyConstraints is not evidence.
  const settings = (typeof track.getSettings === "function" ? track.getSettings() : null) || {};
  const locked = requested.filter((k) => settings[k] === "manual");

  const captureMode = locked.length === LOCKABLE.length
    ? "locked"
    : (locked.length > 0 ? "partial" : "auto");

  return { captureMode, requested, locked, capabilities, error };
}

/**
 * getUserMedia with a deadline. A stream that arrives after the deadline is
 * stopped at once: the screen has already told the person the camera did not
 * start, and a camera left running behind that message is the worst outcome.
 */
function boundedGetUserMedia(mediaDevices, constraints, { timeoutMs, setTimer, clearTimer }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimer(() => {
      if (settled) return;
      settled = true;
      const error = new Error(`qise/camera: no camera stream after ${timeoutMs} ms`);
      error.name = "CameraTimeoutError";
      reject(error);
    }, timeoutMs);
    Promise.resolve()
      .then(() => mediaDevices.getUserMedia(constraints))
      .then((stream) => {
        if (settled) {
          const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
          for (const track of tracks) track.stop();
          console.warn("qise/camera: a camera stream arrived after the deadline and was stopped");
          return;
        }
        settled = true;
        clearTimer(timer);
        resolve(stream);
      }, (error) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        reject(error);
      });
  });
}

/**
 * Open the camera. Nothing above this line may run before consent.
 *
 * The assertion is the Phase 0a enforcement point, and it throws rather than
 * returning a status: a boolean can be ignored by a caller that forgot to
 * check it, and the whole point is that there is no path around it.
 */
export async function openCamera({
  consent, mediaDevices, constraints = CAPTURE_CONSTRAINTS, negotiate = true,
  timeoutMs = CAMERA_OPEN_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  assertConsentGranted(consent, "getUserMedia");

  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error("qise/camera: no mediaDevices.getUserMedia available on this host");
  }

  const stream = await boundedGetUserMedia(mediaDevices, constraints, { timeoutMs, setTimer, clearTimer });
  const [track] = stream.getVideoTracks();

  // `negotiate: false` is what the live capture path uses. Locking here is
  // locking before the first frame exists — see EXPOSURE_WARMUP_MS. The
  // default stays true so a caller that genuinely wants the old one-shot
  // behaviour still has it, and so the negotiation keeps a direct test.
  if (!negotiate) {
    return { stream, track, captureMode: "pending", requested: [], locked: [], capabilities: null, error: null };
  }

  const negotiated = await negotiateCaptureMode(track);
  return { stream, track, ...negotiated };
}

/**
 * Build a face landmarker, but only once consent exists.
 *
 * The factory is injected exactly as in src/landmarker.js. This wrapper exists
 * so that BOTH doors into biometric processing — the camera and the mesh —
 * carry the same assertion, rather than the camera carrying it and the mesh
 * being reachable from a still image nobody thought about.
 */
export async function createLandmarkerGuarded({ consent, factory, options }) {
  assertConsentGranted(consent, "FaceLandmarker");
  if (typeof factory !== "function") {
    throw new TypeError("createLandmarkerGuarded requires an injected factory");
  }
  return factory(options);
}

/* ── ROI polygon smoothing ───────────────────────────────────────────────── */

/**
 * Rolling mean of ROI polygon vertices over the trailing frames.
 *
 * Sampling from the instantaneous polygon means the region jitters with the
 * landmarker frame to frame, and that jitter lands directly in the colour
 * measurement as the polygon slides on and off the boundary of the feature.
 * Averaging the VERTICES is not the same as averaging the measurements: it
 * stabilises where we look, before anything is read.
 */
export class PolygonSmoother {
  constructor(window = SMOOTHING_FRAMES) {
    this.window = window;
    this.frames = [];
  }

  /** @param {Object<string, Array<Array<{x:number,y:number}>>>} polygonsByRoi */
  push(polygonsByRoi) {
    this.frames.push(polygonsByRoi);
    if (this.frames.length > this.window) this.frames.shift();
    return this;
  }

  get length() { return this.frames.length; }

  /**
   * The averaged polygons.
   *
   * Vertex counts can change between frames when a hull gains or loses a
   * point, so a frame whose vertex count disagrees with the most recent one is
   * skipped rather than averaged element-wise into nonsense.
   */
  mean() {
    if (this.frames.length === 0) return null;
    const latest = this.frames[this.frames.length - 1];
    const out = {};

    for (const [roi, polys] of Object.entries(latest)) {
      out[roi] = polys.map((poly, pi) => {
        const acc = poly.map(() => ({ x: 0, y: 0 }));
        let n = 0;
        for (const frame of this.frames) {
          const candidate = frame[roi] && frame[roi][pi];
          if (!candidate || candidate.length !== poly.length) continue;
          candidate.forEach((v, i) => { acc[i].x += v.x; acc[i].y += v.y; });
          n++;
        }
        return n === 0 ? poly : acc.map((v) => ({ x: v.x / n, y: v.y / n }));
      });
    }
    return out;
  }
}

/* ── burst reduction ─────────────────────────────────────────────────────── */

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Linear-interpolated quantile, so the IQR is stable at small n. */
function quantile(xs, q) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const iqr = (xs) => (xs.length ? quantile(xs, 0.75) - quantile(xs, 0.25) : null);

/**
 * One frame's Lab for one region: trimmed by L*, then the median.
 *
 * The trim is by L* and the SAME pixels are then used for a* and b*, rather
 * than each channel being trimmed on its own. Trimming per channel would
 * average three different subsets of the region and report the result as one
 * colour.
 */
export function trimmedMedianLab(pixels, color, trim = TRIM_FRACTION) {
  if (!pixels || pixels.length === 0) return null;

  const labs = pixels.map((p) => color.labFromSrgb8(p.r, p.g, p.b));
  labs.sort((a, b) => a.L - b.L);

  const drop = Math.floor(labs.length * trim);
  const kept = labs.length - 2 * drop >= 1 ? labs.slice(drop, labs.length - drop) : labs;

  return {
    L: median(kept.map((l) => l.L)),
    a: median(kept.map((l) => l.a)),
    b: median(kept.map((l) => l.b)),
  };
}

/**
 * Collapse a burst to one Lab per region, plus the stability signal.
 *
 * `frameJitter` is the free by-product: the IQR across frames says how much
 * the measurement moved while the subject was holding still, which is sensor
 * noise plus residual AWB hunting. A high jitter degrades the reading's
 * confidence rather than being hidden inside a mean.
 *
 * @param {Object<string, Array<{L:number,a:number,b:number}>>} perFrame
 */
export function reduceBurst(perFrame) {
  const lab = {};
  const jitterByRoi = {};

  for (const [roi, frames] of Object.entries(perFrame)) {
    const usable = frames.filter(Boolean);
    if (usable.length === 0) { lab[roi] = null; jitterByRoi[roi] = null; continue; }

    lab[roi] = {
      L: median(usable.map((f) => f.L)),
      a: median(usable.map((f) => f.a)),
      b: median(usable.map((f) => f.b)),
      frames: usable.length,
    };
    const j = {
      L: iqr(usable.map((f) => f.L)),
      a: iqr(usable.map((f) => f.a)),
      b: iqr(usable.map((f) => f.b)),
    };
    jitterByRoi[roi] = { ...j, magnitude: Math.hypot(j.L, j.a, j.b) };
  }

  // The overall figure is the MEDIAN across regions, not the maximum. One
  // region sitting on a moving shadow should not condemn the whole reading —
  // ROI validity is what handles a region that has genuinely gone bad, and
  // making both checks fire on the same event double-counts it.
  const magnitudes = Object.values(jitterByRoi).filter(Boolean).map((j) => j.magnitude);
  return { lab, frameJitter: { byRoi: jitterByRoi, overall: median(magnitudes) } };
}

/* ── the sustained-green latch ───────────────────────────────────────────── */

/**
 * All gates green continuously for GATES_GREEN_MS, then fire once.
 *
 * There is no shutter button: the capture happens when the frame is good, and
 * the only copy on screen is one line for the worst-margin failure. A latch
 * rather than a timer, because a single bad frame must reset the clock — the
 * point is a sustained good frame, not a good frame nine hundred milliseconds
 * after a bad one.
 */
export class GreenLatch {
  constructor(holdMs = GATES_GREEN_MS) {
    this.holdMs = holdMs;
    this.since = null;
    this.fired = false;
  }

  /** @returns {{ready:boolean, heldMs:number, progress:number}} */
  update(gatesPass, nowMs) {
    if (!gatesPass) {
      this.since = null;
      return { ready: false, heldMs: 0, progress: 0 };
    }
    if (this.since === null) this.since = nowMs;
    const heldMs = nowMs - this.since;
    const ready = heldMs >= this.holdMs && !this.fired;
    if (ready) this.fired = true;
    return { ready, heldMs, progress: Math.min(1, heldMs / this.holdMs) };
  }

  reset() { this.since = null; this.fired = false; }
}

/* ── teardown ────────────────────────────────────────────────────────────── */

/**
 * Drop every pixel and every landmark, in this tick.
 *
 * The buffers are ZEROED and not merely dereferenced. Nulling a reference asks
 * the garbage collector to get round to it, on its own schedule, while the
 * bytes — a face, and a mesh that is a biometric template — sit in memory. The
 * privacy posture is that the photograph is measured and discarded, so
 * discarding it is an action, not a hint.
 *
 * @param {{canvas?:Object, images?:Array, landmarks?:Array, stream?:Object}} scratch
 */
export function releaseCapture(scratch) {
  const released = {
    images: 0, landmarkArrays: 0, canvasCleared: false, tracksStopped: 0,
    landmarkerClosed: false, previewCleared: false, wakeLockReleased: false,
    lifecycleDisposed: false,
  };
  if (!scratch) return released;

  for (const image of scratch.images || []) {
    if (image && image.data && typeof image.data.fill === "function") {
      image.data.fill(0);
      released.images++;
    }
  }
  for (const arr of scratch.landmarks || []) {
    if (Array.isArray(arr)) { arr.length = 0; released.landmarkArrays++; }
  }
  if (scratch.canvas) {
    // Collapsing the backing store is what actually frees it; a clearRect
    // leaves a full-size buffer of transparent pixels allocated.
    scratch.canvas.width = 0;
    scratch.canvas.height = 0;
    released.canvasCleared = true;
  }
  if (scratch.stream && typeof scratch.stream.getTracks === "function") {
    for (const t of scratch.stream.getTracks()) {
      if (typeof t.stop === "function") { t.stop(); released.tracksStopped++; }
    }
  }
  if (scratch.landmarker && typeof scratch.landmarker.close === "function") {
    scratch.landmarker.close();
    released.landmarkerClosed = true;
  }
  if (scratch.video && "srcObject" in scratch.video) {
    if (typeof scratch.video.pause === "function") scratch.video.pause();
    scratch.video.srcObject = null;
    released.previewCleared = true;
  }
  // The screen goes back to the OS idle timer here rather than at each call
  // site, because there are four ways out of a capture — the burst completing,
  // the loop error handler, a re-entrant runCapture(), and withdrawal — and a
  // lock released on only some of them leaves the phone awake indefinitely.
  // Deliberately NOT awaited: this function is synchronous by contract, and
  // release() resolves rather than rejecting (it logs its own failures), so
  // there is no rejection to strand.
  // The lifecycle watcher (qise/capture-lifecycle.js) goes with the capture
  // it watches, on every way out, so a dead capture never restarts itself.
  if (scratch.lifecycle && typeof scratch.lifecycle.dispose === "function") {
    scratch.lifecycle.dispose();
    released.lifecycleDisposed = true;
  }
  if (scratch.wakeLock && typeof scratch.wakeLock.release === "function") {
    scratch.wakeLock.release();
    released.wakeLockReleased = true;
  }

  scratch.images = null;
  scratch.landmarks = null;
  scratch.canvas = null;
  scratch.stream = null;
  scratch.landmarker = null;
  scratch.video = null;
  scratch.wakeLock = null;
  scratch.lifecycle = null;
  return released;
}

/*
 * The last unbounded wait in the live capture: frames that never arrive.
 *
 * The loop is driven by decoded frames (frame-scheduler.js), so when a stream
 * stops delivering them — or never delivers the first — step() never runs and
 * nothing on screen can change. The lifecycle watcher only hears `ended` and
 * `mute` EVENTS; a track that opens already muted, or a camera another app is
 * holding, sends none. So the loop measures the silence itself.
 *
 * Pure and DOM-free: ui/qise/app.js cannot be imported under node --test, so
 * the rule lives here. tests/qise/camera-watchdog.test.js.
 */

/**
 * How long without a decoded frame before the camera itself is blamed. Even a
 * thermally throttled phone at 10 fps is 100 ms per frame, so 4 s is forty
 * missed frames: never a slow camera, always a stopped one.
 */
export const FRAME_STALL_MS = 4000;

/**
 * Automatic restarts allowed before a face has been found. One: a camera
 * lost to a notification or a call comes back on its own, but a camera that
 * keeps muting (a privacy toggle, another app) would otherwise restart itself
 * forever, cycling through startup steps without ever saying why.
 */
export const MAX_AUTO_RECOVERIES = 1;

const NO_FRAMES = {
  id: "no-frames",
  title: "The camera isn't sending pictures",
  detail: "On Android, open Quick Settings and make sure Camera access is on. Close other camera apps, then tap Restart camera.",
};

/**
 * @param {{startedAt:number, visibleSince:number, lastFrameAt:number|null,
 *          now:number, visible:boolean, stallMs?:number}} input
 * @returns {null | {id:string, title:string, detail:string}}
 */
export function frameStall({
  startedAt, visibleSince = startedAt, lastFrameAt = null, now, visible, stallMs = FRAME_STALL_MS,
}) {
  // No camera delivers frames to a hidden page; that is not a fault.
  if (!visible) return null;
  const since = Math.max(startedAt ?? -Infinity, visibleSince ?? -Infinity, lastFrameAt ?? -Infinity);
  if (!Number.isFinite(since) || now - since < stallMs) return null;
  return { ...NO_FRAMES };
}

export function shouldAutoRecover({ recoveriesSinceFace = 0 } = {}) {
  return recoveriesSinceFace < MAX_AUTO_RECOVERIES;
}

export const NO_FRAMES_MESSAGE = `${NO_FRAMES.title}. ${NO_FRAMES.detail}`;

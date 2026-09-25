/*
 * M1a fix (c) — recover a capture the OS has taken the camera away from.
 * docs/MONETISATION_AUDIT_2026-09.md, Phase 0 item 4.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Backgrounding, an incoming call, the lock screen or a permission revoked
 * mid-scan can END the video track (Android, and iOS standalone PWAs) or MUTE
 * it (iOS interruption). Either way no new frame is ever decoded, so the
 * frame scheduler's rVFC never fires again and the capture loop silently
 * stops: the screen freezes on its last prompt with the camera light off. The
 * loop had no visibilitychange / track `ended` / `mute` handling at all; the
 * only way out was a person finding "Restart camera".
 *
 * ── WHAT IT DOES, AND DELIBERATELY DOES NOT ────────────────────────────────
 * - A track that ends or mutes while the page is VISIBLE recovers at once.
 * - One that dies while the page is HIDDEN waits: no camera can be reopened
 *   for a hidden page, and trying burns the recovery on a guaranteed failure.
 * - Returning to the page with a healthy, live, unmuted track does NOTHING.
 *   Restarting a capture that still works would throw away a hold in
 *   progress for no reason.
 * - It fires ONCE. The caller's recovery starts a new capture (and a new
 *   watcher); a second event on the dead track must not start a second one.
 *
 * Browser objects are injected (CLAUDE.md item 14) so the paths a desktop
 * never takes run under node --test. `releaseCapture()` disposes it, so every
 * way out of a capture removes its listeners.
 */

/**
 * @param {{documentRef:Object|null, track:Object|null,
 *          onRecover:(reason:"track-ended"|"track-muted")=>void}} deps
 * @returns {{dispose:()=>void}}
 */
export function watchCaptureLifecycle({ documentRef, track, onRecover }) {
  const canListen = (t) => t && typeof t.addEventListener === "function"
    && typeof t.removeEventListener === "function";
  let fired = false;
  let disposed = false;

  const isVisible = () => !documentRef || documentRef.visibilityState !== "hidden";
  const deadReason = () => {
    if (!track) return null;
    if (track.readyState === "ended") return "track-ended";
    if (track.muted === true) return "track-muted";
    return null;
  };
  const maybeRecover = () => {
    if (fired || disposed || !isVisible()) return;
    const reason = deadReason();
    if (!reason) return;
    fired = true;
    onRecover(reason);
  };

  const onVisibility = () => maybeRecover();
  const onTrackEvent = () => maybeRecover();

  if (canListen(documentRef)) documentRef.addEventListener("visibilitychange", onVisibility);
  if (canListen(track)) {
    track.addEventListener("ended", onTrackEvent);
    track.addEventListener("mute", onTrackEvent);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (canListen(documentRef)) documentRef.removeEventListener("visibilitychange", onVisibility);
      if (canListen(track)) {
        track.removeEventListener("ended", onTrackEvent);
        track.removeEventListener("mute", onTrackEvent);
      }
    },
  };
}

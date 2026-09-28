import { test, expect } from "@playwright/test";
import { openCapture } from "./support/flat-feed.js";

/**
 * A camera that opens and never delivers a frame — what another app holding
 * the sensor, or a track that opens muted, looks like to the page. Emulated
 * with canvas.captureStream(0), which produces a frame only on requestFrame(),
 * so a stream that is never asked delivers none.
 *
 * Before the fix, attachCameraPreview awaited video.play() before arming its
 * deadline; play() on a frameless MediaStream never settles, so the screen sat
 * on "Starting the preview" indefinitely. tests/qise/camera-watchdog.test.js
 * pins the unit; this pins the production page end to end.
 */
test.use({ permissions: ["camera"] });

test("a camera that never sends a frame is named, within a bounded time", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 240;
      return canvas.captureStream(0);
    };
  });
  await openCapture(page);
  const line = page.locator("#gate-line");
  await expect(line).toHaveText(/The camera isn't sending pictures/, { timeout: 20000 });
  await expect(line).not.toHaveText(/Starting the preview|Opening the camera/);
});

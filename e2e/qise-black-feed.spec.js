import { test, expect } from "@playwright/test";
import { flatFeed, feedArgs, openCapture } from "./support/flat-feed.js";

/**
 * The PRODUCTION capture loop against a real (fake-device) camera stream —
 * the path the owner's Gate 0 run took on 28 Sep: camera allowed, no face
 * found, and the screen said "Opening the camera" forever because the no-face
 * branch overwrote its own prompt with captureInstruction(null). Until these
 * specs only the beta bench was ever driven with a camera feed.
 */
test.use({
  permissions: ["camera"],
  launchOptions: { args: feedArgs(flatFeed("black", 16)) },
});

test("a black feed is named, never reported as the camera still opening", async ({ page }) => {
  await openCapture(page);
  const line = page.locator("#gate-line");
  await expect(line).toHaveText(/The camera is sending a black picture/, { timeout: 20000 });
  await expect(line).not.toHaveText(/Opening the camera/);
  expect(await page.locator("#preview").evaluate((v) => Boolean(v.srcObject))).toBe(true);
});

// Review note on PR #10: black frames are still frames. The frame watchdog
// keys on decoded frames, so a camera delivering black must keep the
// black-picture message and must never be treated as stalled or restarted.
test("black frames never trip the frame watchdog or an automatic restart", async ({ page }) => {
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  await openCapture(page);
  const line = page.locator("#gate-line");
  await expect(line).toHaveText(/The camera is sending a black picture/, { timeout: 20000 });
  // FRAME_STALL_MS is 4 s and the watchdog ticks every second; 7 s is past
  // any stall it could declare.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(/The camera is sending a black picture/);
  expect(logs.filter((t) => /camera lost|no-frames|not restarting/.test(t))).toEqual([]);
});

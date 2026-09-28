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

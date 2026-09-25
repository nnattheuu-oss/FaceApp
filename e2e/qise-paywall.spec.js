import { test, expect } from "@playwright/test";
import {
  buildSyntheticCapture, fakeMediaPipeModuleSource, fakeGetUserMediaInitScript,
} from "./support/synthetic-capture.js";

/*
 * The v1 hard paywall on the REAL production reading screen
 * (DR-2026-09-23-LAUNCH-V1, L-03/L-05), driven through a complete synthetic
 * capture. ui/qise/app.js cannot be imported under node --test (CLAUDE.md
 * items 18a, 44), so this is the only check that the gating decisions in
 * paywall.js actually reach the DOM.
 *
 * Paired: the same capture, once with no Play Billing (a plain browser: paid
 * content must be ABSENT from the DOM) and once with a fake Digital Goods
 * service reporting the lifetime purchase (paid content present, with the
 * L-05 label on the palaces).
 */
test.use({ serviceWorkers: "block" });

async function installSyntheticCamera(page, capture) {
  await page.route("**/vendor/mediapipe/vision_bundle.mjs", (route) => route.fulfill({
    contentType: "text/javascript",
    body: fakeMediaPipeModuleSource(capture.normalizedLandmarks),
  }));
  await page.addInitScript(fakeGetUserMediaInitScript(capture));
}

async function captureToReading(page) {
  await page.goto("/qise.html");
  await page.click("#consent-next");
  await page.click("#consent-grant");
  await expect(page.locator("#screen-reading")).toHaveAttribute("data-active", "true", { timeout: 20000 });
}

const LABEL = "SpiritMaxx interpretation, inspired by classical Mien Shiang.";

test("without a Play purchase, paid content is absent from the DOM and the free reading stays whole", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await installSyntheticCamera(page, buildSyntheticCapture());
  await captureToReading(page);

  const story = page.locator("#reading-structure-story");
  await expect(page.locator("#reading-label")).toHaveText(LABEL);
  await expect(story.locator(".paywall")).toHaveAttribute("data-paywall-state", "unsupported");
  await expect(story).toContainText("Three Sections");

  const html = await story.innerHTML();
  expect(html).not.toContain("palace-collection");
  // The paywall itself names what the full reading adds; the SECTION must be absent.
  expect(html).not.toContain('<p class="eyebrow">Five Elements</p>');
  expect(html).not.toContain("Life Palace");
  expect(await page.locator("#reading-integrated").isHidden()).toBe(true);
  await expect(page.locator("#today-palaces")).toHaveText("See the full reading");
  // No offer, no price, while Play is absent.
  expect(await story.locator("[data-buy]").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("with the lifetime purchase listed by Play, tradition palaces open on heritage prose and disputed ones on the L-05 label", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.getDigitalGoodsService = async (method) => {
      if (method !== "https://play.google.com/billing") throw new Error("unexpected method");
      return {
        listPurchases: async () => [{ itemId: "spiritmaxx_full_reading_lifetime", purchaseToken: "e2e" }],
        getDetails: async () => [],
      };
    };
  });
  await installSyntheticCamera(page, buildSyntheticCapture());
  await captureToReading(page);

  await page.click("[data-reading-tab='story']");
  const story = page.locator("#reading-structure-story");
  await expect(story.locator("#palace-collection")).toBeVisible();
  expect(await story.locator(".paywall").count()).toBe(0);
  expect(await story.innerHTML()).toContain('<p class="eyebrow">Five Elements</p>');
  expect(await story.locator(".palace-card").count()).toBe(12);

  // M0 reconciliation (DR-2026-09-25-M0-CONSOLIDATION): a tradition palace
  // opens on its attributed heritage reading, with no app-authored label...
  await story.locator(".palace-card[data-palace='life'] .palace-enter").click();
  const life = story.locator(".palace-card[data-palace='life'] .palace-reveal");
  await expect(life).toContainText("Taiqing Shenjian");
  await expect(life).not.toContainText("not read from your face");
  // ...and a source-disputed palace opens on the L-05 interpretation and the
  // label, so no paid palace is an empty box.
  await story.locator(".palace-card[data-palace='wealth'] .palace-enter").click();
  const wealth = story.locator(".palace-card[data-palace='wealth'] .palace-reveal");
  await expect(wealth).toContainText(LABEL);
  await expect(wealth).toContainText("not read from your face");
  await expect(page.locator("#today-palaces")).toHaveText("Enter 12 palaces");
  expect(errors).toEqual([]);
});

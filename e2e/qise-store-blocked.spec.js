import { test, expect } from "@playwright/test";

/**
 * boot() awaits the readings database before it wires a single button. This
 * build opens IndexedDB `qise` at version 2; a tab or installed copy still
 * holding version 1 open (the 9 Aug build never closes on versionchange)
 * BLOCKS that upgrade, and the browser leaves the request pending for as long
 * as the old copy stays open. Before the fix the welcome screen rendered and
 * ignored every tap, with the failure only in the console.
 */
test("a database held open by an old copy is named on screen; closing it lets the app start", async ({ context }) => {
  const old = await context.newPage();
  await old.goto("/privacy.html");
  await old.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("qise", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("qise_readings", { keyPath: "timestampIso" });
    req.onsuccess = () => { window.heldDb = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  }));

  const page = await context.newPage();
  await page.goto("/qise.html");
  await expect(page.locator("#boot-error")).toHaveText(/another tab or in the installed app/, { timeout: 15000 });

  // Paired control: the same page starts normally once the old copy is gone.
  await old.close();
  await page.reload();
  await expect(page.getByRole("button", { name: /Begin my reading/ })).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#boot-error")).toHaveCount(0);
});

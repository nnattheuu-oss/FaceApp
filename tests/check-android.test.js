/*
 * The L-11 Android wrapper check, with paired controls: a compliant project
 * passes, and each defect it exists to catch is caught on its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkAndroidProject, MIN_TARGET_SDK } from "../scripts/check-android.mjs";

const manifest = (over = {}) => JSON.stringify({
  packageId: "app.example.mienshiang", host: "example.app",
  alphaDependencies: { enabled: true }, features: { playBilling: { enabled: true } }, ...over,
});
const gradle = (target = 36, billing = true) => `
android {
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion ${target}
    }
}
dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
    ${billing ? "implementation 'com.google.androidbrowserhelper:billing:1.1.0'" : ""}
}`;

test("a compliant project passes (positive control)", () => {
  assert.deepEqual(checkAndroidProject({ twaManifest: manifest(), appGradle: gradle(36) }), []);
  assert.deepEqual(checkAndroidProject({ twaManifest: manifest(), appGradle: gradle(37) }), []);
  assert.equal(MIN_TARGET_SDK, 36);
});

test("the Bubblewrap default of targetSdk 35 is rejected", () => {
  const f = checkAndroidProject({ twaManifest: manifest(), appGradle: gradle(35) });
  assert.ok(f.some((x) => /targetSdkVersion 35 is below 36/.test(x)), f.join("; "));
});

test("Kotlin DSL targetSdk = 35 is rejected too", () => {
  const kts = gradle(36).replace("targetSdkVersion 36", "targetSdk = 35");
  assert.ok(checkAndroidProject({ twaManifest: manifest(), appGradle: kts }).some((x) => /below 36/.test(x)));
});

test("Play Billing disabled, or its dependency missing, is rejected", () => {
  const off = checkAndroidProject({ twaManifest: manifest({ features: {} }), appGradle: gradle() });
  assert.ok(off.some((x) => /playBilling/.test(x)));
  const noDep = checkAndroidProject({ twaManifest: manifest(), appGradle: gradle(36, false) });
  assert.ok(noDep.some((x) => /billing dependency missing/.test(x)));
});

test("the committed template is Play-Billing-enabled but cannot pass until its placeholders are replaced", () => {
  const template = readFileSync(new URL("../android/twa-manifest.template.json", import.meta.url), "utf8");
  const parsed = JSON.parse(template);
  assert.equal(parsed.features.playBilling.enabled, true);
  assert.equal(parsed.alphaDependencies.enabled, true);
  assert.equal(parsed.startUrl, "/qise.html");
  const f = checkAndroidProject({ twaManifest: template, appGradle: gradle(36) });
  assert.deepEqual(f, ["twa-manifest.json still contains a REPLACE_ placeholder"]);
});

#!/usr/bin/env node
/*
 * Launch v1 Android wrapper check (DR-2026-09-23-LAUNCH-V1, L-03 and L-11).
 *
 *   node scripts/check-android.mjs <bubblewrap-project-dir>
 *
 * Run it on the project `bubblewrap init` generated, BEFORE building the AAB.
 * It fails on each thing that would otherwise fail quietly later:
 *
 *   - targetSdkVersion below 36. Play requires new apps to target Android 16
 *     (API 36) from 31 August 2026, and the Bubblewrap template has been
 *     reported to ship 35. A rejected upload is the good outcome; the bad one
 *     is nobody noticing until the listing deadline.
 *   - Play Billing not enabled in twa-manifest.json, or the billing dependency
 *     missing from the app module. Without it getDigitalGoodsService() throws,
 *     the paywall reports Play as unreachable, and nobody can pay.
 *   - A REPLACE_ placeholder from android/twa-manifest.template.json left in.
 *
 * It deliberately does NOT check the signing key, the package ID's value or
 * assetlinks.json -- those are owner-held (L-11: the owner holds the upload
 * key) and DEPLOY.md covers them.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const MIN_TARGET_SDK = 36;

/** Pure: findings for a project, given its file contents. */
export function checkAndroidProject({ twaManifest, appGradle }) {
  const findings = [];
  if (!twaManifest) findings.push("twa-manifest.json not found");
  if (!appGradle) findings.push("app/build.gradle not found");
  if (findings.length) return findings;

  let manifest;
  try { manifest = JSON.parse(twaManifest); } catch { return ["twa-manifest.json is not valid JSON"]; }
  if (manifest?.features?.playBilling?.enabled !== true) {
    findings.push("twa-manifest.json: features.playBilling.enabled must be true (L-03)");
  }
  if (manifest?.alphaDependencies?.enabled !== true) {
    findings.push("twa-manifest.json: alphaDependencies.enabled must be true for Play Billing");
  }
  if (/REPLACE_/.test(twaManifest)) {
    findings.push("twa-manifest.json still contains a REPLACE_ placeholder");
  }

  const targets = [...appGradle.matchAll(/targetSdk(?:Version)?\s*[=(]?\s*(\d+)/g)].map((m) => Number(m[1]));
  if (!targets.length) findings.push("app/build.gradle: no targetSdkVersion found");
  for (const t of targets) {
    if (t < MIN_TARGET_SDK) findings.push(`app/build.gradle: targetSdkVersion ${t} is below ${MIN_TARGET_SDK} (L-11)`);
  }
  if (!/com\.google\.androidbrowserhelper:billing:/.test(appGradle)) {
    findings.push("app/build.gradle: com.google.androidbrowserhelper:billing dependency missing (L-03)");
  }
  return findings;
}

if (process.argv[1]?.endsWith("check-android.mjs")) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/check-android.mjs <bubblewrap-project-dir>");
    process.exit(2);
  }
  const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : null);
  const findings = checkAndroidProject({
    twaManifest: read("twa-manifest.json"),
    appGradle: read("app/build.gradle") ?? read("app/build.gradle.kts"),
  });
  if (findings.length) {
    console.error(`FAIL: ${findings.length} finding(s)`);
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`OK: targetSdk >= ${MIN_TARGET_SDK}, Play Billing enabled, no placeholders.`);
}

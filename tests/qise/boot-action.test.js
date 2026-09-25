/*
 * M1a boot fix (docs/MONETISATION_AUDIT_2026-09.md, restriction sweep row 14).
 *
 * A consented person with no stored reading — consent granted, then the tab
 * closed or the camera refused before the first reading finished — booted to
 * `screen-capture` via a bare show(). Nothing opened the camera: the only
 * call to runCapture() is behind the consent button, which that person never
 * sees again. They landed on a capture screen with no preview and a prompt
 * waiting for a face, at the exact moment the funnel is widest.
 *
 * consentBootAction() says what the boot must DO, not only where it lands;
 * the static guard pins that ui/qise/app.js acts on it and surfaces a failure
 * instead of swallowing it (CLAUDE.md Verification Protocol item 6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { consentBootAction, consentBootTarget } from "../../src/qise/consent.js";

test("a consented person with no reading boots straight into a running capture", () => {
  assert.deepEqual(consentBootAction(true, false), { screen: "screen-capture", startCapture: true });
});

test("consent still outranks everything, and a reading still opens the reading", () => {
  assert.deepEqual(consentBootAction(false, false), { screen: "screen-consent", startCapture: false });
  assert.deepEqual(consentBootAction(false, true), { screen: "screen-consent", startCapture: false });
  assert.deepEqual(consentBootAction(true, true), { screen: "screen-reading", startCapture: false });
});

test("the action agrees with the existing boot target in every case", () => {
  for (const granted of [true, false, undefined, "true"]) {
    for (const hasReading of [true, false]) {
      assert.equal(consentBootAction(granted, hasReading).screen, consentBootTarget(granted, hasReading));
    }
  }
});

test("only a real grant can start the camera at boot", () => {
  for (const granted of [false, undefined, null, "true", 1]) {
    assert.equal(consentBootAction(granted, false).startCapture, false);
  }
});

test("ui/qise/app.js boot starts the capture, and reports a failure instead of stranding it", () => {
  const source = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");
  const tail = source.slice(source.lastIndexOf("const last = (await store.all())"));
  assert.match(tail, /consentBootAction\(consent\.isGranted\(\), Boolean\(last\)\)/);
  assert.match(tail, /if \(action\.startCapture\)[\s\S]*?await runCapture\(\)/,
    "the boot must open the camera for a consented person with no reading");
  assert.match(tail, /catch \((\w+)\) \{[\s\S]*?describeCameraError\(\1\)/,
    "a camera that fails to open at boot must say why");
  assert.doesNotMatch(tail, /consentBootTarget\(/, "the target alone lands without acting");
});

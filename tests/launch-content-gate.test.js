/*
 * The v1 content gate (owner decision L-06, DR-2026-09-23-LAUNCH-V1).
 *
 * L-10 says copy/corpus changes need only the lexicon lint, not
 * falsification-first tests. The LINT ITSELF is not copy, though: a rule that
 * matches nothing passes everything. So each claim family carries paired
 * controls here -- sentences it must catch, and honest sentences it must NOT
 * catch (abstentions, disclaimers, the tradition's own palace names) -- run in
 * the same file, per CLAUDE.md Verification Protocol §3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAUNCH_CONTENT_RULES, READING_SURFACE_FILES, findLaunchContentViolations, extractJsProse,
} from "../scripts/copy-scan.js";
import { PALACE_INTERPRETATIONS, INTERPRETATION_LABEL } from "../src/reading/palace-interpretations.js";
import { PALACES } from "../src/reading/twelve-palaces.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const MUST_CATCH = {
  prediction: [
    "In Mian Xiang, you will prosper in your forties.",
    "Your future is written in the brow.",
    "This palace shows you are destined for leadership.",
    "Good fortune follows this form.",
    "The mark predicts your marriage.",
    "Wealth awaits the patient.",
    "Results guaranteed.",
    "The meeting was fated.",
    "A lucky nose.",
    "This line will bring money.",
    "You’ll meet someone soon.",
  ],
  belief: [
    "You believe in something larger than yourself.",
    "Your faith shows in the eyes.",
    "In Mian Xiang, a spiritual person carries this mark.",
    "You are religious by temperament.",
  ],
  measurement: [
    "Scientifically proven to reveal character.",
    "Research shows the nose reveals ambition.",
    "Your bone structure reads as Metal.",
    "The scan measured your cheekbone height.",
    "High cheekbones suggest drive.",
    "The nose's projection is strong.",
    "This app measures your spirit.",
    "Clinically tested.",
  ],
};

const MUST_PASS = [
  // Abstentions: invariant I5 requires the product to say what it did not measure.
  "Nothing was measured to bring to this, so take the passage by itself:",
  "A face-on photograph cannot recover the depth the reading would need.",
  // The tradition's own names.
  "Fortune Palace", "Wealth Palace",
  // Adjectives and disclaimers.
  "Classical face reading associates this form with careful, measured responses.",
  "None of that makes them predictive.",
  "Studies claiming to predict personality from photographs report weak results.",
  // Questions put to the reader are not claims about them.
  "What already feels like enough, if you let it?",
  "The upper section is 34% of the face height in this photo.",
];

test("every L-06 claim family catches its known violations", () => {
  for (const [family, sentences] of Object.entries(MUST_CATCH)) {
    for (const s of sentences) {
      const hits = findLaunchContentViolations([s]);
      assert.ok(hits.some((h) => h.family === family), `${family} missed: ${JSON.stringify(s)}`);
    }
  }
});

test("the gate does not reject honest abstentions, disclaimers or tradition names", () => {
  const hits = findLaunchContentViolations(MUST_PASS);
  assert.deepEqual(hits, [], "false positives would force the copy to become less truthful");
});

test("every rule in the gate is exercised by at least one known violation", () => {
  // A rule nothing exercises is a rule nobody knows works.
  for (const [family, rules] of Object.entries(LAUNCH_CONTENT_RULES)) {
    for (const rule of rules) {
      assert.ok(MUST_CATCH[family].some((s) => rule.test(s)),
        `${family} rule ${rule} has no positive control`);
    }
  }
});

test("every reading surface passes the L-06 gate at source", () => {
  let scanned = 0;
  const offenders = [];
  for (const rel of READING_SURFACE_FILES) {
    const file = path.join(SRC, rel);
    assert.ok(fs.existsSync(file), `named reading surface is missing: ${rel}`);
    const prose = extractJsProse(fs.readFileSync(file, "utf8"));
    scanned += prose.length;
    for (const h of findLaunchContentViolations(prose)) {
      offenders.push(`${rel} [${h.family}] "${h.match}" in: ${h.text.slice(0, 100)}`);
    }
  }
  assert.ok(scanned > 500, `expected a substantial reading corpus, scanned ${scanned} strings`);
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("the palace interpretations pass the gate as DATA, not only as extracted prose", () => {
  // extractJsProse has a length/shape heuristic; the corpus is checked
  // directly too, so a short question cannot slip under it.
  const strings = Object.values(PALACE_INTERPRETATIONS).flatMap((p) => Object.values(p));
  assert.equal(strings.length, 36);
  assert.deepEqual(findLaunchContentViolations(strings), []);
});

test("all twelve palaces carry an L-05 app-authored interpretation, never as heritage prose", () => {
  assert.equal(PALACES.length, 12);
  for (const p of PALACES) {
    assert.ok(p.interpretation, `${p.key}: no interpretation — the paid palaces would be empty`);
    assert.equal(p.interpretationStatus, "APP_AUTHORED_INTERPRETATION");
    assert.equal(p.reading, null, `${p.key}: app-authored text must never occupy the heritage 'reading' field`);
    assert.notEqual(p.heritageStatus, "RUNTIME_PROSE");
    for (const field of ["lens", "interpretation", "question"]) {
      assert.ok(p.interpretation[field].length > 20, `${p.key}.${field} is empty or trivial`);
    }
    assert.ok(p.interpretation.question.endsWith("?"), `${p.key}: the prompt must ask, not tell`);
  }
  assert.equal(INTERPRETATION_LABEL, "SpiritMaxx interpretation, inspired by classical Mien Shiang.");
});

test("no palace interpretation describes itself as traditional or quotes a source", () => {
  // L-05: app-authored synthesis must never be described as traditional, and
  // only Kanripo WYG lines with a locator may be presented as quotation.
  for (const [key, p] of Object.entries(PALACE_INTERPRETATIONS)) {
    for (const field of ["interpretation", "question"]) {
      assert.doesNotMatch(p[field], /\b(tradition(al|ally)?|classical|the texts|ancient|manuals?)\b/i,
        `${key}.${field} claims tradition for app-authored text`);
      assert.doesNotMatch(p[field], /[“”"「」]/, `${key}.${field} looks like a quotation`);
    }
  }
});

test("the palace interpretations are distinct, not one sentence twelve ways", () => {
  // I8's negative half: the corpus must not say one thing many ways.
  const texts = Object.values(PALACE_INTERPRETATIONS).map((p) => p.interpretation.toLowerCase());
  const words = (t) => new Set(t.match(/[a-z']+/g).filter((w) => w.length > 4));
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = words(texts[i]); const b = words(texts[j]);
      const shared = [...a].filter((w) => b.has(w)).length;
      const jaccard = shared / (a.size + b.size - shared);
      assert.ok(jaccard < 0.25, `interpretations ${i} and ${j} overlap too much (${jaccard.toFixed(2)})`);
    }
  }
});

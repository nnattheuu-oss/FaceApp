/*
 * P1–P14 sensitive-inference guard (docs/OPTION_B_020_DOSSIER.md §10.2,
 * approved as R11 of DR-2026-08-17-B020-CLASS-A; frozen contract in
 * docs/MONETISATION_AUDIT_2026-09.md).
 *
 * WHY THIS EXISTS BESIDE THE L-06 GATE. L-06 (scripts/copy-scan.js) catches
 * prediction, belief attribution and measurement claims. It does not catch
 * the other prohibited inferences: lifespan (P1), organ/disease mapping as a
 * statement about the reader (P3), wealth or rank (P4), character, morality,
 * intelligence or criminality (P5), race, ethnicity or ancestry (P6, and the
 * EU AI Act Art. 5(1)(g) sensitive categories: religion, sexual orientation,
 * political opinion), emotion or mental health (P7), validation claims (P12)
 * and population norms (P14). The existing no-medical-language test scans
 * only src/qise and src/ui/qise; utils/insights.js shipped P3/P5 violations
 * outside that scope until launch-v1 fixed them by hand.
 *
 * Rules are CLAIM-shaped, like L-06: they match a statement about the
 * reader, not a bare word, so the tradition's own palace names, attributed
 * doctrine and honest disclaimers stay legal. Every rule has a positive
 * control, and the honest sentences are pinned as negative controls.
 *
 * Falsification record: appending "Your nose reveals an honest character."
 * to src/qise/passages.js turned the corpus test red (1 offender, P5); the
 * line was then removed. See the commit that added this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { READING_SURFACE_FILES, extractJsProse } from "../scripts/copy-scan.js";
import { PALACE_INTERPRETATIONS } from "../src/reading/palace-interpretations.js";
import { PALACES } from "../src/reading/twelve-palaces.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const YOU = String.raw`\b(?:you|you're|your|you'll)\b`;

export const SENSITIVE_RULES = Object.freeze({
  P1_lifespan: [
    new RegExp(`${YOU}[^.?!]{0,40}\\b(?:live (?:long|to)|long life|lifespan|die young|early death|longevity)\\b`, "i"),
  ],
  P3_organ_disease: [
    new RegExp(`${YOU}[^.?!]{0,12}\\b(?:liver|kidneys?|spleen|lungs?|heart|stomach|bladder)\\b`, "i"),
    /\b(?:indicates?|signals?|shows?|reveals?)\b[^.?!]{0,30}\b(?:disease|illness|deficiency|stagnation|toxins?)\b/i,
  ],
  P4_wealth_rank: [
    new RegExp(`${YOU}[^.?!]{0,30}\\b(?:will be|are|become)\\b[^.?!]{0,15}\\b(?:rich|wealthy|poor|powerful|high-ranking|successful)\\b`, "i"),
  ],
  P5_character: [
    new RegExp(`${YOU}[^.?!]{0,6}\\b(?:are|seem|look)\\b[^.?!]{0,12}\\b(?:honest|dishonest|trustworthy|untrustworthy|intelligent|unintelligent|stupid|criminal|moral|immoral|lazy|greedy|cruel|deceitful)\\b`, "i"),
    /\b(?:face|nose|brow|eyes?|jaw|chin|mouth|lips)\b[^.?!]{0,30}\b(?:reveals?|shows?|proves?|betrays?)\b[^.?!]{0,30}\b(?:character|morals?|morality|intelligence|honesty|criminality)\b/i,
  ],
  P6_sensitive_category: [
    new RegExp(`${YOU}[^.?!]{0,30}\\b(?:race|ethnicity|ancestry|ethnic)\\b`, "i"),
    new RegExp(`${YOU}[^.?!]{0,6}\\b(?:are|seem|look)\\b[^.?!]{0,10}\\b(?:gay|lesbian|bisexual|straight|conservative|liberal|left-wing|right-wing|muslim|christian|jewish|hindu|buddhist|atheist)\\b`, "i"),
  ],
  P7_emotion_mental_health: [
    new RegExp(`${YOU}[^.?!]{0,6}\\b(?:are|seem|look|feel)\\b[^.?!]{0,12}\\b(?:depressed|anxious|stressed|sad|angry|unhappy|lonely)\\b`, "i"),
    /\bmental health\b/i,
  ],
  P12_validation: [
    /\b(?:clinically validated|medical[- ]grade|AI[- ]detected|\d{2,3}% accura\w*)/i,
  ],
  P14_population_norm: [
    /\b(?:normal range|above average|below average|compared (?:with|to) (?:other people|most people|everyone|the average))\b/i,
  ],
});

export function findSensitiveInferences(strings) {
  const hits = [];
  for (const text of strings) {
    for (const [family, rules] of Object.entries(SENSITIVE_RULES)) {
      for (const rule of rules) {
        const m = rule.exec(text);
        if (m) hits.push({ family, match: m[0], text });
      }
    }
  }
  return hits;
}

const MUST_CATCH = {
  P1_lifespan: ["Your ears suggest you will live to ninety.", "You're marked for a long life."],
  P3_organ_disease: ["Your liver is under strain today.", "Yellow here indicates a spleen deficiency."],
  P4_wealth_rank: ["You will be rich by forty.", "With this nose you are destined to become powerful and wealthy."],
  P5_character: ["You are honest to a fault.", "Your nose reveals an honest character."],
  P6_sensitive_category: ["Your face shows your ancestry.", "You look Buddhist."],
  P7_emotion_mental_health: ["You seem anxious today.", "This speaks to your mental health."],
  P12_validation: ["Clinically validated face reading.", "98% accurate."],
  P14_population_norm: ["Your redness is above average.", "Compared with other people, your brow is wide."],
};

const MUST_PASS = [
  // The tradition's own names and attributed doctrine.
  "Wealth Palace", "Fortune Palace", "Palace of Trials",
  "In the classical Twelve Palaces system (Taiqing Shenjian), the Life Palace (Ming Gong) is sited at the glabella and is traditionally read as an indicator of a person's overall spirit and fortune.",
  // Honest disclaimers and abstentions.
  "These views use only your previous scans. They do not compare you with anyone else.",
  "It is not a rating of a face.",
  "Mien Shiang · cultural entertainment, not a health assessment",
  "Written for this palace, not read from your face.",
  // Questions put to the reader are not claims about them.
  "What would be worth noticing if this pattern shifted?",
];

test("every P-rule catches its known violations", () => {
  for (const [family, sentences] of Object.entries(MUST_CATCH)) {
    for (const s of sentences) {
      assert.ok(findSensitiveInferences([s]).some((h) => h.family === family),
        `${family} missed: ${JSON.stringify(s)}`);
    }
  }
});

test("every P-rule has a positive control (a rule nothing exercises is a rule nobody knows works)", () => {
  for (const [family, rules] of Object.entries(SENSITIVE_RULES)) {
    for (const rule of rules) {
      assert.ok(MUST_CATCH[family].some((s) => rule.test(s)), `${family} rule ${rule} has no positive control`);
    }
  }
});

test("the guard does not reject tradition names, attributed doctrine or honest disclaimers", () => {
  assert.deepEqual(findSensitiveInferences(MUST_PASS), []);
});

test("no reading surface asserts a P1–P14 sensitive inference about the reader", () => {
  let scanned = 0;
  const offenders = [];
  for (const rel of READING_SURFACE_FILES) {
    const file = path.join(SRC, rel);
    assert.ok(fs.existsSync(file), `named reading surface is missing: ${rel}`);
    const prose = extractJsProse(fs.readFileSync(file, "utf8"));
    scanned += prose.length;
    for (const h of findSensitiveInferences(prose)) {
      offenders.push(`${rel} [${h.family}] "${h.match}" in: ${h.text.slice(0, 100)}`);
    }
  }
  assert.ok(scanned > 500, `expected a substantial reading corpus, scanned ${scanned} strings`);
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("palace data (heritage prose and L-05 interpretations) carries no sensitive inference", () => {
  const strings = [
    ...PALACES.flatMap((p) => [p.reading, p.structuralNote, p.translationNote].filter(Boolean)),
    ...Object.values(PALACE_INTERPRETATIONS).flatMap((p) => Object.values(p)),
  ];
  assert.ok(strings.length >= 40);
  assert.deepEqual(findSensitiveInferences(strings), []);
});

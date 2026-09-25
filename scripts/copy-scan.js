/*
 * Shared copy-scanning primitives.
 *
 * Used by BOTH tests/copy-guard.test.js (source) and scripts/lint-bundle.js
 * (artefact), so the two cannot drift. A blocklist enforced on src/ but not on
 * dist/, or vice versa, is worse than one enforced nowhere: it reads as
 * covered.
 *
 * ── WHAT COUNTS AS USER-FACING ─────────────────────────────────────────────
 * Not every string in a file is copy. `condition: "erythema"` is a rule-engine
 * field and a data key; `"safety_gate"` is a category; `deltaEi` is a variable.
 * None of those is shown to anyone, and blocking them would force the code to
 * be renamed to satisfy a lint about English.
 *
 * So the scanner extracts PROSE: string literals that read like a sentence
 * (contain spaces, long enough to be a sentence, not code-shaped), plus
 * visible text nodes from HTML. Comments are stripped first — an explanatory
 * comment about why a term was moved to Module B must not trip the guard that
 * moved it.
 *
 * ── THE DISCLAIMER EXEMPTION ───────────────────────────------------------──
 * Text marked `data-copy="disclaimer"` in HTML is exempt from the Module A
 * blocklist and nothing else. Its whole job is to say what the app is not and
 * does not do, which cannot be written without the words "diagnose", "treat",
 * "cure" and "disease". Weakening that sentence to satisfy a vocabulary lint
 * would trade a real legal disclosure for a green test.
 *
 * The exemption is narrow on purpose: disease names, assertive phrasing and
 * attractiveness claims are still rejected inside disclaimers, and a reading
 * can never be marked this way (asserted in the tests).
 */

/** Module A vocabulary. Health-adjacent words that belong to Module B only. */
export const BLOCKLIST = [
  "acne", "rosacea", "dermatitis", "eczema", "melanoma", "cancer", "lesion",
  "diagnose", "diagnosis", "treat", "treatment", "symptom", "condition",
  "cure", "disorder", "disease", "pathology", "severity", "referral",
  "medical", "clinical", "anaemia", "thyroid", "iron", "circulation", "blood",
];

/** Disease names. Banned everywhere, including disclaimers and Module B. */
export const DISEASE_TERMS = [
  "anaemia", "anemia", "thyroid", "lupus", "sle", "autoimmune",
  "rosacea", "diabetes", "diabetic", "jaundice", "melanoma",
  "carcinoma", "psoriasis", "eczema", "dermatitis", "cancer",
];

/** Assertive second-person phrasing, rejected unless tradition-attributed. */
export const ASSERTIVE_PHRASES = [
  "you are", "you have", "you will", "your personality",
  "your character", "makes you", "means you",
];

/** A string containing any of these is attributed and may use "you". */
export const TRADITION_MARKERS = [
  "In Mian Xiang", "Mian Xiang", "traditionally", "classical", "Classical",
  "Lavater", "della Porta", "some traditions", "Sources differ", "the texts",
];

export const hasTraditionMarker = (s) =>
  TRADITION_MARKERS.some((m) => s.includes(m));

/** Strip comments so explanatory prose about a term cannot trip its guard. */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([^:"'`])\/\/[^\n"'`]*$/gm, "$1 ");
}

/**
 * Does this string literal read as user-facing prose?
 *
 * Deliberately generous on rejection: identifiers, keys, selectors, class
 * names, URLs and template fragments are all excluded. The cost of a false
 * negative here is a missed term; the cost of a false positive is renaming
 * working code to satisfy a lint about English, which is worse.
 */
export function isProse(s) {
  if (s.length < 25) return false;
  if (!/\s/.test(s)) return false;
  if (!/[a-z]{3}/.test(s)) return false;
  if (/^https?:\/\//.test(s)) return false;
  if (/^[a-z-]+\/[a-z-]+$/i.test(s)) return false;          // mime types
  if (/^[\w.-]+\.(js|html|png|json|task|webmanifest)$/i.test(s)) return false;
  if (/^[.#][\w-]/.test(s)) return false;                    // selectors
  if (/^[\w-]+(\s*[:;{}]\s*|\s*,\s*)[\w-]/.test(s) && !/[.!?]/.test(s)) return false; // css
  const words = s.trim().split(/\s+/);
  return words.length >= 4;
}

/**
 * Tokenise string literals out of JavaScript.
 *
 * A regex of the form /"..."/ CANNOT do this: JavaScript alternates strings and
 * code, so a naive quote-to-quote match happily spans the code BETWEEN two
 * literals and reports it as copy. That produced a wave of false findings like
 * `"condition" in: , severity: s, confidence: conf, tone, measured: {...}`,
 * which is three separate literals with code in between.
 *
 * So: walk the source once, tracking quote state properly, and emit only what
 * is genuinely inside a literal. Template literals are split on ${...} so an
 * interpolated HTML fragment contributes its text but not its expressions.
 */
export function tokeniseStringLiterals(src) {
  const s = stripComments(src);
  const out = [];
  let i = 0;
  let prevSignificant = "";
  while (i < s.length) {
    const ch = s[i];

    // Regex literals must be skipped, not tokenised. `/[&<>"]/g` contains a
    // double quote; without this the scanner treats it as the start of a
    // string and swallows everything up to the next quote — hundreds of
    // characters of code, reported as user-facing copy.
    //
    // The classic division-vs-regex ambiguity is resolved the usual way: a
    // slash starts a regex only where a value cannot already have ended.
    if (ch === "/" && !"])}".includes(prevSignificant) && !/[\w$]/.test(prevSignificant)) {
      let j = i + 1, inClass = false, closed = false;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "\n") break;                 // unterminated: not a regex
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) { closed = true; j++; break; }
        j++;
      }
      if (closed) { i = j; prevSignificant = "/"; continue; }
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let buf = "";
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === "\\") { buf += c + (s[i + 1] ?? ""); i += 2; continue; }
        if (c === quote) { i++; break; }
        // Template interpolation: end the current run, skip the expression.
        if (quote === "`" && c === "$" && s[i + 1] === "{") {
          out.push(buf); buf = "";
          let depth = 1; i += 2;
          while (i < s.length && depth > 0) {
            if (s[i] === "{") depth++;
            else if (s[i] === "}") depth--;
            i++;
          }
          continue;
        }
        buf += c; i++;
      }
      out.push(buf);
      prevSignificant = quote;
      continue;
    }
    if (!/\s/.test(ch)) prevSignificant = ch;
    i++;
  }
  return out;
}

/** Extract prose string literals from JavaScript source. */
export function extractJsProse(src) {
  return tokeniseStringLiterals(src)
    .map((s) => s.replace(/\\n/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(isProse);
}

/**
 * Extract visible text from HTML, bucketed by its `data-copy` marker.
 *
 *   (unmarked)  — Module A copy. Full blocklist, assertive guard, disease guard.
 *   "disclaimer" — exempt from the BLOCKLIST only. The wellness disclaimer
 *      cannot be written without "diagnose", "treat", "cure", "disease".
 *      Assertive phrasing and disease names are still rejected.
 *   "legal" — whole legal documents (privacy policy, terms). Exempt from the
 *      blocklist AND the assertive guard: a terms page has to be able to say
 *      "it does not diagnose" and "rights you have under consumer law", and
 *      neither is a claim about the reader's character. Disease names are
 *      still rejected, and a test asserts only the two legal pages use it.
 *
 * @returns {{copy: string[], disclaimer: string[], legal: string[]}}
 */
export function extractHtmlCopy(html) {
  // Drop style and script blocks — neither is visible text.
  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");

  const buckets = { disclaimer: [], legal: [] };
  let rest = body;

  // Pull out every element carrying a data-copy marker, including nesting, by
  // scanning for the attribute and taking the balanced element after it.
  const re = /<(\w+)[^>]*data-copy=["'](disclaimer|legal)["'][^>]*>/gi;
  let m;
  const spans = [];
  while ((m = re.exec(body)) !== null) {
    const tag = m[1];
    const kind = m[2].toLowerCase();
    const start = m.index;
    // Find the matching close tag, allowing for same-tag nesting.
    let depth = 1, i = re.lastIndex;
    const open = new RegExp(`<${tag}\\b`, "gi");
    const close = new RegExp(`</${tag}>`, "gi");
    while (depth > 0 && i < body.length) {
      open.lastIndex = i; close.lastIndex = i;
      const o = open.exec(body), c = close.exec(body);
      if (!c) { i = body.length; break; }
      if (o && o.index < c.index) { depth++; i = o.index + 1; }
      else { depth--; i = c.index + c[0].length; }
    }
    spans.push([start, i, kind]);
  }
  for (const [s, e, kind] of spans.reverse()) {
    buckets[kind].push(body.slice(s, e));
    rest = rest.slice(0, s) + " ".repeat(e - s) + rest.slice(e);
  }

  const toText = (frag) => frag
    .replace(/<[^>]+>/g, " ")
    .split(" ")
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 3);

  return {
    copy: toText(rest),
    disclaimer: buckets.disclaimer.flatMap(toText),
    legal: buckets.legal.flatMap(toText),
  };
}

/** Terms found in a set of strings. */
export function findTerms(strings, terms) {
  const hits = [];
  for (const s of strings) {
    for (const t of terms) {
      if (new RegExp(String.raw`\b${t}\b`, "i").test(s)) hits.push({ term: t, text: s });
    }
  }
  return hits;
}

/** Assertive phrasing outside a tradition-attributed context. */
export function findAssertive(strings) {
  const hits = [];
  for (const s of strings) {
    if (hasTraditionMarker(s)) continue;
    for (const p of ASSERTIVE_PHRASES) {
      if (new RegExp(String.raw`\b${p}\b`, "i").test(s)) hits.push({ phrase: p, text: s });
    }
  }
  return hits;
}

/**
 * The v1 content gate (owner decision L-06, DR-2026-09-23-LAUNCH-V1).
 *
 * L-06 makes the lexicon lint the ONLY content gate for v1: a reading string
 * ships if it carries no (1) health/diagnostic vocabulary -- BLOCKLIST and
 * DISEASE_TERMS above -- and none of the three claim families below.
 *
 * ── CLAIM-SHAPED, NOT WORD-SHAPED ──────────────────────────────────────────
 * L-06 names "will", "fortune", "predict", "measured" and "height". Banned as
 * bare words they would reject the product's most honest sentences: "Nothing
 * was measured to bring to this" (an abstention -- invariant I5 REQUIRES it),
 * "Fortune Palace" (the tradition's own name), "careful, measured responses"
 * (an adjective), "None of that makes them predictive" (a disclaimer). A gate
 * that forces those out makes the copy LESS truthful, which is the opposite of
 * what the gate is for. So each rule matches the CLAIM -- the word in the
 * construction that asserts something about the reader -- and every rule
 * carries a positive and a negative control in tests/launch-content-gate.
 *
 * ── NO TRADITION ESCAPE ────────────────────────────────────────────────────
 * findAssertive() above lets a tradition-attributed string say "you are". This
 * gate does not: "In Mian Xiang, you will prosper" is still a prediction about
 * the reader, and under L-05 app-authored copy is not traditional anyway.
 */
export const LAUNCH_CONTENT_RULES = Object.freeze({
  prediction: [
    /\byou(?: will|'ll|\u2019ll| shall)\b/i,
    /\byour (?:future|fate|destiny|fortunes?|luck)\b/i,
    /\bdestin(?:ed|y)\b/i,
    /\bfated\b/i,
    /\b(?:predicts?|foretells?|forecasts?|portends?)\s+(?:your|you|that you|a|an|the)\b/i,
    /\bguarantee[sd]?\b/i,
    /\b(?:good|great|bad|ill)\s+(?:fortune|luck)\b/i,
    /\blucky\b/i,
    /\bwill (?:bring|become|find|meet|marry|live|die|succeed|prosper|attract|lose|gain|face|suffer|enjoy|achieve|come to)\b/i,
    /\b(?:wealth|riches|success|love|romance|prosperity)\s+(?:awaits|is coming|lies ahead|is on its way)\b/i,
  ],
  belief: [
    /\byou (?:believe|are (?:religious|spiritual|devout|a believer|an atheist|agnostic))\b/i,
    /\byour (?:faith|religion|beliefs?|religious\b|spiritual (?:beliefs?|path|nature|side))/i,
    /\b(?:religious|spiritual) (?:person|type|nature|temperament)\b/i,
  ],
  measurement: [
    /\bscientific(?:ally)?\s+(?:proven|validated|accurate|measured|shown|confirmed|precise)\b/i,
    /\b(?:science|research|studies)\s+(?:shows?|proves?|confirms?)\b/i,
    /\bclinically\b/i,
    /\bproven\b/i,
    /\bmeasured\s+(?:your\s+|the\s+)?(?:[a-z]+\s+)?(?:bones?|skull|depth|height|projection|prominence)\b/i,
    /\b(?:bone|skull) structure\b/i,
    /\b(?:your|the|a|this)\s+(?:nose|forehead|chin|cheekbones?|brows?|jaw)(?:'s|\u2019s)?\s+(?:height|depth|projection|prominence)\b/i,
    /\b(?:high|low|prominent|projecting|protruding|jutting|deep-set|sunken|raised)\s+(?:cheekbones?|nose bridge|nose|brow ridge|brows?|forehead|chin|jaw(?:line)?)\b/i,
    /\bmeasur(?:es|ed|ing)\s+(?:your|the)\s+(?:character|personality|spirit|qi|destiny|energy|soul)\b/i,
  ],
});

/** Strings violating the L-06 claim families. */
export function findLaunchContentViolations(strings) {
  const hits = [];
  for (const s of strings) {
    for (const [family, rules] of Object.entries(LAUNCH_CONTENT_RULES)) {
      for (const r of rules) {
        const m = s.match(r);
        if (m) hits.push({ family, match: m[0], text: s });
      }
    }
  }
  return hits;
}

/**
 * The reading surfaces L-06 governs, as paths relative to src/ (and so also
 * to dist/, which is a copy). A reading string lives in one of these files.
 * The science screen, the consent gate and the legal pages are NOT readings:
 * they must be able to say "research shows" and "we do not predict your
 * future", and they have their own guards.
 */
export const READING_SURFACE_FILES = Object.freeze([
  "rules-a.js", "readingview.js", "sharecard.js",
  "reading/index.js", "reading/five-elements.js", "reading/three-courts.js",
  "reading/twelve-palaces.js", "reading/palace-interpretations.js",
  "reading/qi-se.js", "reading/summary.js", "reading/harmony.js",
  "reading/provenance.js", "utils/insights.js",
  "qise/passages.js", "qise/reflection-corpus.js", "qise/reflection.js",
  "qise/reading-tiers.js", "qise/heritage-connections.js", "qise/patterns.js",
  "qise/integrated.js",
  "ui/qise/screens.js", "ui/qise/share.js", "ui/qise/heritage-view.js",
  "ui/qise/paywall.js",
]);

/**
 * Canary. A scanner that finds nothing because it is broken must fail loudly
 * rather than report clean — this repo has already shipped one false all-clear
 * from a regex that silently matched nothing.
 */
export const CANARY_TERM = "diagnose";
export const CANARY_FAILURE =
  "CANARY FAILED: scanner found 0 matches for known term. Check file paths and regex.";

export function assertCanary(allStrings, fail) {
  const found = allStrings.some((s) =>
    new RegExp(String.raw`\b${CANARY_TERM}\b`, "i").test(s));
  if (!found) fail(CANARY_FAILURE);
  return found;
}

import { runAnalysis } from "./analysis.js";
import { renderGeometry } from "./debugview.js";
import { renderReadingGated, renderSummary } from "./readingview.js";
import { buildShareModel, renderShareBlob, deliver } from "./sharecard.js";
import { renderReferrals, renderHaltNotice, renderAdvisories, renderMeasurementLimits }
  from "./modulebview.js";
import { renderScienceLink, renderScienceScreen } from "./scienceview.js";
import {
  renderReportButton, renderReportForm, renderReportConfirmation,
  buildReportPayload, sendReport,
} from "./report.js";
import { renderAbout, loadBuildInfo } from "./about.js";
import { connectBilling, readEntitlement, hasFeature } from "./billing/entitlements.js";
import { FEATURE } from "./billing/catalogue.js";

const $ = (id) => document.getElementById(id);
const CONSENT_KEY = "mienshiang.consent.v1";

let file = null;
let objectUrl = null;

/*
 * Paid access, from Google Play (L-03). Null until Play has answered, and null
 * means locked: the page renders the free reading first and re-renders if Play
 * reports a purchase. There is no redeem URL and no local unlock flag any more
 * -- see src/billing/entitlements.js for why.
 */
let classicEntitlement = null;
async function refreshEntitlement() {
  const read = await readEntitlement(await connectBilling(window));
  classicEntitlement = read.entitlement;
  if (lastResult && hasFeature(classicEntitlement, FEATURE.FULL_TRAIT_MAPPING)) render(lastResult);
}
refreshEntitlement().catch((err) => console.warn("Could not check purchases.", err));

// Cached last result, used to re-render after an in-session unlock.
let lastResult = null;
let activeResultScreen = "overview";

// ----------------------------------------------------------------- consent --

const dlg = $("consent");
if (localStorage.getItem(CONSENT_KEY) !== "1") dlg.showModal();
$("agree").addEventListener("change", (e) => { $("accept").disabled = !e.target.checked; });
$("accept").addEventListener("click", () => {
  localStorage.setItem(CONSENT_KEY, "1");
  dlg.close();
});
// Affirmative acknowledgment only — Esc must not dismiss it.
dlg.addEventListener("cancel", (e) => e.preventDefault());

// -------------------------------------------------------------------- pick --

/**
 * Move the three-step rail. Photo (1) → Read (2) → Result (3).
 *
 * The flow was previously unsignposted: after choosing a photo nothing
 * indicated that a second tap was needed. The rail says where the user is.
 */
function setStep(n) {
  const items = document.querySelectorAll("#steps .step");
  items.forEach((li, i) => {
    const idx = i + 1;
    li.classList.toggle("is-current", idx === n);
    li.classList.toggle("is-done", idx < n);
    if (idx === n) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
}

/**
 * Promote "Read this photo" to the primary action and demote the picker.
 *
 * Reducing the number of AMBIGUOUS decisions matters more than reducing the
 * number of taps: with both buttons live, the one still styled as primary was
 * the one that discards the photo just chosen.
 */
function armReadAction() {
  const go = $("go"), pick = $("pick");
  go.hidden = false;
  go.classList.remove("ghost");
  pick.classList.add("ghost");
  pick.textContent = "Choose a different photo";
}

$("pick").addEventListener("click", () => $("file").click());

$("file").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  file = f;
  document.body.classList.remove("has-results");
  activeResultScreen = "overview";

  // Object URLs are not garbage collected; revoke the previous one.
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(f);

  $("plate").innerHTML =
    `<div class="frame"><img id="shot" src="${objectUrl}" alt="" /></div>`;
  armReadAction();
  setStep(2);
  $("out").innerHTML = "";
});

// ----------------------------------------------------------------- analyse --

$("go").addEventListener("click", async () => {
  if (!file) return;
  const go = $("go");
  go.disabled = true;
  const say = (m) => { $("out").innerHTML = `<p class="mono">${m}</p><div class="scan"></div>`; };

  try {
    const r = await runAnalysis(file, $("mirror").checked, say);
    render(r);
  } catch (err) {
    $("out").innerHTML = `<div class="err"><p id="analysis-error" style="margin:0"></p>
      <button id="analysis-retry" class="ghost" type="button">Choose another photo</button></div>`;
    $("analysis-error").textContent = err?.message || "This photo could not be read.";
    $("analysis-retry").addEventListener("click", () => $("file").click());
  } finally {
    go.disabled = false;
  }
});

// ------------------------------------------------------------------ render --

function render(r) {
  lastResult = r;
  const { canvas, regions, result, baseline, notMeasured } = r;

  // Redraw the plate from the analysed canvas so the overlay lines up exactly
  // with what was measured (including un-mirroring).
  const flagged = new Set(
    result.referrals.flatMap(() => ["cheek_left", "cheek_right", "nose_bridge"])
  );

  const polys = Object.values(regions).map((reg) => {
    const pts = reg.hull.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const cls = flagged.size && !flagged.has(reg.key) ? "roi dim"
              : flagged.has(reg.key) ? "roi flag" : "roi";
    return `<polygon class="${cls}" points="${pts}" />`;
  }).join("");

  $("plate").innerHTML = `
    <div class="frame">
      <img src="${canvas.toDataURL("image/jpeg", 0.85)}" alt="" />
      <svg viewBox="0 0 ${canvas.width} ${canvas.height}"
           preserveAspectRatio="xMidYMid meet" aria-hidden="true">${polys}</svg>
    </div>`;

  const overviewParts = [];
  const readingParts = [];
  const detailsParts = [];

  // The receipt goes first, above everything. There is no ordering conflict
  // with Module B: a referral that halts the reading means `r.reading` is
  // never rendered at all, so a summary and a halt notice cannot both appear.
  if (!result.halted) {
    overviewParts.push(renderSummary(r.reading, {
      caveatHtml: summaryCaveatHtml(),
      actionsHtml: shareControlsHtml(),
    }));
  }

  // Module B renders through its own module — its vocabulary lives with its
  // content, not on this Module A surface. All of these return "" when Module
  // B was not composed into the build.
  overviewParts.push(renderReferrals(result.referrals));
  overviewParts.push(renderHaltNotice(result.halted));
  // Stays DEFAULT-VISIBLE, directly under the receipt. The summary states
  // scope; this panel states what could not be measured at all. Neither
  // substitutes for the other.
  overviewParts.push(renderMeasurementLimits(baseline, notMeasured));

  // MODULE A — the reading, behind the v1 hard paywall (L-03). Three
  // Sections and qi se are free; the trait mapping and palaces are not
  // rendered at all until Play reports a purchase.
  if (!result.halted) {
    const locked = !hasFeature(classicEntitlement, FEATURE.FULL_TRAIT_MAPPING);
    readingParts.push(renderReadingGated(r.reading, {
      locked,
      overlayHtml: locked ? gateOverlayHtml() : "",
      insightsCaveatText: insightsCaveatText(),
    }));
    detailsParts.push(renderScienceLink());
    detailsParts.push(renderReportButton());
  }

  for (const rec of result.recommendations) {
    detailsParts.push(`
      <article class="rec">
        <h3>${rec.name ?? rec.rule}</h3>
        <p>${rec.message}</p>
        ${rec.recommend.length ? `<ul>${rec.recommend.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}
        ${rec.sourcesDiffer ? `<p class="differ"><span class="differ-mark">⚖</span>${rec.sourcesDiffer}</p>` : ""}
        <div class="prov"><b>rule</b> ${rec.rule}${rec.measured ? ` · <b>measured</b> ${rec.measured}` : ""}</div>
      </article>`);
  }

  // MODULE B — separate block, own disclaimer, never inside the reading.
  // Empty string in an entertainment-only build, where these rules were never
  // composed into the set at all.
  detailsParts.push(renderAdvisories(result.advisories));

  detailsParts.push(renderGeometry(r.geometry, r.expression, r.delegate));

  $("out").innerHTML = `
    <div class="result-shell">
      <div class="result-titlebar">
        <div><p class="eyebrow">Your reading</p><h2>Scan result</h2></div>
        <button id="new-scan" class="ghost result-new" type="button">New scan</button>
      </div>
      <nav class="result-tabs" role="tablist" aria-label="Reading screens">
        <button type="button" role="tab" data-result-target="overview">Overview</button>
        <button type="button" role="tab" data-result-target="reading"${result.halted ? " disabled" : ""}>Reading</button>
        <button type="button" role="tab" data-result-target="details">Details</button>
      </nav>
      <section class="result-panel" data-result-panel="overview" role="tabpanel">${overviewParts.join("")}</section>
      <section class="result-panel" data-result-panel="reading" role="tabpanel">${readingParts.join("")}</section>
      <section class="result-panel" data-result-panel="details" role="tabpanel">${detailsParts.join("")}</section>
    </div>`;
  document.body.classList.add("has-results");
  wireResultScreens();
  window.scrollTo({ top: 0 });
  wireScienceScreen();
  wireReportControl();
  wireShare(r);
  setStep(3);
}

function wireResultScreens() {
  const select = (name, { scroll = true } = {}) => {
    const target = document.querySelector(`[data-result-panel="${name}"]`);
    if (!target) return;
    activeResultScreen = name;
    for (const panel of document.querySelectorAll("[data-result-panel]")) {
      panel.hidden = panel !== target;
    }
    for (const button of document.querySelectorAll("[data-result-target]")) {
      const selected = button.dataset.resultTarget === name;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  for (const button of document.querySelectorAll("[data-result-target]")) {
    button.addEventListener("click", () => select(button.dataset.resultTarget));
  }
  for (const chip of document.querySelectorAll(".summary-chip")) {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      const id = chip.getAttribute("href")?.slice(1);
      select("reading", { scroll: false });
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));
    });
  }
  $("new-scan")?.addEventListener("click", () => {
    document.body.classList.remove("has-results");
    activeResultScreen = "overview";
    $("out").innerHTML = "";
    setStep(2); // the plate still holds the photo just read, not the empty state
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  select(activeResultScreen, { scroll: false });
}

/**
 * The summary's always-visible caveat, read from the disclaimer template in
 * index.html. It cannot be a literal in readingview.js or sharecard.js: the
 * copy lint buckets every prose string in a .js file as Module A copy, and the
 * wording uses a word the Module A blocklist forbids. One source, two consumers.
 */
function summaryCaveatHtml() {
  return $("tpl-summary-caveat")?.innerHTML ?? "";
}

function summaryCaveatText() {
  return ($("tpl-summary-caveat")?.content?.textContent ?? "").trim();
}

/** Insights narrative caveat. Same arrangement, same reason — see above. */
function insightsCaveatText() {
  return ($("tpl-insights-caveat")?.content?.textContent ?? "").trim();
}

/** Share-card footer. Same arrangement, same reason — see above. */
function shareCardCaveatText() {
  return ($("tpl-sharecard-caveat")?.content?.textContent ?? "").trim();
}

function shareControlsHtml() {
  return `
    <div class="summary-actions">
      <button id="share-card" class="ghost" type="button">Save or share this reading</button>
    </div>
    <label class="toggle" style="margin-top:.55rem">
      <input type="checkbox" id="share-photo" />
      <span>Include my photo in the image — your face then leaves this device
        when you post it, which is your choice to make.</span>
    </label>`;
}

/**
 * Share is wired only after a reading exists, and never becomes a dead end:
 * where the OS cannot take a file, the same button saves a PNG instead.
 */
function wireShare(r) {
  const btn = $("share-card");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const original = btn.textContent;
    try {
      const includePhoto = $("share-photo")?.checked === true;
      // The card mirrors the paywall: locked unless Play reports a purchase.
      const model = buildShareModel(r.reading, shareCardCaveatText(), {
        unlocked: hasFeature(classicEntitlement, FEATURE.FULL_TRAIT_MAPPING),
        url: location.href.replace(/[?#].*$/, ""),
      });
      const blob = await renderShareBlob(model, "story", includePhoto ? r.canvas : null);
      const imageFile = new File([blob], "mian-xiang-reading.png", { type: "image/png" });
      const how = await deliver(imageFile);
      btn.textContent = how === "downloaded" ? "Saved to your device" : original;
    } catch (err) {
      // Never swallow: a share that silently does nothing is worse than one
      // that says it failed.
      btn.textContent = "Couldn't make the image";
      console.error("share card failed:", err);
    } finally {
      btn.disabled = false;
      setTimeout(() => { btn.textContent = original; }, 4000);
    }
  });
}

// ------------------------------------------------------------ paywall ------

/**
 * The locked panel for the classic view. Purchases are made in the scanner
 * (qise.html), which is the v1 reading engine (L-07); this view only points
 * there. No price, no checkout link, no share-to-unlock (L-04).
 */
function gateOverlayHtml() {
  return `
    <div class="gate-card">
      <p class="gate-title">The full reading</p>
      <p class="gate-sub">Five Elements, the shape narrative and the Twelve Palaces</p>
      <div class="gate-opts">
        <div class="gate-opt">
          <a class="gate-btn gate-btn-pay" href="./qise.html">Open the scanner</a>
          <p class="gate-note">Available through the app on Google Play</p>
        </div>
      </div>
      <p class="gate-caveat">For entertainment and self-reflection only.</p>
    </div>`;
}

// -------------------------------------------------- report this result --

/**
 * Google Play's AI-Generated Content policy requires a report control on every
 * generated result, reachable without leaving the app. This opens an in-app
 * dialog — nothing navigates away, nothing opens a mail client.
 */
function openReport() {
  const dlg = $("report");
  dlg.innerHTML = renderReportForm();
  dlg.showModal();
  dlg.querySelector("#report-cancel").addEventListener("click", () => dlg.close());
  dlg.querySelector("#report-submit").addEventListener("click", () => {
    // Built from the form fields only. The reading is not passed in and is not
    // in scope here: a function that cannot see face data cannot leak it.
    const payload = buildReportPayload(
      dlg.querySelector("#report-reason").value,
      dlg.querySelector("#report-note").value,
    );
    sendReport(payload);
    dlg.innerHTML = renderReportConfirmation();
    dlg.querySelector("#report-close").addEventListener("click", () => dlg.close());
  });
}

function wireReportControl() {
  $("report-open")?.addEventListener("click", openReport);
}

// ------------------------------------------------- what the science says --

/** Opens the science screen. Reused by the results screen and by About. */
function openScience() {
  const dlg = $("science");
  dlg.innerHTML = renderScienceScreen();
  dlg.showModal();
  dlg.querySelector("#science-close").addEventListener("click", () => dlg.close());
}

/** One tap from the results screen. Not a menu, not an About page. */
function wireScienceScreen() {
  $("science-open")?.addEventListener("click", openScience);
}

// ------------------------------------------------------------------ about --

/** Opens the About screen, and wires its two in-app controls. */
function openAbout() {
  const dlg = $("about");
  loadBuildInfo().then((info) => {
    dlg.innerHTML = renderAbout(info);
    dlg.showModal();
    dlg.querySelector("#about-close").addEventListener("click", () => dlg.close());
    dlg.querySelector("#about-science").addEventListener("click", () => {
      dlg.close();
      openScience();
    });
    dlg.querySelector("#about-report").addEventListener("click", () => {
      dlg.close();
      openReport();
    });
  });
}

$("about-open")?.addEventListener("click", openAbout);

// --------------------------------------------------------- offline support --

if ("serviceWorker" in navigator) {
  // The catch stays — an unhandled rejection here is worse than a logged one —
  // but it must not be empty. An empty handler is what hid a total service
  // worker install failure: no offline support, no error, nothing on screen.
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch((err) =>
      console.warn("Service worker registration failed; offline support is unavailable.", err)));
}

// ----------------------------------------------------------- dev panel ------
// Triggered by 7 rapid taps on the wordmark. It used to hand out every unlock
// state for free; with real purchases that would be a bypass shipped to every
// user, so the only action left is resetting consent on this device.

(function wireDevPanel() {
  const wordmark = document.querySelector(".wordmark");
  if (!wordmark) return;

  let tapCount = 0;
  let tapTimer = null;

  wordmark.addEventListener("click", () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 2000);

    if (tapCount >= 7) {
      tapCount = 0;
      clearTimeout(tapTimer);
      openDevPanel();
    }
  });
})();

function openDevPanel() {
  const dlg = $("dev-panel");
  if (!dlg) return;
  dlg.innerHTML = `
    <div class="consent" style="min-width:0">
      <h2 style="font-size:1rem;margin-bottom:.75rem">Dev: this device</h2>
      <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:1rem">
        <button id="dev-consent" class="ghost" type="button">Reset consent</button>
        <button id="dev-close" class="ghost" type="button" style="margin-top:.5rem">Close</button>
      </div>
    </div>`;
  dlg.showModal();
  dlg.querySelector("#dev-close").addEventListener("click", () => dlg.close());
  dlg.querySelector("#dev-consent").addEventListener("click", () => {
    localStorage.removeItem(CONSENT_KEY);
    location.reload();
  });
}

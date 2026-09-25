/* Offline support.
 *
 * App shell is cached on install. The vendored MediaPipe bundle, SIMD WASM
 * runtime and face model are precached on install too, into their OWN cache
 * that survives shell releases (DR-2026-09-25-VENDOR-PRECACHE, M1a fix (d)). */
// Bumped when the shell list changes: the activate handler deletes every cache
// whose name is not CACHE (or VENDOR_CACHE), so a stale v1 holding an old
// SHELL cannot survive. Coupled to index.html's ?v= redirect (item 15).
const CACHE = "mienshiang-v27";

// The vendored MediaPipe assets are hash-pinned by scripts/build.js and never
// change under a given pin, so they live in a cache named FOR the pin: the
// tasks-vision version and the model's SHA-256 prefix. Before M1a they were
// runtime-cached into CACHE, which activate deletes on every bump — so every
// release silently evicted the 3.7 MB model and the next offline scan failed.
// Change the pin in package.json / build.js and this name MUST change with
// it, or cache-first would serve an old WASM runtime to a new bundle
// (tests/sw-precache.test.js pins both halves).
const VENDOR_CACHE = "mienshiang-vendor-0.10.18-64184e22";
const VENDOR_PREFIX = "/vendor/mediapipe/";
// Only the SIMD runtime is precached: every browser this app supports has
// WASM SIMD, and the no-SIMD pair is another 9.6 MB nobody downloads on
// purpose. If a device does need it, the fetch handler keeps it in
// VENDOR_CACHE on first use.
const VENDOR_SHELL = [
  "./vendor/mediapipe/vision_bundle.mjs",
  "./vendor/mediapipe/wasm/vision_wasm_internal.js",
  "./vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "./vendor/mediapipe/models/face_landmarker.task",
];
const SHELL = [
  "./", "./index.html", "./ui.js", "./analysis.js", "./engine.js",
  "./measurement-method.js",
  // Measurement calibration. Owned by neither module; engine.js imports both,
  // so omitting them here breaks the app offline rather than degrading it.
  "./utils/calibrationEngine.js", "./utils/textureAnalyzer.js",
  // Module A insights narrative, imported by readingview.js.
  "./utils/insights.js",
  "./geometry.js", "./landmarker.js", "./expression.js", "./region-extractor.js",
  "./debugview.js", "./flags.js", "./zones.js", "./roi.js",
  "./modulebview.js", "./report.js", "./about.js",
  "./privacy.html", "./terms.html", "./.well-known/assetlinks.json",
  // Rule layer, split by module.
  "./rules.js", "./rules-a.js", "./rules-b.js", "./rule-engine.js",
  // Module A reading + its views.
  "./reading/index.js", "./reading/five-elements.js", "./reading/three-courts.js",
  "./reading/twelve-palaces.js", "./reading/qi-se.js", "./reading/science.js",
  "./reading/summary.js", "./reading/harmony.js", "./reading/provenance.js",
  "./readingview.js", "./scienceview.js", "./sharecard.js",
  "./reading/palace-interpretations.js",
  // Play Billing (DR-2026-09-23-LAUNCH-V1). Statically imported by both
  // ui.js and ui/qise/app.js; missing any of these is item 15's white screen.
  "./billing/catalogue.js", "./billing/entitlements.js", "./billing/offers.js",
  "./billing/purchase.js",
  // Both module adapters ship in both flavours. The flag governs BEHAVIOUR,
  // not bytes — see the honest limitation in flags.js. Omitting safety.js here
  // while rules.js still imports it would break the app offline rather than
  // produce an entertainment-only build.
  "./adapters/entertainment.js", "./adapters/safety.js",
  // Qi Se longitudinal tracker. A separate page and a separate module tree,
  // precached whole: the feature is useless offline if any one of these is
  // missing, and Promise.allSettled means an absent entry costs only itself
  // rather than the whole install.
  "./qise.html",
  "./qise/consent.js", "./qise/color.js", "./qise/rois.js", "./qise/sclera.js",
  "./qise/illumination.js", "./qise/upload.js", "./qise/framestats.js",
  "./qise/wakelock.js",
  "./qise/gates.js", "./qise/camera.js", "./qise/metrics.js", "./qise/pose.js",
  // Statically imported by ui/qise/app.js as of the scanner capture
  // correction (DR-2026-09-06-SCANNER-CAPTURE-CORRECTION). Missing this is
  // CLAUDE.md item 15's exact failure: a returning user on the old cache
  // gets a module-not-found error, not a degraded app.
  "./qise/frame-scheduler.js",
  "./qise/baseline.js", "./qise/store.js", "./qise/passages.js",
  "./qise/patterns.js", "./qise/composition.js", "./qise/integrated.js",
  // Statically imported by ui/qise/app.js but missing from this list until
  // M1a (tests/sw-precache.test.js now compares the import graph against
  // SHELL, so the next missing entry fails CI instead of an offline launch).
  "./qise/frame-geometry.js", "./qise/reading-flags.js", "./qise/reading-pipeline.js",
  "./qise/reading-state.js", "./qise/reading-tiers.js", "./qise/reflection.js",
  "./qise/reflection-corpus.js", "./ui/qise/palace-experience.js",
  "./heritage/composition-policies-registry.js", "./heritage/composition-policy.js",
  "./heritage/concepts.js", "./heritage/connectors.js", "./heritage/constants.js",
  "./heritage/disagreements.js", "./heritage/evidence.js",
  "./heritage/negative-relationships-registry.js", "./heritage/negative-relationships.js",
  "./heritage/registry.js", "./heritage/schema-helpers.js", "./heritage/schema.js",
  "./heritage/validator.js",
  // M1a scanner fixes (b), (c), (g).
  "./qise/capture-integrity.js", "./qise/capture-lifecycle.js",
  "./ui/qise/palette.js", "./ui/qise/seal.js", "./ui/qise/screens.js",
  "./ui/qise/share.js", "./ui/qise/paywall.js", "./ui/qise/theme.js", "./ui/qise/exposure-halo.js", "./ui/qise/app.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  // Deliberately not addAll(): addAll is atomic, so a single missing entry
  // rejects the whole install and the worker never activates — losing ALL
  // offline support, silently, because ui.js swallows registration errors.
  // Cache each entry independently so one absent asset costs only that asset.
  // The vendor assets get the same per-item treatment, in their own cache, so
  // a failed 9 MB download costs only that download and never the shell.
  e.waitUntil(
    Promise.allSettled([
      caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))),
      caches.open(VENDOR_CACHE).then((c) => Promise.allSettled(VENDOR_SHELL.map((u) => c.add(u)))),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE && k !== VENDOR_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = e.request.url;
  // Mirrors the egress allowlist in scripts/lint-bundle.js. Google Fonts is
  // deliberately absent — the webfont import was removed, and re-adding a host
  // here without adding it to the allowlist will fail the bundle lint.
  const cacheable = url.startsWith(self.location.origin);
  if (!cacheable) return;

  // Hash-pinned vendor assets: cache-first from the pin-named cache. Nothing
  // under a given pin can change, so there is nothing to revalidate.
  if (new URL(url).pathname.includes(VENDOR_PREFIX)) {
    e.respondWith(
      caches.open(VENDOR_CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request)
        .then((res) => {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        })))
    );
    return;
  }

  // Product code is network-first. A paid user who is online must never run
  // yesterday's capture logic just because an older worker owns the tab.
  // The cached response remains the fallback when the device is offline.
  if (e.request.mode === "navigate" || ["script", "style"].includes(e.request.destination)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

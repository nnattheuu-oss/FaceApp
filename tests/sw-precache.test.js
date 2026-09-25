/*
 * M1a fix (d), part 2: the service worker precaches what the app needs to run
 * offline — every statically imported module AND the vendored MediaPipe
 * runtime and face model. docs/MONETISATION_AUDIT_2026-09.md, Phase 0 item 5;
 * DR-2026-09-25-VENDOR-PRECACHE.
 *
 * Two defects, one class (CLAUDE.md item 15):
 *
 * - 23 modules in the static import graphs of ui/qise/app.js and ui.js were
 *   missing from SHELL on main at 93e1796 (the heritage tree, the reading
 *   pipeline, frame-geometry...). Scripts are network-first, so an ONLINE user
 *   never noticed; an offline launch died on a module-not-found. Nothing
 *   compared the graph against the list, so each new import widened the hole.
 * - The MediaPipe bundle, WASM and 3.7 MB face model were cached only on first
 *   fetch, INTO the shell cache — which the activate handler deletes on every
 *   CACHE bump. So every release silently evicted the model, and the next
 *   offline scan failed with a message about camera permission.
 *
 * sw.js is a classic worker script, so it is executed here in a vm against a
 * fake `self`/`caches`/`fetch` rather than grepped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO, "src");
const SW_SOURCE = readFileSync(join(SRC, "sw.js"), "utf8");
const BUILD_SOURCE = readFileSync(join(REPO, "scripts", "build.js"), "utf8");
const ORIGIN = "https://app.example";

/** Run sw.js once against fakes; return its handlers and the fake cache store. */
function loadWorker({ failAdd = () => false } = {}) {
  const handlers = {};
  const stores = new Map();
  const network = [];
  const openStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async add(url) {
        if (failAdd(url)) throw new TypeError(`network error for ${url}`);
        store.set(new URL(url, `${ORIGIN}/`).href, `body:${url}`);
      },
      async put(request, response) { store.set(typeof request === "string" ? request : request.url, response); },
      async match(request) { return store.get(typeof request === "string" ? request : request.url); },
    };
  };
  const caches = {
    async open(name) { return openStore(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const name of stores.keys()) {
        const hit = await openStore(name).match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener(type, fn) { handlers[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (request) => {
    network.push(typeof request === "string" ? request : request.url);
    return { ok: true, type: "basic", clone() { return this; }, url: request.url };
  };
  const context = { self, caches, fetch, URL, Promise, console };
  vm.runInNewContext(`${SW_SOURCE}\n;this.__CACHE = CACHE; this.__VENDOR_CACHE = typeof VENDOR_CACHE === "undefined" ? null : VENDOR_CACHE; this.__SHELL = SHELL; this.__VENDOR = typeof VENDOR_SHELL === "undefined" ? [] : VENDOR_SHELL;`, context);
  return { handlers, stores, network, context };
}

async function dispatch(handler, extra = {}) {
  let pending = Promise.resolve();
  let responded;
  handler({
    ...extra,
    waitUntil(p) { pending = p; },
    respondWith(p) { responded = p; },
  });
  await pending;
  return responded ? await responded : undefined;
}

/** Relative module paths statically imported from `entry` (no dynamic imports). */
function staticGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s*["'](\.[^"']+)["']/g),
      ...source.matchAll(/(?:^|\n)\s*import\s*["'](\.[^"']+)["']/g),
    ].map((m) => m[1]);
    for (const spec of specifiers) {
      const next = resolve(dirname(file), spec);
      assert.ok(existsSync(next), `${relative(SRC, file)} imports a missing module ${spec}`);
      walk(next);
    }
  };
  walk(join(SRC, entry));
  return [...seen].map((f) => relative(SRC, f).split("\\").join("/"));
}

// ── every statically imported module is precached ─────────────────────────

for (const [page, entry] of [["qise.html", "ui/qise/app.js"], ["index.html", "ui.js"]]) {
  test(`every module ${page} imports statically is in the precache (${entry})`, () => {
    const { context } = loadWorker();
    const shell = new Set(context.__SHELL.map((u) => u.replace(/^\.\//, "")));
    const graph = staticGraph(entry);
    assert.ok(graph.length > 30, `the import walk found only ${graph.length} modules`);
    const missing = graph.filter((rel) => !shell.has(rel)).sort();
    assert.deepEqual(missing, [],
      `offline launch dies on module-not-found for: ${missing.join(", ")}`);
  });
}

// ── the vendored MediaPipe assets ─────────────────────────────────────────

const vendoredByBuild = (() => {
  const list = BUILD_SOURCE.match(/const files = \[([\s\S]*?)\];/)?.[1] || "";
  return new Set([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).concat("models/face_landmarker.task")
    .map((rel) => `./vendor/mediapipe/${rel}`));
})();

test("the worker precaches the MediaPipe bundle, the SIMD runtime and the face model", () => {
  const { context } = loadWorker();
  const vendor = context.__VENDOR;
  assert.ok(vendoredByBuild.size >= 6, "could not read the vendored list from scripts/build.js");
  for (const needed of [
    "./vendor/mediapipe/vision_bundle.mjs",
    "./vendor/mediapipe/wasm/vision_wasm_internal.js",
    "./vendor/mediapipe/wasm/vision_wasm_internal.wasm",
    "./vendor/mediapipe/models/face_landmarker.task",
  ]) {
    assert.ok(vendor.includes(needed), `${needed} is not precached`);
  }
  for (const entry of vendor) {
    assert.ok(vendoredByBuild.has(entry), `${entry} is precached but scripts/build.js never vendors it`);
  }
});

test("the vendor cache is named for the pinned MediaPipe version and model hash", () => {
  const { context } = loadWorker();
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  const version = pkg.dependencies["@mediapipe/tasks-vision"];
  const modelHash = BUILD_SOURCE.match(/MODEL_SHA256 = "([0-9a-f]{64})"/)?.[1];
  assert.ok(version && modelHash);
  assert.ok(context.__VENDOR_CACHE, "no VENDOR_CACHE in sw.js");
  // Cache-first on a name that did not change with the pin would serve an old
  // WASM runtime to a new bundle.
  assert.ok(context.__VENDOR_CACHE.includes(version),
    `${context.__VENDOR_CACHE} does not name tasks-vision ${version}`);
  assert.ok(context.__VENDOR_CACHE.includes(modelHash.slice(0, 8)),
    `${context.__VENDOR_CACHE} does not name the model hash ${modelHash.slice(0, 8)}`);
  assert.notEqual(context.__VENDOR_CACHE, context.__CACHE);
});

test("install precaches the vendor assets, and one failed asset costs only itself", async () => {
  const { handlers, stores, context } = loadWorker({ failAdd: (u) => u.endsWith(".wasm") });
  await dispatch(handlers.install);
  const vendor = stores.get(context.__VENDOR_CACHE);
  assert.ok(vendor, "install never opened the vendor cache");
  assert.ok(vendor.has(`${ORIGIN}/vendor/mediapipe/models/face_landmarker.task`));
  assert.ok(stores.get(context.__CACHE).has(`${ORIGIN}/ui/qise/app.js`),
    "a failed vendor asset must not cost the shell");
});

test("a release (CACHE bump) keeps the vendor cache and drops the old shell", async () => {
  const { handlers, stores, context } = loadWorker();
  await dispatch(handlers.install);
  stores.set("mienshiang-v1", new Map([["x", "stale"]]));
  await dispatch(handlers.activate);
  assert.ok(!stores.has("mienshiang-v1"), "an old shell cache survived activation");
  assert.ok(stores.has(context.__CACHE));
  assert.ok(stores.has(context.__VENDOR_CACHE),
    "activation evicted the face model: every release broke the next offline scan");
});

test("a vendor asset is served from the vendor cache without touching the network", async () => {
  const { handlers, network } = loadWorker();
  await dispatch(handlers.install);
  network.length = 0;
  const url = `${ORIGIN}/vendor/mediapipe/models/face_landmarker.task`;
  const response = await dispatch(handlers.fetch, {
    request: { method: "GET", url, mode: "cors", destination: "" },
  });
  assert.ok(response, "the precached model was not served");
  assert.deepEqual(network, [], "a hash-pinned asset in the vendor cache was re-fetched");
});

test("a vendor asset not yet cached (the no-SIMD runtime) is fetched and kept in the vendor cache", async () => {
  const { handlers, stores, network, context } = loadWorker();
  await dispatch(handlers.install);
  network.length = 0;
  const url = `${ORIGIN}/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm`;
  await dispatch(handlers.fetch, { request: { method: "GET", url, mode: "cors", destination: "" } });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(network, [url]);
  assert.ok(stores.get(context.__VENDOR_CACHE).has(url),
    "a runtime-cached vendor asset landed in the shell cache and dies with the next release");
});

test("the entry redirect generation still equals the shell cache generation (item 15)", () => {
  const { context } = loadWorker();
  const html = readFileSync(join(SRC, "index.html"), "utf8");
  const generation = html.match(/qise\.html\?v=(\d+)/)?.[1];
  assert.equal(`mienshiang-v${generation}`, context.__CACHE);
});

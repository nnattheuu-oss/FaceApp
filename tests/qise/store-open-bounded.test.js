/*
 * Blind-spot sweep, 28 Sep. boot() in ui/qise/app.js awaits openStore()
 * BEFORE it wires a single consent button, and a boot failure was reported
 * only to the console. So any store open that never finished left a welcome
 * screen whose buttons did nothing, with nothing on screen to say why.
 *
 * The realistic trigger is the owner's own upgrade path: this build opens
 * IndexedDB `qise` at version 2, and any other tab or installed copy still
 * holding version 1 open (the 9 Aug v13 build has no versionchange handler)
 * BLOCKS the upgrade. The browser fires `blocked` and then leaves the request
 * pending until the other connection closes — indefinitely.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  openStore, StoreUnavailableError, describeStoreError, STORE_OPEN_TIMEOUT_MS,
} from "../../src/qise/store.js";

const manualTimer = () => {
  let fire = null;
  return {
    setTimer: (fn) => { fire = fn; return 1; },
    clearTimer: () => { fire = null; },
    elapse: () => fire && fire(),
  };
};
const fakeDb = () => ({
  closed: false,
  close() { this.closed = true; },
  objectStoreNames: { contains: () => true },
  transaction: () => ({ objectStore: () => ({}) }),
});
/** An open request the test settles by hand, the way a browser would. */
const pendingOpen = () => {
  const req = {};
  return { req, idb: { open: () => req } };
};

test("an upgrade blocked by another open copy is named, not waited on forever", async () => {
  const { req, idb } = pendingOpen();
  const pending = openStore(idb, manualTimer());
  req.onblocked({ oldVersion: 1, newVersion: 2 });
  await assert.rejects(pending, (e) => e instanceof StoreUnavailableError && e.reason === "blocked");
});

test("an open that never settles at all ends in a named timeout", async () => {
  const timer = manualTimer();
  const { idb } = pendingOpen();
  const pending = openStore(idb, timer);
  timer.elapse();
  await assert.rejects(pending, (e) => e instanceof StoreUnavailableError && e.reason === "timeout");
  assert.ok(STORE_OPEN_TIMEOUT_MS >= 5000 && STORE_OPEN_TIMEOUT_MS <= 20000);
});

test("a database that opens after the store gave up is closed, never left holding the upgrade", async () => {
  const { req, idb } = pendingOpen();
  const pending = openStore(idb, manualTimer());
  req.onblocked({});
  await assert.rejects(pending);
  const db = fakeDb();
  req.result = db;
  req.onsuccess();
  assert.equal(db.closed, true);
});

test("an open that succeeds inside the deadline returns a store (paired control)", async () => {
  const timer = manualTimer();
  const { req, idb } = pendingOpen();
  const pending = openStore(idb, timer);
  req.result = fakeDb();
  req.onsuccess();
  const store = await pending;
  assert.equal(typeof store.all, "function");
});

test("an upgrade that has started is not timed out, however slow (paired with the timeout above)", async () => {
  const timer = manualTimer();
  const { req, idb } = pendingOpen();
  const pending = openStore(idb, timer);
  req.result = { ...fakeDb(), objectStoreNames: { contains: () => false }, createObjectStore: () => ({}) };
  req.onupgradeneeded({});
  timer.elapse();
  req.onsuccess();
  const store = await pending;
  assert.equal(typeof store.all, "function");
});

test("this build closes its own connection when a newer version asks, so it never blocks one", async () => {
  const { req, idb } = pendingOpen();
  const pending = openStore(idb, manualTimer());
  const db = fakeDb();
  req.result = db;
  req.onsuccess();
  await pending;
  assert.equal(typeof db.onversionchange, "function");
  db.onversionchange({ oldVersion: 2, newVersion: 3 });
  assert.equal(db.closed, true);
});

test("each store failure tells the person what to do", () => {
  assert.match(describeStoreError(new StoreUnavailableError("blocked")), /another tab|installed app/);
  assert.match(describeStoreError(new StoreUnavailableError("blocked")), /reload/i);
  assert.match(describeStoreError(new StoreUnavailableError("timeout")), /reload/i);
  assert.match(describeStoreError(new Error("qise/store: no IndexedDB available on this host")), /reload/i);
});

const app = readFileSync(new URL("../../src/ui/qise/app.js", import.meta.url), "utf8");

test("a boot failure is shown on screen, not only logged", () => {
  const tail = app.match(/boot\(\)\.catch\(\(err\) => \{[\s\S]*?\r?\n\}\);/)?.[0] || "";
  assert.ok(tail, "boot().catch not found");
  assert.match(tail, /console\.error/);
  assert.match(tail, /showBootError\(/, "the person must see why nothing responds");
});

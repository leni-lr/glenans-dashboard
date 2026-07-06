import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", root), "utf8");

test("service worker registers install, activate, and fetch handlers", () => {
  for (const ev of ["install", "activate", "fetch"]) {
    assert.match(sw, new RegExp(`addEventListener\\("${ev}"`), `${ev} handler present`);
  }
});

test("every precached shell path exists on disk", () => {
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const paths = [...list.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]).filter((p) => p !== "./");
  for (const p of paths) {
    assert.ok(existsSync(new URL(p, root)), `${p} exists`);
  }
});

test("API requests are network-first (fetch before cache fallback)", () => {
  assert.match(sw, /\/api\//, "matches API path");
  const apiBlock = sw.slice(sw.indexOf('includes("/api/")'));
  const fetchIdx = apiBlock.indexOf("fetch(req)");
  const cacheIdx = apiBlock.indexOf("caches.match(req)");
  assert.ok(fetchIdx > -1 && cacheIdx > fetchIdx, "network attempted before cache fallback");
});

test("index.html registers the service worker and links the manifest", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");
  assert.match(html, /serviceWorker\.register\("\.\/sw\.js"\)/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
});

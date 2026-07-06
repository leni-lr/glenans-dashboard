import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));

test("manifest has the installability essentials", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.name && manifest.short_name, "name + short_name present");
  assert.match(manifest.theme_color, /^#[0-9A-Fa-f]{6}$/);
});

test("manifest declares 192 + 512 + a maskable icon, all present on disk", () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512"), "192 + 512 declared");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"), "a maskable icon declared");
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(icon.src, root)), `${icon.src} exists`);
  }
});

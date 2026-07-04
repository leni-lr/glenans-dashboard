import test from "node:test";
import assert from "node:assert/strict";
import { skeletonHTML, errorHTML } from "../js/card.js";

test("skeletonHTML renders the requested number of lines", () => {
  const html = skeletonHTML(3);
  assert.equal((html.match(/skeleton--line/g) || []).length, 3);
  assert.ok(!html.includes("skeleton--chart"));
});

test("skeletonHTML can prepend a chart block", () => {
  const html = skeletonHTML(1, true);
  assert.ok(html.includes("skeleton--chart"));
});

test("errorHTML shows the French fallback and a source link", () => {
  const html = errorHTML("fr", "https://maree.info/94");
  assert.ok(html.includes("Source indisponible"));
  assert.ok(html.includes('href="https://maree.info/94"'));
  assert.ok(html.includes('rel="noopener"'));
});

test("errorHTML uses the English fallback for en", () => {
  const html = errorHTML("en", "https://example.com");
  assert.ok(html.includes("Source unavailable"));
});

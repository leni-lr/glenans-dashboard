import test from "node:test";
import assert from "node:assert/strict";
import { legend, modelsLabel } from "../js/cards/compareview.js";

test("legend colours swatches by ser.ci, not array position", () => {
  // ICON-EU is colour 2. Second in this list, its array index is 1 — without
  // ci it would render as cmp-swatch--1 (grey) the moment a model above it
  // is hidden. Mirrors the ci-vs-index regression test in compare.test.js.
  const html = legend(
    [
      { key: "gfs", label: "GFS", ci: 4 },
      { key: "icon", label: "ICON-EU", ci: 2 },
    ],
    "fr",
    false,
  );
  assert.match(html, /cmp-swatch--4/);
  assert.match(html, /cmp-swatch--2/);
  assert.ok(!html.includes("cmp-swatch--0"), "must not fall back to array position when ci is set");
  assert.ok(!html.includes("cmp-swatch--1"), "must not fall back to array position when ci is set");
});

test("legend falls back to array position when ci is absent", () => {
  const html = legend(
    [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
    "fr",
    false,
  );
  assert.match(html, /cmp-swatch--0/);
  assert.match(html, /cmp-swatch--1/);
});

test("legend appends the measured-wind key only when observed is true", () => {
  const without = legend([{ key: "a", label: "A", ci: 0 }], "fr", false);
  assert.ok(!without.includes("cmp-swatch--obs"), "no promise of a curve that was not drawn");

  const with_ = legend([{ key: "a", label: "A", ci: 0 }], "fr", true);
  assert.match(with_, /cmp-swatch--obs/);
  assert.match(with_, /réel/);
});

test("legend translates the measured-wind key", () => {
  assert.ok(legend([], "en", true).includes("real"));
});

test("modelsLabel returns the bare label when nothing is hidden", () => {
  assert.equal(modelsLabel("fr", []), "modèles");
  assert.equal(modelsLabel("fr", null), "modèles");
  assert.equal(modelsLabel("fr", undefined), "modèles");
});

test("modelsLabel appends the actual hidden/total count once something is switched off", () => {
  assert.equal(modelsLabel("fr", ["arome_hd"]), "modèles · 5/6");
  assert.equal(modelsLabel("fr", ["arome_hd", "gfs"]), "modèles · 4/6");
  assert.equal(modelsLabel("en", ["arome_hd", "gfs"]), "models · 4/6");
});

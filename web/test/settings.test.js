import test from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, DEFAULTS } from "../js/settings.js";

test("mergeSettings fills every default when stored is empty", () => {
  assert.deepEqual(mergeSettings({}), DEFAULTS);
});

test("mergeSettings overlays provided values", () => {
  const s = mergeSettings({ lang: "en", port: "56" });
  assert.equal(s.lang, "en");
  assert.equal(s.port, "56");
  assert.equal(s.station, DEFAULTS.station); // untouched keys keep defaults
});

test("mergeSettings drops unknown keys", () => {
  const s = mergeSettings({ hacker: 1, lang: "en" });
  assert.equal(s.hacker, undefined);
});

test("mergeSettings tolerates null/undefined input", () => {
  assert.deepEqual(mergeSettings(null), DEFAULTS);
  assert.deepEqual(mergeSettings(undefined), DEFAULTS);
});

test("mergeSettings provides card + rocks + draft defaults", () => {
  const s = mergeSettings({});
  assert.deepEqual(s.cardOrder, ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"]);
  assert.deepEqual(s.cardHidden, ["rocks"]);
  assert.deepEqual(s.rocks, []);
  assert.equal(s.draft, 1.5);
});

test("mergeSettings clones array defaults (no shared reference)", () => {
  const a = mergeSettings({});
  a.rocks.push({ id: "x" });
  a.cardOrder.push("ghost");
  const b = mergeSettings({});
  assert.equal(b.rocks.length, 0);
  assert.equal(b.cardOrder.includes("ghost"), false);
});

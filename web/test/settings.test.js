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

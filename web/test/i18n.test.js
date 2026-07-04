import test from "node:test";
import assert from "node:assert/strict";
import { t, LANGS, DICT } from "../js/i18n.js";

test("t returns the French string by default key", () => {
  assert.equal(t("fr", "forecast_title"), "Prévision vent · 24 h");
});

test("t returns the English string", () => {
  assert.equal(t("en", "forecast_title"), "Wind forecast · 24 h");
});

test("t echoes unknown keys instead of throwing", () => {
  assert.equal(t("fr", "no_such_key"), "no_such_key");
});

test("every DICT entry defines both languages", () => {
  for (const key of Object.keys(DICT)) {
    for (const lang of LANGS) {
      assert.equal(typeof DICT[key][lang], "string", `${key}.${lang} missing`);
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, THEME_PREFS } from "../js/theme.js";

test("auto follows the system: dark when prefersDark", () => {
  assert.equal(resolveTheme("auto", true), "dark");
});

test("auto follows the system: light otherwise", () => {
  assert.equal(resolveTheme("auto", false), "light");
});

test("explicit light ignores the system", () => {
  assert.equal(resolveTheme("light", true), "light");
});

test("explicit dark ignores the system", () => {
  assert.equal(resolveTheme("dark", false), "dark");
});

test("THEME_PREFS lists the three accepted values", () => {
  assert.deepEqual(THEME_PREFS, ["auto", "light", "dark"]);
});

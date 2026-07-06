import test from "node:test";
import assert from "node:assert/strict";
import { COMPARE_MODELS } from "../js/sources/compare.js";

test("COMPARE_MODELS lists the five free models with labels", () => {
  assert.equal(COMPARE_MODELS.length, 5);
  const keys = COMPARE_MODELS.map((m) => m.key);
  assert.deepEqual(keys, ["arome_hd", "arome25", "icon", "ecmwf", "gfs"]);
  for (const m of COMPARE_MODELS) assert.ok(m.label && m.model, "label + model set");
});

import test from "node:test";
import assert from "node:assert/strict";
import { COMPARE_MODELS } from "../js/sources/compare.js";
import { overlayChart, trimTrailingNulls } from "../js/charts/compare.js";

test("COMPARE_MODELS lists the five free models with labels", () => {
  assert.equal(COMPARE_MODELS.length, 5);
  const keys = COMPARE_MODELS.map((m) => m.key);
  assert.deepEqual(keys, ["arome_hd", "arome25", "icon", "ecmwf", "gfs"]);
  for (const m of COMPARE_MODELS) assert.ok(m.label && m.model, "label + model set");
});

test("overlayChart emits one coloured polyline per non-empty series", () => {
  const svg = overlayChart([
    { key: "a", label: "A", times: ["t0", "t1", "t2"], speed: [5, 6, 7] },
    { key: "b", label: "B", times: ["t0", "t1", "t2"], speed: [8, 9, 10] },
  ]);
  assert.match(svg, /cmp-line--0/);
  assert.match(svg, /cmp-line--1/);
});

test("overlayChart breaks a line at a null gap", () => {
  const svg = overlayChart([{ key: "a", label: "A", times: ["t0", "t1", "t2"], speed: [5, null, 7] }]);
  assert.equal((svg.match(/M/g) || []).length, 2, "two move commands around the gap");
});

test("trimTrailingNulls cuts the padded tail", () => {
  const t = trimTrailingNulls({ times: ["a", "b", "c"], speed: [1, 2, null], gust: [1, 2, null], dir: [0, 0, 0] });
  assert.equal(t.times.length, 2);
});

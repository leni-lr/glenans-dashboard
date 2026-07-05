import test from "node:test";
import assert from "node:assert/strict";
import { chartStepLabel } from "../js/charts/chart.js";

test("step 0 labels the analysis + valid time", () => {
  const l = chartStepLabel("2026-07-05T1200", 0, "fr");
  assert.match(l, /analyse T\+0/);
  assert.match(l, /12h/);
});

test("step 12 advances the valid time by 12h", () => {
  const l = chartStepLabel("2026-07-05T1200", 12, "fr");
  assert.match(l, /T\+12/);
  assert.match(l, /00h/);
});

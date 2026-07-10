import test from "node:test";
import assert from "node:assert/strict";
import { chartStepLabel } from "../js/charts/chart.js";

// Expected local hour for a UTC instant (+ optional step), matching chartStepLabel
// which parses the run as UTC and shows the viewer's local time.
const localHH = (utcIso, addH = 0) =>
  String(new Date(new Date(utcIso).getTime() + addH * 3600000).getHours()).padStart(2, "0");

test("step 0 labels the analysis at the run's valid time (local)", () => {
  const l = chartStepLabel("2026-07-05T1200", 0, "fr");
  assert.match(l, /analyse T\+0/);
  assert.ok(l.includes(`${localHH("2026-07-05T12:00:00Z")}h`), l);
});

test("step 12 advances the valid time by 12h", () => {
  const l = chartStepLabel("2026-07-05T1200", 12, "fr");
  assert.match(l, /T\+12/);
  assert.ok(l.includes(`${localHH("2026-07-05T12:00:00Z", 12)}h`), l);
});

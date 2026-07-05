import test from "node:test";
import assert from "node:assert/strict";
import { hoursFromMidnight, tideHeightAt } from "../js/charts/tidecurve.js";

test("hoursFromMidnight measures fractional hours from today 00:00", () => {
  assert.equal(hoursFromMidnight("2026-07-04T07:32", "2026-07-04"), 7 + 32 / 60);
  assert.ok(Math.abs(hoursFromMidnight("2026-07-03T22:05", "2026-07-04") - (-1 - 55 / 60)) < 1e-9);
});

test("tideHeightAt returns the extreme heights at the extremes", () => {
  const pts = [{ th: 1.5, h: 1.24 }, { th: 7.5, h: 4.36 }];
  assert.ok(Math.abs(tideHeightAt(pts, 1.5) - 1.24) < 1e-9);
  assert.ok(Math.abs(tideHeightAt(pts, 7.5) - 4.36) < 1e-9);
});

test("tideHeightAt is the midpoint mean at the half-way time", () => {
  const pts = [{ th: 0, h: 1 }, { th: 6, h: 5 }];
  assert.ok(Math.abs(tideHeightAt(pts, 3) - 3) < 1e-9); // (1+5)/2
});

test("tideHeightAt clamps outside the sampled range", () => {
  const pts = [{ th: 2, h: 1 }, { th: 8, h: 5 }];
  assert.equal(tideHeightAt(pts, 0), 1);
  assert.equal(tideHeightAt(pts, 10), 5);
});

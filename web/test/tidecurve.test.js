import test from "node:test";
import assert from "node:assert/strict";
import { hoursFromMidnight, tideHeightAt, tideCurve } from "../js/charts/tidecurve.js";

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

function sampleTide() {
  return {
    extremes: [
      { th: -2.4, h: 4.7, type: "high", time: "21:36" },
      { th: 3.5, h: 1.1, type: "low", time: "03:30" },
      { th: 9.7, h: 4.8, type: "high", time: "09:42" },
      { th: 16.0, h: 1.2, type: "low", time: "15:58" },
      { th: 22.1, h: 4.7, type: "high", time: "22:05" },
      { th: 28.3, h: 1.1, type: "low", time: "04:18" },
    ],
    nowTh: 7.2, rising: true,
  };
}

test("tideCurve emits an area + line path and starts with <svg>", () => {
  const svg = tideCurve(sampleTide());
  assert.ok(svg.startsWith("<svg"));
  assert.match(svg, /class="tc-area"/);
  assert.match(svg, /class="tc-line"/);
});

test("tideCurve annotates interior highs/lows with PM/BM + time", () => {
  const svg = tideCurve(sampleTide());
  assert.ok(svg.includes("PM 09:42"));
  assert.ok(svg.includes("BM 15:58"));
});

test("tideCurve draws the now dot + ring + rising arrow", () => {
  const svg = tideCurve(sampleTide());
  assert.match(svg, /class="tc-now-dot"/);
  assert.match(svg, /class="tc-now-ring"/);
  assert.ok(svg.includes("↗"));
});

test("tideCurve labels the x-axis every 6 hours", () => {
  const svg = tideCurve(sampleTide());
  for (const l of ["0h", "6h", "12h", "18h", "24h"]) assert.ok(svg.includes(`>${l}</text>`));
});

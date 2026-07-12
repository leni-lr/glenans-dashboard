import test from "node:test";
import assert from "node:assert/strict";
import { rockThreshold, nextCrossing, rockStatusAt, thToClock } from "../js/rocks/rocksafety.js";

// A simple triangular tide: low 0 m at th=0, high 6 m at th=6, low 0 m at th=12.
const EXTREMES = [
  { th: 0, h: 0 },
  { th: 6, h: 6 },
  { th: 12, h: 0 },
];

test("rockThreshold is height + draft", () => {
  assert.equal(rockThreshold({ height: 1.2, draft: 1.5 }), 2.7);
});

test("rockStatusAt: foul near low water, clear near high water", () => {
  const rock = { height: 1.0, draft: 1.0 }; // threshold 2 m
  const low = rockStatusAt(EXTREMES, rock, 0.5);
  const high = rockStatusAt(EXTREMES, rock, 6);
  assert.equal(low.safe, false, "foul just after low water");
  assert.equal(high.safe, true, "clear at high water");
  assert.equal(high.threshold, 2);
});

test("nextCrossing finds the rising crossing time", () => {
  // threshold 3 m on the rising limb (0->6 over th 0..6): crosses at th=3.
  const th = nextCrossing(EXTREMES, 3, 0);
  assert.ok(th !== null, "a crossing exists");
  assert.ok(Math.abs(th - 3) < 0.1, `crossing near th=3, got ${th}`);
});

test("nextCrossing returns null when no crossing ahead", () => {
  // threshold 10 m is never reached (max 6 m) -> null
  assert.equal(nextCrossing(EXTREMES, 10, 0), null);
});

test("thToClock formats fractional hours as HhMM", () => {
  assert.equal(thToClock(14.4), "14h24");
  assert.equal(thToClock(6), "6h00");
  assert.equal(thToClock(25.5), "1h30"); // wraps past midnight
});

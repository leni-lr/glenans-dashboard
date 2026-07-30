import test from "node:test";
import assert from "node:assert/strict";
import { chartURL, stepIdx, swipeAction } from "../js/cards/isobar.js";
import { WORKER_URL } from "../config.js";

test("chartURL pins step, variant and run", () => {
  const state = { variant: "bw", run: "2026-07-27T0000" };
  assert.equal(chartURL(state, 24),
    `${WORKER_URL}/api/chart?step=24&variant=bw&run=2026-07-27T0000`);
});

test("stepIdx stops at both ends instead of wrapping", () => {
  assert.equal(stepIdx(0, 8, 1), 1);
  assert.equal(stepIdx(3, 8, -1), 2);
  assert.equal(stepIdx(7, 8, 1), 7, "past the last step stays on the last");
  assert.equal(stepIdx(0, 8, -1), 0, "before the first stays on the first");
});

test("stepIdx clamps on a single-step manifest", () => {
  assert.equal(stepIdx(0, 1, 1), 0);
  assert.equal(stepIdx(0, 1, -1), 0);
});

test("swipeAction reads a decisive horizontal drag", () => {
  assert.equal(swipeAction(-120, 10, false), "next", "swipe left advances");
  assert.equal(swipeAction(120, -10, false), "prev");
});

test("swipeAction ignores everything while zoomed — drags pan instead", () => {
  assert.equal(swipeAction(-200, 0, true), null);
  assert.equal(swipeAction(200, 0, true), null);
});

test("swipeAction ignores a tap or a nudge below the threshold", () => {
  assert.equal(swipeAction(0, 0, false), null);
  assert.equal(swipeAction(-49, 0, false), null);
  assert.equal(swipeAction(-50, 0, false), null, "strictly greater than the threshold");
  assert.equal(swipeAction(-51, 0, false), "next");
});

test("swipeAction ignores a drag that is mostly vertical", () => {
  assert.equal(swipeAction(-60, 60, false), null, "a scroll, not a swipe");
  assert.equal(swipeAction(-60, 200, false), null);
  assert.equal(swipeAction(-120, 40, false), "next", "clearly horizontal");
});

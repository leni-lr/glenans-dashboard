import test from "node:test";
import assert from "node:assert/strict";
import { orderedKeys, visibleKeys, reorder } from "../js/cards/cardorder.js";

const KEYS = ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"];

test("orderedKeys keeps stored order, drops unknown, appends missing", () => {
  const out = orderedKeys(["tide", "forecast", "ghost"], KEYS);
  // stored known keys first (in stored order), then the rest in registry order
  assert.deepEqual(out, ["tide", "forecast", "livewind", "rocks", "bulletin", "isobar"]);
});

test("orderedKeys dedups repeated keys", () => {
  assert.deepEqual(orderedKeys(["tide", "tide"], ["tide", "forecast"]), ["tide", "forecast"]);
});

test("orderedKeys tolerates empty/undefined order", () => {
  assert.deepEqual(orderedKeys(undefined, KEYS), KEYS);
  assert.deepEqual(orderedKeys([], KEYS), KEYS);
});

test("visibleKeys removes hidden keys but preserves order", () => {
  assert.deepEqual(
    visibleKeys(["forecast", "tide", "rocks"], ["rocks"], KEYS),
    ["forecast", "tide", "livewind", "bulletin", "isobar"]
  );
});

test("reorder moves an item from one index to another", () => {
  assert.deepEqual(reorder(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reorder(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
});

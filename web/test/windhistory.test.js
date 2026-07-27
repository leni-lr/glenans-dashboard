import test from "node:test";
import assert from "node:assert/strict";
import { observedSeries } from "../js/charts/meteogram.js";

test("observedSeries converts seconds to ms and keeps ascending order", () => {
  const out = observedSeries([
    { ts: 1785009960, mean: 7 },
    { ts: 1785010560, mean: 8 },
  ]);
  assert.deepEqual(out, [
    { ms: 1785009960000, mean: 7 },
    { ms: 1785010560000, mean: 8 },
  ]);
});

test("observedSeries sorts an out-of-order feed", () => {
  const out = observedSeries([{ ts: 300, mean: 9 }, { ts: 100, mean: 5 }, { ts: 200, mean: 7 }]);
  assert.deepEqual(out.map((p) => p.mean), [5, 7, 9]);
});

test("observedSeries drops samples with a non-finite ts or mean", () => {
  const out = observedSeries([
    { ts: 100, mean: 5 },
    { ts: null, mean: 6 },
    { ts: 300, mean: null },
    { ts: 400, mean: 8 },
  ]);
  assert.deepEqual(out.map((p) => p.mean), [5, 8]);
});

test("observedSeries returns [] for anything that is not an array", () => {
  assert.deepEqual(observedSeries(undefined), []);
  assert.deepEqual(observedSeries(null), []);
  assert.deepEqual(observedSeries([]), []);
});

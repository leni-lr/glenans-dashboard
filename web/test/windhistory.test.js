import test from "node:test";
import assert from "node:assert/strict";
import { observedSeries, meteogram } from "../js/charts/meteogram.js";
import { legendHTML } from "../js/cards/forecast.js";

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

// 25 hourly points, 2026-07-26T00:00 .. 2026-07-27T00:00 local-naive.
function day() {
  const times = Array.from({ length: 25 }, (_, i) => {
    const d = i < 24 ? "26" : "27";
    return `2026-07-${d}T${String(i % 24).padStart(2, "0")}:00`;
  });
  return { times, speed: times.map(() => 10), gust: times.map(() => 14), dir: times.map(() => 270) };
}
const ms = (iso) => new Date(iso).getTime();

test("meteogram draws the observed curve when given two or more in-domain points", () => {
  const svg = meteogram(day(), {
    observed: [
      { ms: ms("2026-07-26T06:00"), mean: 9 },
      { ms: ms("2026-07-26T12:00"), mean: 15 },
    ],
  });
  assert.match(svg, /class="mg-observed"/);
});

test("meteogram maps the observed curve by timestamp, not by index", () => {
  // The chart spans 24 h over plot width 300-26-8=266, starting at x=26.
  // A sample at exactly midday must land at the plot's horizontal midpoint,
  // regardless of how many forecast points there are.
  const svg = meteogram(day(), {
    observed: [
      { ms: ms("2026-07-26T00:00"), mean: 10 },
      { ms: ms("2026-07-26T12:00"), mean: 10 },
      { ms: ms("2026-07-27T00:00"), mean: 10 },
    ],
  });
  const d = svg.match(/class="mg-observed" d="([^"]+)"/)[1];
  const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 3);
  assert.ok(Math.abs(xs[0] - 26) < 0.1, `starts at plot left, got ${xs[0]}`);
  assert.ok(Math.abs(xs[1] - 159) < 0.1, `midday at plot midpoint, got ${xs[1]}`);
  assert.ok(Math.abs(xs[2] - 292) < 0.1, `ends at plot right, got ${xs[2]}`);
});

test("meteogram clips observed points outside the chart's time domain", () => {
  const svg = meteogram(day(), {
    observed: [
      { ms: ms("2026-07-25T18:00"), mean: 30 }, // yesterday — outside
      { ms: ms("2026-07-26T06:00"), mean: 9 },
      { ms: ms("2026-07-26T12:00"), mean: 15 },
    ],
  });
  const d = svg.match(/class="mg-observed" d="([^"]+)"/)[1];
  assert.equal([...d.matchAll(/[ML]/g)].length, 2, "only the two in-domain points");
});

test("meteogram draws nothing when fewer than two observed points are in domain", () => {
  const one = meteogram(day(), { observed: [{ ms: ms("2026-07-26T06:00"), mean: 9 }] });
  assert.ok(!one.includes("mg-observed"));
  const none = meteogram(day(), { observed: [{ ms: ms("2020-01-01T00:00"), mean: 9 }] });
  assert.ok(!none.includes("mg-observed"));
  const empty = meteogram(day(), { observed: [] });
  assert.ok(!empty.includes("mg-observed"));
  const absent = meteogram(day(), {});
  assert.ok(!absent.includes("mg-observed"));
});

test("meteogram scales the y-axis to an observed peak above the forecast gusts", () => {
  const svg = meteogram(day(), {
    observed: [
      { ms: ms("2026-07-26T06:00"), mean: 9 },
      { ms: ms("2026-07-26T12:00"), mean: 44 },
    ],
  });
  // ym would be 35 on gusts alone; 44+3 -> 50 with the observed peak. The
  // gridline labels are unchanged (10/20/30) but the 30-line moves down.
  // Gridlines are emitted in the order 10, 20, 30 — take the third.
  const grids = [...svg.matchAll(/<line class="mg-grid" x1="26" y1="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(grids.length, 3);
  // y(30) with ym=50: TOP 10 + plotH 74 * (1 - 30/50) = 39.6  (it would be 25.4 at ym=35)
  assert.ok(Math.abs(grids[2] - 39.6) < 0.2, `expected the 50kn scale, got y=${grids[2]}`);
});

test("meteogram skips the observed curve when the time domain is unparseable", () => {
  const bogus = { times: ["t0", "t1"], speed: [10, 10], gust: [14, 14], dir: [270, 270] };
  const svg = meteogram(bogus, { observed: [{ ms: 1000, mean: 9 }, { ms: 2000, mean: 9 }] });
  assert.ok(!svg.includes("mg-observed"));
});

test("legendHTML shows the observed key only when a curve was drawn", () => {
  const without = legendHTML("fr");
  assert.ok(!without.includes("leg-obs"), "no promise of data that is not there");
  assert.ok(without.includes("maintenant"));

  const with_ = legendHTML("fr", { observed: true });
  assert.match(with_, /class="leg-obs">━<\/span> réel/);
  assert.ok(with_.indexOf("leg-obs") < with_.indexOf("leg-now"), "réel sits before maintenant");
});

test("legendHTML translates the observed key", () => {
  assert.ok(legendHTML("en", { observed: true }).includes("real"));
});

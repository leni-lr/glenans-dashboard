import test from "node:test";
import assert from "node:assert/strict";
import { COMPARE_MODELS, visibleModels } from "../js/sources/compare.js";
import { overlayChart, trimTrailingNulls, sliceData, median } from "../js/charts/compare.js";

test("COMPARE_MODELS lists the free models with labels", () => {
  assert.equal(COMPARE_MODELS.length, 6);
  const keys = COMPARE_MODELS.map((m) => m.key);
  assert.deepEqual(keys, ["arome_hd", "arome25", "icon", "ecmwf", "gfs", "harmonie"]);
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

test("median handles odd and even lengths", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("sliceData windows the parallel arrays and clamps the end", () => {
  const d = { times: ["a", "b", "c", "d"], speed: [1, 2, 3, 4], gust: [1, 2, 3, 4], dir: [0, 0, 0, 0] };
  const w = sliceData(d, 1, 3);
  assert.deepEqual(w.times, ["b", "c"]);
  assert.deepEqual(w.speed, [2, 3]);
  assert.deepEqual(sliceData(d, 2, 99).times, ["c", "d"], "end clamps to length");
  assert.deepEqual(sliceData(d, 0, null).times.length, 4, "null end = full");
});

test("overlayChart draws hour labels for a day window", () => {
  const times = ["2026-07-06T00:00", "2026-07-06T06:00", "2026-07-06T12:00"];
  const svg = overlayChart([{ key: "a", label: "A", times, speed: [5, 6, 7] }], { range: "today" });
  assert.match(svg, />0h</);
  assert.match(svg, />6h</);
});

const HOURS = Array.from({ length: 25 }, (_, i) => {
  const d = i < 24 ? "26" : "27";
  return `2026-07-${d}T${String(i % 24).padStart(2, "0")}:00`;
});
const at = (iso) => new Date(iso).getTime();

test("overlayChart draws the observed curve mapped by timestamp", () => {
  const svg = overlayChart(
    [{ key: "a", label: "A", times: HOURS, speed: HOURS.map(() => 12) }],
    { observed: [
      { ms: at("2026-07-26T00:00"), mean: 10 },
      { ms: at("2026-07-26T12:00"), mean: 10 },
      { ms: at("2026-07-27T00:00"), mean: 10 },
    ] });
  const d = svg.match(/class="mg-observed" d="([^"]+)"/)[1];
  const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
  // plot spans x=26 .. 320-8=312, width 286; midpoint 169
  assert.ok(Math.abs(xs[0] - 26) < 0.1, `starts left, got ${xs[0]}`);
  assert.ok(Math.abs(xs[1] - 169) < 0.1, `midday centred, got ${xs[1]}`);
  assert.ok(Math.abs(xs[2] - 312) < 0.1, `ends right, got ${xs[2]}`);
});

test("overlayChart clips observed points outside the domain and needs two to draw", () => {
  const line = [{ key: "a", label: "A", times: HOURS, speed: HOURS.map(() => 12) }];
  const clipped = overlayChart(line, { observed: [
    { ms: at("2026-07-20T00:00"), mean: 30 },
    { ms: at("2026-07-26T06:00"), mean: 9 },
    { ms: at("2026-07-26T12:00"), mean: 11 },
  ] });
  assert.equal([...clipped.match(/class="mg-observed" d="([^"]+)"/)[1].matchAll(/[ML]/g)].length, 2);

  const one = overlayChart(line, { observed: [{ ms: at("2026-07-26T06:00"), mean: 9 }] });
  assert.ok(!one.includes("mg-observed"));
});

test("overlayChart scales to an observed peak above every model", () => {
  const svg = overlayChart(
    [{ key: "a", label: "A", times: HOURS, speed: HOURS.map(() => 12) }],
    { observed: [
      { ms: at("2026-07-26T06:00"), mean: 9 },
      { ms: at("2026-07-26T12:00"), mean: 44 },
    ] });
  // Gridlines are emitted in the order 10, 20, 30 — take the third.
  // y(30) with ym=50, TOP=8, plotH=150-22-8=120 -> 8 + 120*(1-30/50) = 56.0
  const grids = [...svg.matchAll(/<line class="mg-grid" x1="26" y1="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(grids.length, 3);
  assert.ok(Math.abs(grids[2] - 56) < 0.2, `expected the 50kn scale, got y=${grids[2]}`);
});

test("overlayChart ignores observed data when times are unparseable", () => {
  const svg = overlayChart(
    [{ key: "a", label: "A", times: ["t0", "t1", "t2"], speed: [5, 6, 7] }],
    { observed: [{ ms: 1000, mean: 9 }, { ms: 2000, mean: 9 }] });
  assert.ok(!svg.includes("mg-observed"));
});

test("visibleModels drops hidden keys and preserves order", () => {
  const series = [{ key: "a" }, { key: "b" }, { key: "c" }];
  assert.deepEqual(visibleModels(series, ["b"]).map((s) => s.key), ["a", "c"]);
  assert.deepEqual(visibleModels(series, ["a", "c"]).map((s) => s.key), ["b"]);
  assert.deepEqual(visibleModels(series, ["a", "b", "c"]), []);
});

test("visibleModels returns everything when nothing is hidden", () => {
  const series = [{ key: "a" }, { key: "b" }];
  assert.equal(visibleModels(series, []), series);
  assert.equal(visibleModels(series, null), series);
  assert.equal(visibleModels(series, undefined), series);
});

test("overlayChart colours by ser.ci, so hiding a model cannot recolour its neighbours", () => {
  // ICON-EU is colour 2. Alone in the list its array index is 0 — without ci it
  // would render as cmp-line--0 (navy) the moment the models above it are hidden.
  const svg = overlayChart(
    [{ key: "icon", label: "ICON-EU", ci: 2, times: HOURS, speed: HOURS.map(() => 12) }]);
  assert.match(svg, /cmp-line--2/);
  assert.ok(!svg.includes("cmp-line--0"));
});

test("overlayChart without ci still colours by array position", () => {
  const svg = overlayChart([
    { key: "a", label: "A", times: HOURS, speed: HOURS.map(() => 5) },
    { key: "b", label: "B", times: HOURS, speed: HOURS.map(() => 8) },
  ]);
  assert.match(svg, /cmp-line--0/);
  assert.match(svg, /cmp-line--1/);
});

test("overlayChart with zero series still draws the measured curve from opts.times", () => {
  const svg = overlayChart([], {
    times: HOURS,
    observed: [
      { ms: at("2026-07-26T06:00"), mean: 9 },
      { ms: at("2026-07-26T18:00"), mean: 14 },
    ],
  });
  assert.match(svg, /class="mg-observed"/, "the day's real wind is still worth showing alone");
  assert.match(svg, /12h<\/text>/, "hour labels come from opts.times");
});

test("overlayChart spreads the hour labels across the plot with zero series", () => {
  // Guards a real trap: with no series the x-scale falls back to a single
  // point, which silently stacks every label on the left edge.
  const svg = overlayChart([], { times: HOURS });
  const xs = [...svg.matchAll(/<text class="mg-axis" x="([\d.]+)"[^>]*>\d+h<\/text>/g)]
    .map((m) => Number(m[1]));
  assert.ok(xs.length >= 4, `expected 0h/6h/12h/18h labels, got ${xs.length}`);
  assert.equal(new Set(xs).size, xs.length, `labels stacked at the same x: ${xs.join(",")}`);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 200, "labels span the plot width");
});

test("overlayChart with zero series and no observed data draws no line at all", () => {
  const svg = overlayChart([], { times: HOURS });
  assert.ok(!svg.includes("mg-observed"));
  assert.ok(!svg.includes("cmp-line--"));
});

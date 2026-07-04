import test from "node:test";
import assert from "node:assert/strict";
import { computeYMax, degToCardinal, tooltipAt, meteogram } from "../js/charts/meteogram.js";

test("computeYMax is 35 when gusts stay at or below 32", () => {
  assert.equal(computeYMax([8, 12, 30, 32]), 35);
  assert.equal(computeYMax([]), 35);
});

test("computeYMax expands past 32kn to the next 10 above max+3", () => {
  assert.equal(computeYMax([33]), 40);   // 33+3=36 -> 40
  assert.equal(computeYMax([45]), 50);   // 45+3=48 -> 50
  assert.equal(computeYMax([37]), 40);   // 37+3=40 -> 40
});

test("degToCardinal maps the 8 international points", () => {
  assert.equal(degToCardinal(0), "N");
  assert.equal(degToCardinal(360), "N");
  assert.equal(degToCardinal(45), "NE");
  assert.equal(degToCardinal(90), "E");
  assert.equal(degToCardinal(270), "W");
  assert.equal(degToCardinal(315), "NW");
});

test("tooltipAt pulls one hour's mean/gust/dir + cardinal", () => {
  const data = { times: ["2026-07-03T07:00"], speed: [12], gust: [18], dir: [270] };
  assert.deepEqual(tooltipAt(data, 0), {
    time: "2026-07-03T07:00", mean: 12, gust: 18, dir: 270, cardinal: "W",
  });
});

function sampleDay() {
  // 25 hourly points 00:00..24:00 of 2026-07-03 (last point is next midnight)
  const times = Array.from({ length: 25 }, (_, i) => {
    const day = i < 24 ? "03" : "04";
    const hh = String(i % 24).padStart(2, "0");
    return `2026-07-${day}T${hh}:00`;
  });
  const speed = times.map((_, i) => 8 + (i % 12));
  const gust  = speed.map((s) => s + 4);
  const dir   = times.map((_, i) => (250 + i * 3) % 360);
  return { times, speed, gust, dir };
}

test("meteogram emits area, mean line, and dashed gust paths", () => {
  const svg = meteogram(sampleDay());
  assert.ok(svg.startsWith("<svg"));
  assert.match(svg, /class="mg-area"/);
  assert.match(svg, /class="mg-line"/);
  assert.match(svg, /class="mg-gust"/);
});

test("meteogram draws the 10/20/30 gridline labels", () => {
  const svg = meteogram(sampleDay());
  for (const v of ["10", "20", "30"]) {
    assert.ok(svg.includes(`>${v}</text>`), `gridline ${v} label`);
  }
});

test("meteogram labels the 24h x-axis every 6 hours", () => {
  const svg = meteogram(sampleDay(), { range: "24h" });
  for (const label of ["0h", "6h", "12h", "18h"]) {
    assert.ok(svg.includes(`>${label}</text>`), `x label ${label}`);
  }
});

test("meteogram draws the now line only when nowTime is within range", () => {
  const inside = meteogram(sampleDay(), { nowTime: "2026-07-03T07:00" });
  assert.match(inside, /class="mg-now"/);
  const outside = meteogram(sampleDay(), { nowTime: "2020-01-01T00:00" });
  assert.ok(!/class="mg-now"/.test(outside));
});

test("meteogram overlays a compare line when compare data is given", () => {
  const d = sampleDay();
  const svg = meteogram(d, { compare: { times: d.times, speed: d.speed.map((s) => s - 2) } });
  assert.match(svg, /class="mg-compare"/);
});

test("meteogram tolerates gusts above 32kn (y auto-expands, still renders)", () => {
  const d = sampleDay();
  d.gust = d.gust.map((_, i) => (i === 5 ? 40 : 20));
  const svg = meteogram(d);
  assert.match(svg, /class="mg-area"/); // no throw, area still drawn
});

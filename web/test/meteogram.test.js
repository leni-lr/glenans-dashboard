import test from "node:test";
import assert from "node:assert/strict";
import { computeYMax, degToCardinal, tooltipAt } from "../js/charts/meteogram.js";

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

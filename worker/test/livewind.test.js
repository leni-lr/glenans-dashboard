import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveWind, liveWindURL } from "../src/livewind.js";

const sample = JSON.stringify([
  { ts: 1783281876, ws: { moy: 7, max: 8 }, wd: { moy: 261 } },
  { ts: 1783281996, ws: { moy: 6, max: 9 }, wd: { moy: 264 } },
]);

test("parseLiveWind returns the newest (last) reading", () => {
  const r = parseLiveWind(sample);
  assert.equal(r.mean, 6);
  assert.equal(r.gust, 9);
  assert.equal(r.dir, 264);
  assert.equal(r.ts, 1783281996);
});

test("parseLiveWind tolerates a missing/empty direction", () => {
  const r = parseLiveWind(JSON.stringify([{ ts: 100, ws: { moy: 5, max: 6 }, wd: { moy: "" } }]));
  assert.equal(r.dir, null);
  assert.equal(r.mean, 5);
});

test("parseLiveWind throws on an empty array", () => {
  assert.throws(() => parseLiveWind("[]"));
});

test("liveWindURL builds the observations URL for a sensor", () => {
  assert.equal(liveWindURL(6),
    "https://backend.windmorbihan.com/observations/chart.json?sensor=6&time_frame=60");
});

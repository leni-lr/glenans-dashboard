import test from "node:test";
import assert from "node:assert/strict";
import { parseWindHistory, windHistoryURL, DAY_FRAME } from "../src/windhistory.js";

const sample = JSON.stringify([
  { ts: 1785009960, ws: { moy: 7, max: 12 }, wd: { moy: 300 } },
  { ts: 1785010560, ws: { moy: 8, max: 13 }, wd: { moy: 305 } },
  { ts: 1785011160, ws: { moy: 9, max: 14 }, wd: { moy: 310 } },
]);

test("parseWindHistory returns every sample, oldest first", () => {
  const { samples } = parseWindHistory(sample);
  assert.equal(samples.length, 3);
  assert.deepEqual(samples[0], { ts: 1785009960, mean: 7, gust: 12, dir: 300 });
  assert.equal(samples[2].mean, 9);
});

test("parseWindHistory drops samples with an empty mean or timestamp", () => {
  const raw = JSON.stringify([
    { ts: 100, ws: { moy: 5, max: 7 }, wd: { moy: 200 } },
    { ts: 200, ws: { moy: "", max: "" }, wd: { moy: "" } },
    { ts: "", ws: { moy: 6, max: 8 }, wd: { moy: 210 } },
    { ts: 400, ws: { moy: 6, max: 8 }, wd: { moy: 210 } },
  ]);
  const { samples } = parseWindHistory(raw);
  assert.equal(samples.length, 2, "keeps the neighbours of a dropped sample");
  assert.deepEqual(samples.map((s) => s.ts), [100, 400]);
});

test("parseWindHistory falls back to the mean when gust is missing", () => {
  const { samples } = parseWindHistory(
    JSON.stringify([{ ts: 100, ws: { moy: 11, max: "" }, wd: { moy: 90 } }]));
  assert.equal(samples[0].gust, 11);
});

test("parseWindHistory nulls an empty direction", () => {
  const { samples } = parseWindHistory(
    JSON.stringify([{ ts: 100, ws: { moy: 11, max: 15 }, wd: { moy: "" } }]));
  assert.equal(samples[0].dir, null);
});

test("parseWindHistory throws on a non-array, an empty array, and an all-empty array", () => {
  assert.throws(() => parseWindHistory('{"nope":1}'));
  assert.throws(() => parseWindHistory("[]"));
  assert.throws(() => parseWindHistory(
    JSON.stringify([{ ts: 100, ws: { moy: "", max: "" }, wd: { moy: "" } }])));
});

test("windHistoryURL requests the 24 h enum value, not a duration", () => {
  assert.equal(DAY_FRAME, 144);
  assert.equal(windHistoryURL(6),
    "https://backend.windmorbihan.com/observations/chart.json?sensor=6&time_frame=144");
});

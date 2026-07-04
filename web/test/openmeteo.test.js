import test from "node:test";
import assert from "node:assert/strict";
import { buildForecastURL, normalizeForecast, MODELS } from "../js/sources/openmeteo.js";

test("buildForecastURL sets the Penfret AROME 24h query", () => {
  const u = new URL(buildForecastURL({ lat: 47.716, lon: -3.95 }));
  assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
  const q = u.searchParams;
  assert.equal(q.get("latitude"), "47.716");
  assert.equal(q.get("longitude"), "-3.95");
  assert.equal(q.get("models"), "meteofrance_arome_france_hd");
  assert.equal(q.get("wind_speed_unit"), "kn");
  assert.equal(q.get("timezone"), "Europe/Paris");
  assert.equal(q.get("forecast_days"), "1");
  assert.equal(q.get("hourly"),
    "wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,cloud_cover");
});

test("buildForecastURL honours model + days (7-day compare)", () => {
  const q = new URL(buildForecastURL({ lat: 1, lon: 2, model: MODELS.arpege, days: 7 })).searchParams;
  assert.equal(q.get("models"), "meteofrance_arpege_europe");
  assert.equal(q.get("forecast_days"), "7");
});

test("normalizeForecast maps the hourly arrays", () => {
  const n = normalizeForecast({ hourly: {
    time: ["2026-07-03T00:00"], wind_speed_10m: [8], wind_gusts_10m: [12],
    wind_direction_10m: [250], precipitation: [0], cloud_cover: [20],
  }});
  assert.deepEqual(n.times, ["2026-07-03T00:00"]);
  assert.deepEqual(n.speed, [8]);
  assert.deepEqual(n.gust, [12]);
  assert.deepEqual(n.dir, [250]);
  assert.deepEqual(n.precip, [0]);
  assert.deepEqual(n.cloud, [20]);
});

test("normalizeForecast throws on a malformed payload", () => {
  assert.throws(() => normalizeForecast({}), /missing hourly/);
});

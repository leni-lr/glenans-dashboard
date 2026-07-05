import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTide } from "../src/tide.js";

const html = readFileSync(new URL("./fixtures/maree-94.html", import.meta.url), "utf8");

test("parseTide extracts the Penfret port name", () => {
  const r = parseTide(html);
  assert.match(r.port, /Penfret/i);
});
test("parseTide returns today's coefficient(s) as numbers", () => {
  const r = parseTide(html);
  assert.ok(r.coef.length >= 1 && r.coef.every((c) => typeof c === "number"));
});
test("parseTide returns HW/LW extremes with time + height", () => {
  const r = parseTide(html);
  assert.ok(r.extremes.length >= 4);
  for (const e of r.extremes) {
    assert.ok(e.type === "high" || e.type === "low");
    assert.match(e.time, /^\d{2}:\d{2}$/);
    assert.equal(typeof e.h, "number");
    assert.match(e.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  }
  // spans across today so the frontend can draw a gap-free 0-24h curve
  assert.ok(r.extremes.some((e) => e.iso < `${r.today}T00:00`) || r.extremes[0].iso.startsWith(r.today));
});
test("parseTide throws on unrecognised HTML", () => {
  assert.throws(() => parseTide("<html>nope</html>"));
});

// Real values read directly from worker/test/fixtures/maree-94.html
// (fixture captured 2026-07-05 from https://maree.info/94):
// - <title> contains "Marées Penfret (Iles de Glénan) / France ..."
// - Marees.aujourdhui = 20260705, Marees.Dates[0] = 20260705
// - Row #MareeJours_0 (today, Dim. 05):
//   Heure:  02h48 / 08h46(PM) / 14h57 / 20h59(PM)
//   Hauteur: 1,33m / 4,27m / 1,42m / 4,42m
//   Coeff.:  (blank) / 68 / (blank) / 66
test("parseTide matches the real fixture values for today (2026-07-05)", () => {
  const r = parseTide(html);
  assert.equal(r.today, "2026-07-05");
  assert.deepEqual(r.coef, [68, 66]);

  const today = r.extremes.filter((e) => e.iso.startsWith("2026-07-05"));
  assert.equal(today.length, 4);
  assert.deepEqual(
    today.map((e) => [e.type, e.time, e.h]),
    [
      ["low", "02:48", 1.33],
      ["high", "08:46", 4.27],
      ["low", "14:57", 1.42],
      ["high", "20:59", 4.42],
    ]
  );
});

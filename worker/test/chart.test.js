import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLatestRun, chartGifURL, CHART_STEPS } from "../src/chart.js";

const html = readFileSync(new URL("./fixtures/metoffice-surface-pressure.html", import.meta.url), "utf8");

test("parseLatestRun pulls the run timestamp from the page", () => {
  const run = parseLatestRun(html);
  assert.match(run, /^\d{4}-\d{2}-\d{2}T\d{4}$/);
});

test("parseLatestRun throws when absent", () => {
  assert.throws(() => parseLatestRun("<html>nope</html>"));
});

test("chartGifURL builds the colour URL with padded step", () => {
  assert.equal(chartGifURL("2026-07-05T1200", 0),
    "https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/colour/2026-07-05T1200/FSXX12T_00.gif");
  assert.equal(chartGifURL("2026-07-05T1200", 120).endsWith("FSXX12T_120.gif"), true);
});

test("CHART_STEPS covers analysis through T+120", () => {
  assert.deepEqual(CHART_STEPS, [0, 12, 24, 36, 48, 60, 72, 96, 120]);
});

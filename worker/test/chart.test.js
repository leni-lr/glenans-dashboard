import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLatestRun, chartGifURL, chartSteps, CHART_STEPS, previousRun } from "../src/chart.js";

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

test("chartGifURL builds the bw URL (different scheme, stops at T+84)", () => {
  const base = "https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure";
  assert.equal(chartGifURL("2026-07-08T0000", 0, "bw"), `${base}/bw/2026-07-08T0000/0000_ASXX_Assistant_FC000.gif`);
  assert.equal(chartGifURL("2026-07-08T0000", 12, "bw").endsWith("0000_FSXX_FC012.gif"), true);
  assert.equal(chartGifURL("2026-07-08T0000", 36, "bw").endsWith("0000_MEDIUM_RANGE_FC036.gif"), true);
  assert.equal(chartGifURL("2026-07-08T1200", 84, "bw").endsWith("1200_MEDIUM_RANGE_FC084.gif"), true);
});

test("chartSteps: bw stops at T+84, colour goes to T+120", () => {
  assert.deepEqual(chartSteps("bw"), [0, 12, 24, 36, 48, 60, 72, 84]);
  assert.deepEqual(chartSteps("colour"), [0, 12, 24, 36, 48, 60, 72, 96, 120]);
});

test("previousRun steps back 12 h across the 00Z/12Z boundary and the day", () => {
  assert.equal(previousRun("2026-07-06T0000"), "2026-07-05T1200");
  assert.equal(previousRun("2026-07-06T1200"), "2026-07-06T0000");
});

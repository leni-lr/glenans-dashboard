# QoL Batch — Observed Wind Curve, Demain, Rocks Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the day's measured wind as a green curve over the forecast, replace the dashboard's 7-day view with tomorrow, and clean up the Cailloux card's wording and draught control.

**Architecture:** A new Cloudflare Worker route proxies windmorbihan's 24-hour observation feed; a pure helper normalises it to `{ms, mean}` points; the two existing SVG chart builders (`meteogram`, `overlayChart`) gain an `opts.observed` polyline mapped onto x **by timestamp** rather than by array index, because observations are irregular 10-minute samples while forecasts are hourly. The dashboard and comparator cards fetch the series once and pass it down. The Demain and rocks changes are independent edits to existing cards.

**Tech Stack:** Vanilla ES modules, no build step, no runtime dependencies. `node:test` + `node:assert/strict` for tests. Cloudflare Workers for the API proxy.

**Spec:** `docs/superpowers/specs/2026-07-26-qol-realwind-tomorrow-rocks-design.md`

## Global Constraints

- Vanilla ES modules, no build step, no runtime dependencies. Do not add anything to `package.json`.
- No hardcoded hex outside `web/css/tokens.css`. Use existing tokens; this plan introduces no new ones.
- All external or user-supplied text goes through `escapeHTML` (`web/js/util/html.js`) before reaching the DOM. UI strings from `t(lang, key)` are trusted and are not escaped — follow the surrounding code.
- Only setting keys present in `DEFAULTS` (`web/js/settings.js`) survive `mergeSettings`. This plan adds no new setting keys.
- Chart builders emit geometry + CSS class names only. Colour never appears in JS.
- A failing data source degrades that one element and never blanks a card. Every observed-wind fetch is wrapped so failure yields an empty series.
- Web tests: `npm test` (runs `node --test web/test/*.test.js`). Worker tests: `node --test worker/test/*.test.js`. Both must stay green.
- **Baseline before starting: 87 web tests passing, 28 worker tests passing.**
- Commit after every task. Conventional-commit prefixes (`feat:`, `fix:`, `refactor:`, `test:`), matching the existing history.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `worker/src/windhistory.js` | Build the upstream URL; parse the 24 h feed into `{samples}`. Pure. |
| `worker/test/windhistory.test.js` | Tests for the above. |
| `web/js/sources/windhistory.js` | Thin browser fetch wrapper around `/api/windhistory`. |
| `web/js/cards/draftpicker.js` | Small modal to set the boat's draught. |
| `web/test/windhistory.test.js` | Tests for `observedSeries` + the observed rendering paths. |

**Modify:**

| File | Change |
|---|---|
| `worker/src/index.js` | Add the `/api/windhistory` route. |
| `web/js/charts/meteogram.js` | `observedSeries`; `computeYMax` second arg; `opts.observed` path. |
| `web/js/charts/compare.js` | `overlayChart` gains `opts.observed` + observed-aware y-scale. |
| `web/css/meteogram.css` | `.mg-observed`, `.mg-legend .leg-obs`. |
| `web/js/cards/forecast.js` | Observed wiring; Demain replaces 7 j; `LONG_RANGE` deleted. |
| `web/js/cards/compareview.js` | Observed wiring for the *aujourd'hui* tab. |
| `web/js/cards/rocks.js` | Pill carries the full phrase; draught chip in the title row. |
| `web/js/cards/settingspage.js` | Remove the draught field. |
| `web/css/rocks.css` | Pill/name styling; `.rf-draft` input styling. |
| `web/css/settings.css` | Remove `.set-field` / `.set-draft`. |
| `web/js/i18n.js` | New keys; `rocks_dry` reworded. |
| `web/test/meteogram.test.js` | `computeYMax` with observed. |
| `web/test/compare.test.js` | `overlayChart` with observed. |
| `web/test/rocksafety.test.js` | Left alone — new rocks tests go in a new file. |
| `web/test/rocks.test.js` (new) | `rockPill`, `draftLabel`. |

**Deviation from the spec, deliberate:** the spec proposed a captured fixture at `worker/test/fixtures/windhistory-144.json`. This plan uses **inline `JSON.stringify` samples** instead, matching `worker/test/livewind.test.js`, which consumes the same upstream. The `fixtures/` directory holds only large HTML/XML captures; a 240-entry JSON blob there would be noise.

---

### Task 1: Worker endpoint — `/api/windhistory`

**Files:**
- Create: `worker/src/windhistory.js`
- Create: `worker/test/windhistory.test.js`
- Modify: `worker/src/index.js` (imports at top; new handler after `handleLiveWind`, which ends at the line before `mintBMSToken`; new route line in the `fetch` export)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `windHistoryURL(nid: number|string) -> string`
  - `parseWindHistory(jsonText: string) -> { samples: Array<{ ts: number, mean: number, gust: number, dir: number|null }> }`
  - HTTP `GET /api/windhistory?nid=<digits>` → `{ nid: number, samples: [...] }`, consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `worker/test/windhistory.test.js`:

```js
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test worker/test/windhistory.test.js`
Expected: FAIL — `Cannot find module .../worker/src/windhistory.js`

- [ ] **Step 3: Write the parser**

Create `worker/src/windhistory.js`:

```js
// windmorbihan observations feed, day view. `time_frame` is an ENUM, not a
// duration: the site's own UI only ever sends 60 (2 h), 36 (6 h), 144 (24 h)
// and 1152 (8 days). Any other value silently falls back to a useless ~8-point
// default, so do not "improve" this number.
export const DAY_FRAME = 144;

export function windHistoryURL(nid) {
  return `https://backend.windmorbihan.com/observations/chart.json?sensor=${nid}&time_frame=${DAY_FRAME}`;
}

// The feed uses "" for channels a sensor lacks; Number("") is 0, so coerce
// through this guard which maps empty/absent/non-finite to null. (Deliberately
// duplicated from livewind.js — worker source modules stay standalone.)
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Every sample that has both a timestamp and a mean wind, oldest→newest. A
// sample missing either is DROPPED rather than nulled: the curve is mapped by
// time, so a gap just becomes a longer straight segment instead of a break.
export function parseWindHistory(jsonText) {
  const arr = JSON.parse(jsonText);
  if (!Array.isArray(arr)) throw new Error("not an array");
  const samples = [];
  for (const r of arr) {
    const ts = num(r?.ts);
    const mean = num(r?.ws?.moy);
    if (ts == null || mean == null) continue;
    const gust = num(r?.ws?.max);
    samples.push({ ts, mean, gust: gust == null ? mean : gust, dir: num(r?.wd?.moy) });
  }
  if (!samples.length) throw new Error("no valid readings");
  return { samples };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test worker/test/windhistory.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the route**

In `worker/src/index.js`, extend the livewind import line:

```js
import { parseLiveWind, liveWindURL } from "./livewind.js";
import { parseWindHistory, windHistoryURL } from "./windhistory.js";
```

Add this handler immediately after `handleLiveWind` (it is a near-copy — same cache/error shape as its neighbours, deliberately):

```js
// The day's measured wind, for the green curve drawn over the forecast. Cached
// 5 min — comfortably under the feed's 10-minute sampling interval.
async function handleWindHistory(url, request, ctx) {
  const nid = (url.searchParams.get("nid") || "6").replace(/[^0-9]/g, "") || "6";
  const cache = caches.default;
  const cacheKey = new Request(`https://windhistory.cache/${nid}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(windHistoryURL(nid), { headers: { "User-Agent": UA } });
    if (!res.ok) return json({ error: `windmorbihan HTTP ${res.status}` }, 502);
    const data = parseWindHistory(await res.text());
    const out = json({ nid: Number(nid), ...data }, 200, { "Cache-Control": "public, max-age=300" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `windhistory failed: ${String(e.message || e)}` }, 502);
  }
}
```

And in the `export default { async fetch(...) }` block, add the route after the livewind line:

```js
    if (url.pathname === "/api/livewind") return handleLiveWind(url, request, ctx);
    if (url.pathname === "/api/windhistory") return handleWindHistory(url, request, ctx);
```

- [ ] **Step 6: Verify the route against the real upstream**

There is no unit-test harness for `index.js` (it needs Cloudflare's `caches.default`), so verify it live, the same way the other routes were.

Run in one terminal: `npx wrangler dev --config worker/wrangler.toml`

Then in another:

```bash
curl -s "http://127.0.0.1:8787/api/windhistory?nid=6" | head -c 300
```

Expected: JSON starting `{"nid":6,"samples":[{"ts":` — roughly 130–250 samples spanning ~24 h. Confirm the count is over 100:

```bash
curl -s "http://127.0.0.1:8787/api/windhistory?nid=6" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.samples.length,"samples,",((j.samples.at(-1).ts-j.samples[0].ts)/3600).toFixed(1),"h")})'
```

Expected: something like `131 samples, 23.1 h`. If it prints ~8 samples, `time_frame` is wrong.

Stop `wrangler dev`.

- [ ] **Step 7: Run the whole worker suite**

Run: `node --test worker/test/*.test.js`
Expected: PASS, 34 tests (28 baseline + 6 new).

- [ ] **Step 8: Commit**

```bash
git add worker/src/windhistory.js worker/test/windhistory.test.js worker/src/index.js
git commit -m "feat(worker): /api/windhistory serving the day's measured wind"
```

---

### Task 2: `observedSeries` + observed-aware `computeYMax`

**Files:**
- Modify: `web/js/charts/meteogram.js` (`computeYMax` at lines 5–9; new `observedSeries` export)
- Create: `web/test/windhistory.test.js`
- Modify: `web/test/meteogram.test.js` (add one test; the two existing `computeYMax` tests must keep passing untouched)

**Interfaces:**
- Consumes: the `samples` array shape produced by Task 1.
- Produces:
  - `observedSeries(samples: Array<{ts, mean}>) -> Array<{ ms: number, mean: number }>` — ascending by `ms`. Used by Tasks 3, 5, 6, 7.
  - `computeYMax(gusts: number[], observed?: number[]) -> number`

- [ ] **Step 1: Write the failing tests**

Create `web/test/windhistory.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { observedSeries } from "../js/charts/meteogram.js";

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
```

Append to `web/test/meteogram.test.js`:

```js
test("computeYMax also scales to the observed curve", () => {
  // forecast gusts stay low, but the day actually blew 41 kn
  assert.equal(computeYMax([10, 14, 18], [12, 41, 20]), 50);
  // observed below the gusts changes nothing
  assert.equal(computeYMax([10, 14, 18], [5, 9]), 35);
  // omitting the second argument keeps the old behaviour
  assert.equal(computeYMax([45]), 50);
});

test("computeYMax ignores non-finite values in either array", () => {
  assert.equal(computeYMax([10, null, 14], [null, undefined, 8]), 35);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/windhistory.test.js web/test/meteogram.test.js`
Expected: FAIL — `observedSeries` is not exported (`SyntaxError: The requested module ... does not provide an export named 'observedSeries'`), and the new `computeYMax` cases fail on the extra argument.

- [ ] **Step 3: Implement both**

In `web/js/charts/meteogram.js`, replace `computeYMax` (currently lines 5–9) with:

```js
// Top of the y-axis in knots. Baseline 35 keeps the 10/20/30 gridlines tidy;
// expand past 32kn gusts to the next multiple of 10 at/above max+3 for headroom.
// `observed` is the measured-wind curve's means — without it, a day that blew
// harder than forecast would draw off the top of the plot.
export function computeYMax(gusts, observed = []) {
  const vals = [...gusts, ...observed].filter((v) => Number.isFinite(v));
  const max = vals.length ? Math.max(...vals) : 0;
  if (max > 32) return Math.ceil((max + 3) / 10) * 10;
  return 35;
}
```

Add this export directly below it:

```js
// Pure: raw {ts,mean} samples from /api/windhistory -> ascending [{ms, mean}]
// for the observed curve. Seconds become ms so the chart can map by timestamp.
export function observedSeries(samples) {
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((s) => s && Number.isFinite(s.ts) && Number.isFinite(s.mean))
    .map((s) => ({ ms: s.ts * 1000, mean: s.mean }))
    .sort((a, b) => a.ms - b.ms);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 93 tests (87 baseline + 4 + 2).

- [ ] **Step 5: Commit**

```bash
git add web/js/charts/meteogram.js web/test/windhistory.test.js web/test/meteogram.test.js
git commit -m "feat(charts): observedSeries helper and observed-aware y-scale"
```

---

### Task 3: Draw the observed curve in `meteogram()`

**Files:**
- Modify: `web/js/charts/meteogram.js` (the `meteogram` builder, lines 69–145)
- Modify: `web/css/meteogram.css`
- Modify: `web/test/windhistory.test.js`

**Interfaces:**
- Consumes: `observedSeries` (Task 2).
- Produces: `meteogram(data, opts)` honours `opts.observed: Array<{ms, mean}>`, emitting `<path class="mg-observed" …>`. Used by Tasks 5 and 7.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/windhistory.test.js` (add `meteogram` to the existing import at the top of the file, so the first line becomes
`import { observedSeries, meteogram } from "../js/charts/meteogram.js";`):

```js
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/windhistory.test.js`
Expected: FAIL — the first test errors on `svg.match(...)` returning null / no `mg-observed` class.

- [ ] **Step 3: Implement the observed path**

In `web/js/charts/meteogram.js`, inside `meteogram()`, replace this block (currently lines 72–74):

```js
  const { times, speed, gust, dir } = data;
  const N = times.length;
  const ym = computeYMax(gust);
```

with:

```js
  const { times, speed, gust, dir } = data;
  const N = times.length;
  // Observations are irregular ~10-minute samples while the forecast is hourly,
  // so they are placed by timestamp against the chart's own time domain — never
  // by array index. Points outside the domain are dropped (not clamped), so the
  // curve never draws a false flat segment along the chart edge. Filtering here,
  // before computeYMax, keeps an out-of-domain spike from inflating the y-axis.
  const t0ms = new Date(times[0]).getTime();
  const tNms = new Date(times[N - 1]).getTime();
  const domainOK = Number.isFinite(t0ms) && Number.isFinite(tNms) && tNms > t0ms;
  const obs = domainOK && Array.isArray(opts.observed)
    ? opts.observed.filter((p) => p.ms >= t0ms && p.ms <= tNms)
    : [];
  const ym = computeYMax(gust, obs.map((p) => p.mean));
```

Then insert the drawing block directly after the `mg-gust` path (currently line 100, `s += \`<path class="mg-gust" ...\`;`) and before the `opts.compare` block:

```js
  if (obs.length >= 2) {
    const ox = (msVal) => L + ((msVal - t0ms) / (tNms - t0ms)) * plotW;
    let op = `M${f(ox(obs[0].ms))} ${f(y(obs[0].mean))}`;
    for (let i = 1; i < obs.length; i++) op += ` L${f(ox(obs[i].ms))} ${f(y(obs[i].mean))}`;
    s += `<path class="mg-observed" d="${op}"/>`;
  }
```

- [ ] **Step 4: Add the styles**

In `web/css/meteogram.css`, add after the `.mg-compare` line:

```css
/* measured wind — same green as the now-bar the curve ends against, so green
   reads as "what happened" and blue as "what is forecast" */
.mg-observed { fill: none; stroke: var(--now); stroke-width: 1.8; }
```

And in the legend block, after `.mg-legend .leg-now`:

```css
.mg-legend .leg-obs  { color: var(--now); }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 99 tests (93 + 6).

- [ ] **Step 6: Commit**

```bash
git add web/js/charts/meteogram.js web/css/meteogram.css web/test/windhistory.test.js
git commit -m "feat(charts): draw the measured wind curve on the meteogram"
```

---

### Task 4: Client source + dashboard wiring

**Files:**
- Create: `web/js/sources/windhistory.js`
- Modify: `web/js/cards/forecast.js` (imports; `legendHTML` at lines 33–38; `bodyHTML` at 40–44; `renderForecast` at 47–80)
- Modify: `web/js/i18n.js` (one new key)
- Modify: `web/test/windhistory.test.js`

**Interfaces:**
- Consumes: `/api/windhistory` (Task 1), `observedSeries` (Task 2), `opts.observed` (Task 3).
- Produces:
  - `fetchWindHistory(nid) -> Promise<{ nid, samples }>` — also used by Task 6.
  - `legendHTML(lang, { observed = false } = {}) -> string`

- [ ] **Step 1: Write the failing test**

Append to `web/test/windhistory.test.js` (add a second import line at the top:
`import { legendHTML } from "../js/cards/forecast.js";`):

```js
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test web/test/windhistory.test.js`
Expected: FAIL — `legendHTML("fr", { observed: true })` does not contain `leg-obs`.

- [ ] **Step 3: Add the i18n key**

In `web/js/i18n.js`, next to the other `legend_*` keys at the bottom of `DICT`:

```js
  legend_observed: { fr: "réel", en: "real" },
```

- [ ] **Step 4: Create the client source**

Create `web/js/sources/windhistory.js`:

```js
import { WORKER_URL } from "../../config.js";

// The day's measured wind (~24 h of 10-minute samples) from the nearest
// windmorbihan anemometer. The station nid is resolved from the location; see
// web/js/location.js. Outside STATION_COVERAGE_KM there is no station and no
// curve — callers pass null and get a thrown error they are expected to swallow.
export async function fetchWindHistory(nid) {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  if (nid == null) throw new Error("no station");
  const res = await fetch(`${WORKER_URL}/api/windhistory?nid=${encodeURIComponent(nid)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `windhistory HTTP ${res.status}`);
  return data;
}
```

- [ ] **Step 5: Wire the dashboard card**

In `web/js/cards/forecast.js`, extend the imports:

```js
import { meteogram, bindMeteogramTooltip, observedSeries } from "../charts/meteogram.js";
import { fetchWindHistory } from "../sources/windhistory.js";
```

Replace `legendHTML` (lines 33–38) with:

```js
// Pure: the legend line under the chart. The `réel` key appears only when the
// measured curve was actually drawn.
export function legendHTML(lang, { observed = false } = {}) {
  return `<div class="mg-legend">` +
    `<span class="leg-mean">━</span> ${t(lang, "legend_mean") ?? "vent"}` +
    `&nbsp;&nbsp;<span class="leg-gust">┄</span> ${t(lang, "legend_gust") ?? "rafales"}` +
    (observed ? `&nbsp;&nbsp;<span class="leg-obs">━</span> ${t(lang, "legend_observed")}` : "") +
    `&nbsp;&nbsp;<span class="leg-now">│</span> ${t(lang, "legend_now") ?? "maintenant"}</div>`;
}
```

Replace `bodyHTML` (lines 40–44) with:

```js
function bodyHTML(lang, state, svg, observed) {
  return forecastTitleRow(lang, state) +
    `<div class="mg-wrap">${svg}</div>` +
    legendHTML(lang, { observed });
}
```

Add this helper above `renderForecast`:

```js
// The measured curve is strictly additive: no station, no Worker, or a dead
// upstream all yield an empty series and a chart identical to before.
async function loadObserved(state) {
  const { stationNid } = state.settings;
  if (stationNid == null || state.range !== "24h") return [];
  try {
    const { samples } = await fetchWindHistory(stationNid);
    return observedSeries(samples);
  } catch {
    return [];
  }
}
```

In `renderForecast`, start the observation fetch alongside the forecast (so they overlap), then feed it to the chart. The `try` block becomes:

```js
  const observedP = loadObserved(state);
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    const days = is7d ? 7 : 1;
    // The picked model is used as-is (ECMWF for 7 j on short-range models). Any
    // model that errors or returns no data here falls back to ECMWF.
    const primary = use7dEcmwf ? MODELS.ecmwf : picked.model;
    let data = await fetchForecast({ lat, lon, model: primary, days }).catch(() => null);
    if ((!data || !hasData(data)) && primary !== MODELS.ecmwf) {
      state.chip = "ECMWF";
      data = await fetchForecast({ lat, lon, model: MODELS.ecmwf, days });
    }
    if (!data) throw new Error("no forecast");
    state.data = data;
    const observed = await observedP;
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: state.range,
      lang,
      observed,
    });
    mountCard(CARD_ID, bodyHTML(lang, state, svg, observed.length > 0), { fade: true });
    bindInteractions(state);
  } catch {
```

Leave the `catch` branch as it is — the error card shows no legend at all.

> Note: `is7d` / `use7dEcmwf` are still present here. Task 7 replaces them; do not pre-empt it.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 101 tests (99 + 2).

- [ ] **Step 7: Commit**

```bash
git add web/js/sources/windhistory.js web/js/cards/forecast.js web/js/i18n.js web/test/windhistory.test.js
git commit -m "feat(forecast): draw the day's measured wind on the dashboard"
```

---

### Task 5: `overlayChart` observed curve

**Files:**
- Modify: `web/js/charts/compare.js` (`overlayChart`, lines 78–126)
- Modify: `web/test/compare.test.js`

**Interfaces:**
- Consumes: `computeYMax` two-arg form (Task 2).
- Produces: `overlayChart(series, opts)` honours `opts.observed: Array<{ms, mean}>`, emitting the same `<path class="mg-observed">`. Used by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/compare.test.js`:

```js
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/compare.test.js`
Expected: FAIL — no `mg-observed` in the output.

- [ ] **Step 3: Implement**

In `web/js/charts/compare.js`, inside `overlayChart`, replace this line (currently line 87):

```js
  const ym = computeYMax(allSpeeds);
```

with:

```js
  // Same timestamp mapping as the meteogram: observations are irregular
  // 10-minute samples and cannot be placed by array index. Filtered before
  // computeYMax so an out-of-domain point never inflates the y-axis.
  const t0ms = new Date(labelTimes[0]).getTime();
  const tNms = new Date(labelTimes[labelTimes.length - 1]).getTime();
  const domainOK = labelTimes.length > 1
    && Number.isFinite(t0ms) && Number.isFinite(tNms) && tNms > t0ms;
  const obs = domainOK && Array.isArray(opts.observed)
    ? opts.observed.filter((p) => p.ms >= t0ms && p.ms <= tNms)
    : [];
  const ym = computeYMax(allSpeeds, obs.map((p) => p.mean));
```

Then, immediately after the `active.forEach(...)` block that draws the model lines and before the `// x-axis time scale` comment, add:

```js
  if (obs.length >= 2) {
    const ox = (msVal) => L + ((msVal - t0ms) / (tNms - t0ms)) * plotW;
    let op = `M${f(ox(obs[0].ms))} ${f(y(obs[0].mean))}`;
    for (let i = 1; i < obs.length; i++) op += ` L${f(ox(obs[i].ms))} ${f(y(obs[i].mean))}`;
    s += `<path class="mg-observed" d="${op}"/>`;
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 105 tests (101 + 4). The pre-existing `overlayChart` tests that use `times: ["t0","t1","t2"]` must still pass — `domainOK` is false for them.

- [ ] **Step 5: Commit**

```bash
git add web/js/charts/compare.js web/test/compare.test.js
git commit -m "feat(charts): measured wind curve on the model-comparison overlay"
```

---

### Task 6: Comparator wiring — *aujourd'hui* only

**Files:**
- Modify: `web/js/cards/compareview.js` (whole file: `legend` at 23–27, `grid` at 29–37, `renderBody` at 40–66, `openCompareView` at 68–93)

**Interfaces:**
- Consumes: `fetchWindHistory` (Task 4), `observedSeries` (Task 2), `opts.observed` on `meteogram` (Task 3) and `overlayChart` (Task 5), `legend_observed` (Task 4).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the imports**

In `web/js/cards/compareview.js`:

```js
import { meteogram, bindMeteogramTooltip, observedSeries } from "../charts/meteogram.js";
import { fetchWindHistory } from "../sources/windhistory.js";
```

- [ ] **Step 2: Thread `observed` through the render helpers**

Replace `legend` (lines 23–27) with:

```js
function legend(series, lang, observed) {
  const models = series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${i}"></span>${escapeHTML(s.label)}</span>`
  ).join("");
  const real = observed
    ? `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--obs"></span>${t(lang, "legend_observed")}</span>`
    : "";
  return `<div class="cmp-legend">${models}${real}</div>`;
}
```

Replace `grid` (lines 29–37) with:

```js
function grid(series, lang, r, observed) {
  return `<div class="cmp-grid">` + series.map((s) => {
    const body = s.data
      ? `<div class="mg-wrap">${meteogram(trimTrailingNulls(sliceData(s.data, r.start, r.end)),
          { lang, range: r.key === "week" ? "7d" : "24h", nowTime: new Date().toISOString(), observed })}</div>`
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
    return `<figure class="cmp-cell"><figcaption>${escapeHTML(s.label)}</figcaption>${body}</figure>`;
  }).join("") + `</div>`;
}
```

Replace `renderBody`'s signature and body-building lines (lines 40–52) with:

```js
// Render overlay + legend + grid for one range (no refetch — slices in memory).
// The measured curve belongs to today only: on demain / 7 j it is dropped, and
// the charts' own domain filter would discard it anyway.
function renderBody(host, series, rangeKey, lang, allObserved) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[0];
  const body = host.querySelector(".cmp-body");
  if (!body) return;
  const observed = rangeKey === "today" ? allObserved : [];
  const lines = series.filter((s) => s.data).map((s) => {
    const w = sliceData(s.data, r.start, r.end);
    return { key: s.key, label: s.label, times: w.times, speed: w.speed };
  });
  body.innerHTML = (lines.length
    ? `<div class="cmp-overlay"><div class="mg-wrap">${overlayChart(lines, { lang, range: r.key, observed })}</div></div>${legend(series, lang, observed.length > 0)}`
    : `<p class="cmp-miss">${t(lang, "source_down")}</p>`) + grid(series, lang, r, observed);
```

Leave the rest of `renderBody` (the two tooltip-binding blocks) unchanged.

- [ ] **Step 3: Fetch the observations once, alongside the models**

In `openCompareView`, replace the two `let` declarations near the top:

```js
  let range = "today";
  let loaded = null;
  let observed = [];
```

Update the two `renderBody` call sites — the one in the tab click handler:

```js
    if (loaded) renderBody(host, loaded, range, lang, observed);
```

and the final `try` block:

```js
  try {
    // Both in flight at once; the measured curve is optional and never blocks
    // or fails the model grid.
    const [models, obs] = await Promise.all([
      fetchAllModels({ lat: settings.lat, lon: settings.lon, days: 7 }),
      settings.stationNid == null
        ? Promise.resolve([])
        : fetchWindHistory(settings.stationNid).then((d) => observedSeries(d.samples)).catch(() => []),
    ]);
    loaded = models;
    observed = obs;
    renderBody(host, loaded, range, lang, observed);
  } catch {
```

- [ ] **Step 4: Style the legend swatch**

In `web/css/compare.css`, alongside the existing `.cmp-swatch--N` rules, add:

```css
.cmp-swatch--obs { background: var(--now); }
```

> If the existing swatches are styled by a single rule with an `--N` suffix pattern, add this line directly after the last of them so the measured-wind key matches the curve's colour.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, 105 tests. No new tests here — this task is DOM wiring over already-tested pure functions, verified manually in Step 6.

- [ ] **Step 6: Verify in the browser**

Run: `npm run serve`, open the dashboard, tap **+ comparer**.

Expected:
- *aujourd'hui*: a green curve on the big overlay chart **and** on all six per-model charts, ending at the current time; a green `réel` key at the end of the legend.
- *demain* and *7 j*: no green curve anywhere, no `réel` key.
- Switching tabs back and forth does not refetch (watch the Network tab — one `windhistory` call for the whole session).

- [ ] **Step 7: Commit**

```bash
git add web/js/cards/compareview.js web/css/compare.css
git commit -m "feat(compare): measured wind curve on the aujourd'hui tab"
```

---

### Task 7: Demain replaces 7 j on the dashboard

**Files:**
- Modify: `web/js/cards/forecast.js` (header comment + `LONG_RANGE` at lines 14–19; `forecastTitleRow` at 22–30; `renderForecast`; `bindInteractions` range branch; `mountForecastCard`)
- Modify: `web/js/i18n.js`
- Modify: `web/test/windhistory.test.js` (title-row tests live next to the other forecast pure-function tests)

**Interfaces:**
- Consumes: `sliceData` from `web/js/charts/compare.js` (already exported).
- Produces: `state.range` is now `"24h" | "tomorrow"`.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/windhistory.test.js` (extend the forecast import to
`import { legendHTML, forecastTitleRow } from "../js/cards/forecast.js";`):

```js
test("forecastTitleRow offers demain, not 7 j", () => {
  const html = forecastTitleRow("fr", { chip: "AROME HD", range: "24h" });
  assert.ok(html.includes("demain"));
  assert.ok(!html.includes("7 j"), "the 7-day view left the dashboard");
  assert.match(html, /data-act="range" aria-pressed="false"/);
});

test("forecastTitleRow marks the range button pressed on the tomorrow view", () => {
  const html = forecastTitleRow("fr", { chip: "AROME HD", range: "tomorrow" });
  assert.match(html, /data-act="range" aria-pressed="true"/);
});

test("forecastTitleRow titles the card by range", () => {
  assert.ok(forecastTitleRow("fr", { chip: "X", range: "24h" }).includes("Prévision vent · 24 h"));
  assert.ok(forecastTitleRow("fr", { chip: "X", range: "tomorrow" }).includes("Prévision vent · demain"));
  assert.ok(forecastTitleRow("en", { chip: "X", range: "tomorrow" }).includes("Wind forecast · tomorrow"));
});

test("forecastTitleRow shows the picked model chip on both ranges", () => {
  // no more silent ECMWF swap: every model reaches 48 h
  assert.ok(forecastTitleRow("fr", { chip: "AROME HD", range: "tomorrow" }).includes("AROME HD"));
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/windhistory.test.js`
Expected: FAIL — the title row still renders `7 j`.

- [ ] **Step 3: Add the i18n keys**

In `web/js/i18n.js`, next to `seven_days` (which stays — the comparator's 7 j tab still uses it):

```js
  tomorrow_range:   { fr: "demain",                en: "tomorrow" },
```

and next to `forecast_title`:

```js
  forecast_title_tomorrow: { fr: "Prévision vent · demain", en: "Wind forecast · tomorrow" },
```

- [ ] **Step 4: Rewrite the range logic**

In `web/js/cards/forecast.js`, replace the header comment and `LONG_RANGE` (lines 14–19) with:

```js
// 24 h and demain both use the picked model: every model in COMPARE_MODELS
// reaches 48 h, so there is no horizon fallback here. A model that errors or
// returns no data still falls back to ECMWF — that is about source failure.
const hasData = (d) => Array.isArray(d.speed) && d.speed.some((v) => Number.isFinite(v));
```

Add `sliceData` to the compare import:

```js
import { COMPARE_MODELS } from "../sources/compare.js";
import { sliceData } from "../charts/compare.js";
```

Replace `forecastTitleRow` (lines 22–30) with:

```js
// Pure: the title row with model chip + control buttons. `chip` reflects the
// model actually used (set on the state by renderForecast).
export function forecastTitleRow(lang, { chip, range }) {
  const tomorrow = range === "tomorrow";
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, tomorrow ? "forecast_title_tomorrow" : "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="chip chip--btn" data-act="model" type="button">${chip ?? "AROME 1.3"}</button> ` +
      `<button class="linkbtn" data-act="compare">${t(lang, "compare")}</button> ` +
      `<button class="linkbtn" data-act="range" aria-pressed="${tomorrow}">${t(lang, "tomorrow_range")}</button>` +
    `</span></div>`;
}
```

Replace the opening of `renderForecast` (from `const is7d = ...` down to `if (!data) throw new Error("no forecast");`) with:

```js
  const tomorrow = state.range === "tomorrow";
  const chosen = state.settings.forecastModel || "arome_hd";
  const picked = COMPARE_MODELS.find((m) => m.key === chosen) || COMPARE_MODELS[0];
  state.chip = picked.label;
  const observedP = loadObserved(state);
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    // Demain fetches two days and keeps hours 24–48; AROME HD covers the full
    // 48 h with no gaps, so the picked model is always the one shown.
    const days = tomorrow ? 2 : 1;
    let data = await fetchForecast({ lat, lon, model: picked.model, days }).catch(() => null);
    if ((!data || !hasData(data)) && picked.model !== MODELS.ecmwf) {
      state.chip = "ECMWF";
      data = await fetchForecast({ lat, lon, model: MODELS.ecmwf, days });
    }
    if (!data) throw new Error("no forecast");
    if (tomorrow) data = sliceData(data, 24, 48);
```

Then update the chart options — `range` is always the 24-hour axis here, since demain is itself a 24-hour window:

```js
    state.data = data;
    const observed = await observedP;
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: "24h",
      lang,
      observed,
    });
```

Leave the two `mountCard` lines and the `catch` branch as they are.

- [ ] **Step 5: Update the toggle and the initial state**

In `bindInteractions`, replace the range branch:

```js
      if (act === "range") {
        state.range = state.range === "tomorrow" ? "24h" : "tomorrow";
        renderForecast(state);
      }
```

`mountForecastCard`'s initial `range: "24h"` is already correct — leave it.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 109 tests (105 + 4).

- [ ] **Step 7: Verify in the browser**

Run: `npm run serve`.

Expected:
- The forecast card's third button reads **demain**; tapping it underlines the button, retitles the card `Prévision vent · demain`, and shows tomorrow 00 h–23 h with hour ticks (not weekday ticks).
- The model chip keeps saying `AROME HD` on both ranges.
- The green measured curve is present on 24 h and **absent** on demain.
- The now-line is absent on demain.
- **+ comparer** still offers all three tabs including 7 j.

- [ ] **Step 8: Commit**

```bash
git add web/js/cards/forecast.js web/js/i18n.js web/test/windhistory.test.js
git commit -m "feat(forecast): demain replaces the 7-day view on the dashboard"
```

---

### Task 8: Rocks — "passe pas" and the collapsed pill

**Files:**
- Modify: `web/js/cards/rocks.js` (`statusLine` at 22–28 — deleted; `rowHTML` at 36–48)
- Modify: `web/js/i18n.js` (`rocks_dry`)
- Modify: `web/css/rocks.css` (`.rock-pill`, `.rock-name`)
- Create: `web/test/rocks.test.js`

**Interfaces:**
- Consumes: `rockStatusAt` / `thToClock` from `web/js/rocks/rocksafety.js` (unchanged).
- Produces: `rockPill(lang, st) -> string` — exported for testing, used only inside `rocks.js`.

- [ ] **Step 1: Write the failing tests**

Create `web/test/rocks.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { rockPill } from "../js/cards/rocks.js";

test("rockPill states passage and when it ends", () => {
  const html = rockPill("fr", { safe: true, crossingTh: 12.4 });
  assert.ok(html.includes("passe jusqu'à 12h24"));
  assert.ok(html.includes("rock-pill--clear"));
});

test("rockPill says passe pas, not découvert", () => {
  const html = rockPill("fr", { safe: false, crossingTh: 14.6 });
  assert.ok(html.includes("passe pas jusqu'à 14h36"));
  assert.ok(!html.includes("découvert"), "the rock drying is not the question");
  assert.ok(html.includes("rock-pill--foul"));
});

test("rockPill drops the clock when the state holds all day", () => {
  assert.ok(rockPill("fr", { safe: true, crossingTh: null }).includes(">passe<"));
  assert.ok(rockPill("fr", { safe: false, crossingTh: null }).includes(">passe pas<"));
});

test("rockPill translates to English", () => {
  assert.ok(rockPill("en", { safe: true, crossingTh: 12.4 }).includes("clear until 12h24"));
  assert.ok(rockPill("en", { safe: false, crossingTh: null }).includes(">no-go<"));
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test web/test/rocks.test.js`
Expected: FAIL — `does not provide an export named 'rockPill'`.

- [ ] **Step 3: Reword the dictionary**

In `web/js/i18n.js`:

```js
  rocks_dry:        { fr: "passe pas",             en: "no-go" },
```

- [ ] **Step 4: Collapse the two lines into the pill**

In `web/js/cards/rocks.js`, delete `statusLine` (lines 22–28) and replace it with:

```js
// Pure: the coloured pill, which is now the row's entire status. "passe jusqu'à
// 12h24" while the boat clears; "passe pas jusqu'à 14h37" while it doesn't. The
// clock is the next moment the state flips, and is dropped when it holds all day.
export function rockPill(lang, st) {
  const word = t(lang, st.safe ? "rocks_pass" : "rocks_dry");
  const clock = st.crossingTh != null ? thToClock(st.crossingTh) : null;
  const text = clock ? `${word} ${t(lang, "rocks_until")} ${clock}` : word;
  const cls = st.safe ? "rock-pill--clear" : "rock-pill--foul";
  return `<span class="rock-pill ${cls}">${text}</span>`;
}
```

Replace `rowHTML` (lines 36–48) with:

```js
function rowHTML(lang, rock, st) {
  return `<li class="rock-row" data-id="${escapeHTML(rock.id)}">` +
    `<div class="rock-main"><div class="rock-name">${escapeHTML(rock.name)}</div></div>` +
    rockPill(lang, st) +
    rowActions(lang, rock.id) +
    `</li>`;
}
```

Leave the port-fetch-failed branch in `renderRocks` exactly as it is: it keeps its `.rock-status` `—` and gets **no pill**, because without tide data no colour claim can honestly be made.

- [ ] **Step 5: Restyle the pill**

In `web/css/rocks.css`, replace the `.rock-pill` rule:

```css
.rock-pill {
  flex-shrink: 0; padding: 3px 10px; border-radius: 999px; white-space: nowrap;
  font-size: 12px; font-weight: 600;
}
```

(`text-transform: uppercase` and `letter-spacing` are gone — shouty and wide at ~24 characters.)

And let a long name give way rather than squeeze the pill:

```css
.rock-name {
  color: var(--text-primary); font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 113 tests (109 + 4).

- [ ] **Step 7: Commit**

```bash
git add web/js/cards/rocks.js web/js/i18n.js web/css/rocks.css web/test/rocks.test.js
git commit -m "feat(rocks): passe pas replaces découvert, pill carries the whole status"
```

---

### Task 9: Draught chip on the Cailloux card

**Files:**
- Create: `web/js/cards/draftpicker.js`
- Modify: `web/js/cards/rocks.js` (`titleRow` at 14–20 and its three call sites in `renderRocks`; `bindRocks`)
- Modify: `web/js/cards/settingspage.js` (remove the draught field at line 36 and its listener)
- Modify: `web/css/settings.css` (remove `.set-field` and `.set-draft`, lines 39–47)
- Modify: `web/css/rocks.css` (add `.rf-draft` to the shared input rule)
- Modify: `web/test/rocks.test.js`

**Interfaces:**
- Consumes: `saveSetting` from `web/js/settings.js`; the `rf-*` styles from `web/css/rocks.css`; the `settings_draft` i18n key, which this task repurposes as the picker's title.
- Produces:
  - `draftLabel(lang, draft) -> string` — exported from `rocks.js` for testing.
  - `openDraftPicker(settings, onPick: (metres: number) => void) -> void`

- [ ] **Step 1: Write the failing test**

Append to `web/test/rocks.test.js` (extend the import to `import { rockPill, draftLabel } from "../js/cards/rocks.js";`):

```js
test("draftLabel uses a decimal comma in French and a point in English", () => {
  assert.equal(draftLabel("fr", 1.5), "1,5 m");
  assert.equal(draftLabel("en", 1.5), "1.5 m");
  assert.equal(draftLabel("fr", 2), "2,0 m");
});

test("draftLabel survives a corrupt stored value", () => {
  assert.equal(draftLabel("fr", undefined), "0,0 m");
  assert.equal(draftLabel("fr", "abc"), "0,0 m");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test web/test/rocks.test.js`
Expected: FAIL — `does not provide an export named 'draftLabel'`.

- [ ] **Step 3: Build the picker**

Create `web/js/cards/draftpicker.js`:

```js
import { t } from "../i18n.js";

// Small sheet to set the boat's draught, opened from the chip in the Cailloux
// title row. Reuses the rock form's rf-* styles so the two sheets match.
// onPick(metres) fires only for a valid, non-negative number; anything else
// leaves the sheet open and saves nothing.
export function openDraftPicker(settings, onPick) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.className = "rf-modal";
  host.innerHTML =
    `<div class="rf-panel">` +
      `<div class="rf-head"><span class="rf-title">${t(lang, "settings_draft")}</span>` +
        `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
      `<label class="rf-field">` +
        `<input class="rf-draft" type="number" inputmode="decimal" step="0.1" min="0" value="${settings.draft}" />` +
      `</label>` +
      `<button class="rf-save" data-act="save" type="button">${t(lang, "rocks_update")}</button>` +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);
  host.querySelector('[data-act="save"]').addEventListener("click", () => {
    const v = parseFloat(host.querySelector(".rf-draft").value);
    if (!Number.isFinite(v) || v < 0) return;
    close();
    onPick(v);
  });
}
```

- [ ] **Step 4: Put the chip in the card**

In `web/js/cards/rocks.js`, add the import:

```js
import { openDraftPicker } from "./draftpicker.js";
```

Add above `titleRow`:

```js
// Pure: the chip's label — "1,5 m" in French, "1.5 m" in English. A corrupt
// stored value reads 0,0 m rather than NaN.
export function draftLabel(lang, draft) {
  const n = Number(draft);
  const v = (Number.isFinite(n) ? n : 0).toFixed(1);
  return `${lang === "fr" ? v.replace(".", ",") : v} m`;
}
```

Replace `titleRow` (lines 14–20) with:

```js
// The draught chip shows the current value and opens the picker — same pattern
// as the model chip on the forecast card. It lives here, not in Réglages,
// because it is only ever meaningful next to the rocks it gates.
function titleRow(lang, draft) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "rocks_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="chip chip--btn" data-act="draft" type="button">${draftLabel(lang, draft)}</button> ` +
      `<button class="rock-add" data-act="add" type="button" aria-label="+">＋</button>` +
    `</span></div>`;
}
```

In `renderRocks`, update all **four** `titleRow(lang)` call sites (the empty-list mount, the skeleton mount, the success mount, and the error mount) to `titleRow(lang, state.settings.draft)`.

In `bindRocks`, add a branch to the click handler, before the `add` branch:

```js
      if (act === "draft") {
        openDraftPicker(state.settings, (v) => {
          state.settings.draft = v;
          saveSetting("draft", v);
          renderRocks(state);
        });
        return;
      }
```

- [ ] **Step 5: Take the draught out of Réglages**

In `web/js/cards/settingspage.js`, delete this from the `host.innerHTML` template (lines 36–38):

```js
      `<label class="set-field">${t(lang, "settings_draft")}` +
        `<input class="set-draft" type="number" inputmode="decimal" step="0.1" min="0" value="${settings.draft}" />` +
      `</label>` +
```

and delete the listener block:

```js
  // Draft.
  const draftInput = host.querySelector(".set-draft");
  draftInput.addEventListener("change", () => { ... });
```

Update the file's header comment — it currently promises three things, and now describes two:

```js
// Full-screen settings overlay. ☰ opens it; ← (or backdrop) closes it and calls
// onClose(). Toggles persist cardHidden; long-press-drag on the handle persists
// cardOrder. Both also mutate `settings` in place so the caller's live settings
// object stays current. (Draught moved to the Cailloux card — see draftpicker.js.)
```

In `web/css/settings.css`, delete the now-unused `.set-field` and `.set-draft` rules (lines 39–47).

- [ ] **Step 6: Style the picker's input**

In `web/css/rocks.css`, add `.rf-draft` to the shared input rule so it matches the rock form's fields:

```css
.rf-name, .rf-height, .rf-port, .rf-draft {
  padding: 10px 12px; font-size: 16px; background: var(--page-bg); color: var(--text-primary);
  border: 1px solid var(--card-border); border-radius: 8px; }
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 115 tests (113 + 2).

- [ ] **Step 8: Verify in the browser**

Run: `npm run serve`. Enable the Cailloux card in Réglages if it is hidden (`cardHidden` defaults to `["rocks"]`), and add a rock.

Expected:
- The Cailloux title row shows a chip reading `1,5 m` next to ＋.
- Tapping it opens a sheet titled `Mon tirant d'eau (m)` with a number field.
- Saving a larger draught immediately re-renders the list with recomputed statuses (a rock that read `passe` may flip to `passe pas`).
- Entering nothing, or a negative value, and tapping Enregistrer leaves the sheet open and changes nothing.
- Réglages no longer has a draught field.
- Reloading the page keeps the new draught.

- [ ] **Step 9: Commit**

```bash
git add web/js/cards/draftpicker.js web/js/cards/rocks.js web/js/cards/settingspage.js web/css/rocks.css web/css/settings.css web/test/rocks.test.js
git commit -m "feat(rocks): draught chip on the card, out of Réglages"
```

---

### Task 10: Full verification

**Files:** none modified — this task only runs and reports.

- [ ] **Step 1: Run both suites**

```bash
npm test
node --test worker/test/*.test.js
```

Expected: 115 web tests passing, 34 worker tests passing, 0 failures. If either count is lower than the baseline (87 / 28), a test was deleted rather than updated — find out why before continuing.

- [ ] **Step 2: Deploy the Worker**

The observed curve is dead in production until the new route ships.

```bash
npx wrangler deploy --config worker/wrangler.toml
```

Then confirm against the deployed URL (the value of `WORKER_URL` in `web/config.js`):

```bash
curl -s "<WORKER_URL>/api/windhistory?nid=6" | head -c 120
```

Expected: `{"nid":6,"samples":[{"ts":...`

- [ ] **Step 3: Walk the whole feature in the browser**

Run `npm run serve` and check every row:

| Check | Expected |
|---|---|
| Dashboard, 24 h | green curve from 00:00 to the now-bar; `réel` in the legend |
| Dashboard, demain | no green curve, no `réel` key, no now-bar, title `Prévision vent · demain` |
| Dashboard, model chip | says the picked model on both ranges — never a surprise `ECMWF` |
| Comparator, aujourd'hui | green on the overlay **and** all six cells; `réel` in the legend |
| Comparator, demain / 7 j | no green anywhere |
| Location far from any station | change the place to e.g. Marseille: charts render clean, no `réel` key, no console error |
| Cailloux | pill reads `passe jusqu'à …` / `passe pas jusqu'à …`; no second status line |
| Cailloux chip | shows the draught; changing it recomputes every row |
| Réglages | no draught field; card toggles and drag-reorder still work |
| Dark mode | the green curve is visible against the navy panel in both themes |

- [ ] **Step 4: Commit any fixes, then open the PR**

```bash
git push -u origin feat/qol-realwind-tomorrow-rocks
gh pr create --title "QoL: measured wind curve, demain, rocks polish" --body "$(cat <<'EOF'
Three quality-of-life changes.

**Measured wind curve.** The day's real wind from the nearest windmorbihan
anemometer, drawn in green over the forecast on the dashboard's 24 h view and
on the comparator's *aujourd'hui* tab (overlay + all six model charts). New
Worker route `/api/windhistory`. The curve is mapped by timestamp, not array
index, because observations are irregular 10-minute samples against an hourly
forecast. Outside the 45 km station coverage there is simply no curve.

**Demain replaces 7 j** on the dashboard; 7 j stays in the comparator where it
belongs. This also deletes the `LONG_RANGE` / ECMWF-horizon fallback — every
model reaches 48 h, so the chip now always names the model actually used.

**Cailloux.** "Découvert" becomes "passe pas": the question is whether *your*
boat gets through, not whether the rock is showing. The duplicated status line
collapses into the coloured pill. Tirant d'eau moves out of Réglages into a
chip on the card, next to the rocks it gates.

Requires `wrangler deploy` for the new Worker route.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| A.1 upstream source / `time_frame=144` | 1 |
| A.2 worker parser + route | 1 |
| A.3 client source | 4 |
| A.4 `observedSeries` | 2 |
| A.5 `meteogram` `opts.observed`, `computeYMax` | 2, 3 |
| A.6 styling | 3 (chart), 6 (legend swatch) |
| A.7 where the curve appears | 4 (dashboard), 6 (comparator), 7 (demain excluded) |
| A.8 wiring | 4, 6 |
| A.9 legend + `legend_observed` | 4 (dashboard), 6 (comparator) |
| A.10 degradation | 4 (`loadObserved` catch), 6 (`.catch(() => [])`), 3 (`domainOK`), 10 Step 3 (far-location check) |
| B.1 tomorrow slice | 7 |
| B.2 `LONG_RANGE` deleted | 7 |
| B.3 labels, `seven_days` kept | 7 |
| B.4 axis range `"24h"` | 7 |
| C.1 `rocks_dry` reworded | 8 |
| C.2 pill collapse + CSS | 8 |
| C.3 draught chip, picker, removal from Réglages | 9 |
| Testing section | tests in 1–5, 7–9; manual matrix in 10 |

No gaps.

**Placeholder scan:** every code step carries complete code; every command carries its expected output. The one place the spec's testing section could not be honoured mechanically — a route test for `index.js`, which needs Cloudflare's `caches.default` — is replaced by an explicit `wrangler dev` + `curl` verification in Task 1 Step 6, not by a hand-wave.

**Type consistency:** `observedSeries` returns `{ms, mean}` in Task 2 and is consumed under that exact shape by `opts.observed` in Tasks 3, 5, 6 and 7. `parseWindHistory` returns `{samples}` in Task 1 and is destructured as `{ samples }` in Tasks 4 and 6. `computeYMax(gusts, observed)` is defined in Task 2 and called with two arguments in Tasks 3 and 5. `rockPill(lang, st)` and `draftLabel(lang, draft)` are defined and consumed in Tasks 8 and 9 under those names. `state.range` is `"24h" | "tomorrow"` from Task 7 onward and is read by `loadObserved` (Task 4), which checks `!== "24h"` — correct in both the pre- and post-Task-7 worlds.

# Glénans Dashboard — Phase 2: Wind Forecast Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forecast card's skeleton with a live 24 h AROME-HD wind meteogram fetched directly from Open-Meteo, with a "7 j" week expand, a "+ comparer" second-model overlay, and a tap tooltip — matching the approved mockup.

**Architecture:** A pure `sources/openmeteo.js` adapter (URL builder + response normaliser + thin `fetch` wrapper, called directly from the browser — Open-Meteo is CORS-enabled and keyless). A pure `charts/meteogram.js` that emits an inline-SVG string using CSS **classes** (not inline hex), so one SVG is theme-correct in light and dark via the design tokens. A `cards/forecast.js` module owns fetch → render → interaction and is wired into `app.js` in place of the static skeleton. Phase-1 primitives (`mountCard`, `skeletonHTML`, `errorHTML`, `t`, `settings`) are reused.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. Node `>=20` `node --test` for pure logic; DOM/interaction verified by a headless smoke (stubbed `fetch`/DOM) and by running the app.

## Global Constraints

- No build step; no runtime dependencies in `/web`. (Phase-1 constraint, unchanged.)
- Open-Meteo is called **directly from the browser** (CORS-enabled, no key) — NOT via the Worker. (spec §3.1)
- Endpoint: `https://api.open-meteo.com/v1/forecast`. Default model **AROME France HD** = `meteofrance_arome_france_hd`. Comparison models: `meteofrance_arpege_europe`, `icon_eu`, `ecmwf_ifs025`, `gfs_global`. (spec §3.1)
- Hourly variables (exact, in this order): `wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,cloud_cover`. Units `wind_speed_unit=kn`. `timezone=Europe/Paris`. (spec §3.1)
- Default display: today, full 24 h. "7 j" switches the x-domain to the full week with day labels. "+ comparer" overlays a second model as a thin solid line. (spec §3.1)
- Meteogram (inline SVG, full card width, ~120px tall): mean wind = filled area (~55% opacity) + 2px line; gusts = dashed line (dash `4 3`, 1.6px) above; horizontal gridlines at 10/20/30 kn with left-edge labels; **y-scale auto-expands if gusts exceed 32 kn**; a row of small direction arrows (~every 2 h) pointing **downwind** (rotation = direction + 180°, up = north); x-axis labels every 6 h (`0h/6h/12h/18h/24h`) in 24 h mode, day labels in 7 d mode; a vertical "now" line at the current time; tap shows a tooltip with hour, mean, gusts, direction; "+ comparer" overlay is a distinct thin line. (spec §6 / brief card 3)
- Colours come only from CSS custom properties (tokens). This phase ADDS three wind tokens (`--area`, `--line`, `--compare`) to `tokens.css`; the meteogram references them via classes. No hardcoded hex in `meteogram.css` or component JS. Exact values — LIGHT: `--area:#B5D4F4`, `--line:#0C447C`, `--compare:#7F77DD`; DARK: `--area:#0C447C`, `--line:#85B7EB`, `--compare:#7F77DD`. (spec §6 palette)
- Cardinal directions use the international set `N,NE,E,SE,S,SW,W,NW` (mockup shows "W · 270°"). (brief card 4 mockup)
- The forecast card loads and fails independently: skeleton while loading, `errorHTML(lang, "https://open-meteo.com/")` on failure — never throw out of the card. (spec §4)
- This phase feeds only numeric/enumerated data into the DOM (no scraped or user text), so no HTML-escaping helper is introduced here; it lands with the BMS/geocoding phase (carried-forward item).

---

## File structure introduced/changed in this phase

```
web/js/
  sources/openmeteo.js     # NEW: MODELS, buildForecastURL(), normalizeForecast(), fetchForecast()
  charts/meteogram.js      # NEW: computeYMax(), degToCardinal(), tooltipAt(), meteogram()
  cards/forecast.js        # NEW: forecastTitleRow(), legendHTML(), renderForecast(), mountForecastCard()
  app.js                   # MODIFY: mount the forecast card instead of the static skeleton
web/css/
  tokens.css               # MODIFY: add --area/--line/--compare (light + dark)
  meteogram.css            # NEW: .mg-* + legend styling via tokens
web/index.html             # MODIFY: <link> meteogram.css
web/test/
  openmeteo.test.js        # NEW
  meteogram.test.js        # NEW
```

---

## Task 1: Open-Meteo adapter (URL builder + normaliser + fetch)

**Files:**
- Create: `web/js/sources/openmeteo.js`
- Test: `web/test/openmeteo.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MODELS` — `{ arome, arpege, icon, ecmwf, gfs }` mapping to the exact Open-Meteo identifier strings.
  - `buildForecastURL({ lat, lon, model = MODELS.arome, days = 1 })` → string (pure).
  - `normalizeForecast(json)` → `{ times:[ISO], speed:[], gust:[], dir:[], precip:[], cloud:[] }` (pure); throws on a payload with no `hourly.time`.
  - `fetchForecast(opts)` → `Promise<normalized>` (uses global `fetch`; throws on non-OK HTTP).

- [ ] **Step 1: Write the failing test**

Create `web/test/openmeteo.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/openmeteo.test.js`
Expected: FAIL — cannot import `../js/sources/openmeteo.js`.

- [ ] **Step 3: Write the implementation**

Create `web/js/sources/openmeteo.js`:

```js
// Open-Meteo wind forecast — called directly from the browser (CORS, no key).
const HOURLY = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "precipitation", "cloud_cover"];

export const MODELS = {
  arome:  "meteofrance_arome_france_hd",
  arpege: "meteofrance_arpege_europe",
  icon:   "icon_eu",
  ecmwf:  "ecmwf_ifs025",
  gfs:    "gfs_global",
};

// Pure: build the request URL. URLSearchParams handles encoding.
export function buildForecastURL({ lat, lon, model = MODELS.arome, days = 1 }) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY.join(","),
    models: model,
    wind_speed_unit: "kn",
    timezone: "Europe/Paris",
    forecast_days: String(days),
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

// Pure: flatten Open-Meteo's hourly block into parallel arrays.
export function normalizeForecast(json) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error("open-meteo: missing hourly.time");
  return {
    times:  h.time,
    speed:  h.wind_speed_10m ?? [],
    gust:   h.wind_gusts_10m ?? [],
    dir:    h.wind_direction_10m ?? [],
    precip: h.precipitation ?? [],
    cloud:  h.cloud_cover ?? [],
  };
}

// Thin fetch wrapper (browser/global fetch). Throws on HTTP error.
export async function fetchForecast(opts) {
  const res = await fetch(buildForecastURL(opts));
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  return normalizeForecast(await res.json());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/openmeteo.test.js`
Expected: PASS — `# pass 4`.

- [ ] **Step 5: Live URL sanity check (integration, network-permitting)**

Run:
```bash
node -e "import('./web/js/sources/openmeteo.js').then(async m => { const n = await m.fetchForecast({lat:47.716, lon:-3.95}); console.log('hours', n.times.length, 'first speed', n.speed[0], typeof n.speed[0]); })"
```
Expected: prints `hours 24` (or 25), a numeric `first speed`, and `number`. This confirms the built URL + params are accepted by the live API and normalisation works end-to-end. If the environment has no network, note that in the report and rely on the unit tests.

- [ ] **Step 6: Run the full suite, then commit**

Run: `npm test` → all green (should be 18 prior + 4 new = 22).
```bash
git add web/js/sources/openmeteo.js web/test/openmeteo.test.js
git commit -m "feat(forecast): Open-Meteo adapter — URL builder, normaliser, fetch"
```

---

## Task 2: Meteogram helpers (y-scale, cardinal, tooltip data)

**Files:**
- Create: `web/js/charts/meteogram.js` (helpers only in this task; the SVG builder is added in Task 3)
- Test: `web/test/meteogram.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `computeYMax(gusts)` → number (pure): `35` baseline; when `max(gusts) > 32`, the next multiple of 10 at or above `max + 3`.
  - `degToCardinal(deg)` → one of `N,NE,E,SE,S,SW,W,NW` (pure).
  - `tooltipAt(data, i)` → `{ time, mean, gust, dir, cardinal }` (pure), where `data` is the normalised forecast.

- [ ] **Step 1: Write the failing test**

Create `web/test/meteogram.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/meteogram.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `web/js/charts/meteogram.js`:

```js
// Pure helpers for the wind meteogram. (The SVG builder is added in Task 3.)

// Top of the y-axis in knots. Baseline 35 keeps the 10/20/30 gridlines tidy;
// expand past 32kn gusts to the next multiple of 10 at/above max+3 for headroom.
export function computeYMax(gusts) {
  const max = gusts.length ? Math.max(...gusts) : 0;
  if (max > 32) return Math.ceil((max + 3) / 10) * 10;
  return 35;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function degToCardinal(deg) {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// One hour's values for the tap tooltip.
export function tooltipAt(data, i) {
  return {
    time: data.times[i],
    mean: data.speed[i],
    gust: data.gust[i],
    dir: data.dir[i],
    cardinal: degToCardinal(data.dir[i]),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/meteogram.test.js`
Expected: PASS — `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add web/js/charts/meteogram.js web/test/meteogram.test.js
git commit -m "feat(forecast): meteogram helpers — computeYMax, degToCardinal, tooltipAt"
```

---

## Task 3: Meteogram SVG builder

**Files:**
- Modify: `web/js/charts/meteogram.js` (add the `meteogram()` export)
- Modify: `web/test/meteogram.test.js` (add builder tests)

**Interfaces:**
- Consumes: `computeYMax` (same file, Task 2).
- Produces: `meteogram(data, opts = {})` → SVG string (pure). `data` = normalised forecast (`times/speed/gust/dir`). `opts`:
  - `nowTime` — ISO string / Date for the "now" line (omit to skip it).
  - `range` — `"24h"` (default) or `"7d"` (day labels vs `Nh` labels).
  - `lang` — `"fr"`/`"en"` for 7 d weekday labels.
  - `compare` — `{ speed:[], times:[] }` to draw a second mean line (class `mg-compare`).
  - `width`/`height`/`ariaLabel` — optional.
  All colours/dashes come from CSS classes (`mg-area/line/gust/now/grid/axis/arrow/compare`), styled in Task 4 — the builder emits **no** inline colours.

- [ ] **Step 1: Write the failing test (append to `web/test/meteogram.test.js`)**

```js
import { meteogram } from "../js/charts/meteogram.js";

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test web/test/meteogram.test.js`
Expected: FAIL — `meteogram` is not exported yet.

- [ ] **Step 3: Add the implementation (append to `web/js/charts/meteogram.js`)**

```js
// Inline-SVG meteogram. Colours/dashes are supplied by CSS classes (see
// meteogram.css); this function emits geometry + classes only.
export function meteogram(data, opts = {}) {
  const W = opts.width ?? 300, H = opts.height ?? 118;
  const L = 26, R = 8, B = 34, TOP = 10;
  const { times, speed, gust, dir } = data;
  const N = times.length;
  const ym = computeYMax(gust);
  const plotW = W - L - R, plotH = H - B - TOP;
  const baseY = H - B;
  const x = (i) => L + (N <= 1 ? 0 : (i * plotW) / (N - 1));
  const y = (v) => TOP + plotH * (1 - v / ym);
  const f = (n) => n.toFixed(1);

  let line = `M${f(x(0))} ${f(y(speed[0]))}`;
  for (let i = 1; i < N; i++) line += ` L${f(x(i))} ${f(y(speed[i]))}`;
  const area = `${line} L${f(x(N - 1))} ${baseY} L${f(x(0))} ${baseY} Z`;

  let gustP = `M${f(x(0))} ${f(y(gust[0]))}`;
  for (let i = 1; i < N; i++) gustP += ` L${f(x(i))} ${f(y(gust[i]))}`;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="${opts.ariaLabel ?? "Prévision de vent"}" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:block">`;

  for (const v of [10, 20, 30]) {
    if (v > ym) continue;
    s += `<line class="mg-grid" x1="${L}" y1="${f(y(v))}" x2="${W - R}" y2="${f(y(v))}"/>`;
    s += `<text class="mg-axis" x="${L - 4}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`;
  }

  s += `<path class="mg-area" d="${area}"/>`;
  s += `<path class="mg-line" d="${line}"/>`;
  s += `<path class="mg-gust" d="${gustP}"/>`;

  if (opts.compare && Array.isArray(opts.compare.speed) && opts.compare.speed.length) {
    const cs = opts.compare.speed, cn = cs.length;
    const cx = (i) => L + (cn <= 1 ? 0 : (i * plotW) / (cn - 1));
    let cp = `M${f(cx(0))} ${f(y(cs[0]))}`;
    for (let i = 1; i < cn; i++) cp += ` L${f(cx(i))} ${f(y(cs[i]))}`;
    s += `<path class="mg-compare" d="${cp}"/>`;
  }

  if (opts.nowTime != null) {
    const now = new Date(opts.nowTime).getTime();
    const t0 = new Date(times[0]).getTime();
    const tN = new Date(times[N - 1]).getTime();
    if (!Number.isNaN(now) && tN > t0) {
      const frac = (now - t0) / (tN - t0);
      if (frac >= 0 && frac <= 1) {
        const xn = L + frac * plotW;
        s += `<line class="mg-now" x1="${f(xn)}" y1="${TOP}" x2="${f(xn)}" y2="${baseY + 2}"/>`;
      }
    }
  }

  const arrowStep = Math.max(1, Math.round(N / 12));
  for (let i = 0; i < N; i += arrowStep) {
    const rot = (((dir[i] ?? 0) + 180) % 360);
    s += `<g class="mg-arrow" transform="translate(${f(x(i))},${H - 22}) rotate(${rot})">` +
      `<path d="M0 -5 L3.4 4 L0 2 L-3.4 4 Z"/></g>`;
  }

  const is7d = opts.range === "7d";
  for (let i = 0; i < N; i++) {
    const hh = Number(times[i].slice(11, 13));
    if (is7d) {
      if (hh === 0) {
        const wd = new Date(times[i]).toLocaleDateString(
          opts.lang === "en" ? "en-GB" : "fr-FR", { weekday: "short" });
        s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 3}" text-anchor="middle">${wd}</text>`;
      }
    } else if (hh % 6 === 0) {
      s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 3}" text-anchor="middle">${hh}h</text>`;
    }
  }

  return s + `</svg>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test web/test/meteogram.test.js`
Expected: PASS — `# pass 10` (4 helper + 6 builder).

- [ ] **Step 5: Commit**

```bash
git add web/js/charts/meteogram.js web/test/meteogram.test.js
git commit -m "feat(forecast): inline-SVG meteogram builder (area/line/gusts/arrows/now/compare)"
```

---

## Task 4: Meteogram theme CSS + wind tokens

**Files:**
- Modify: `web/css/tokens.css` (add `--area`, `--line`, `--compare` to both blocks)
- Create: `web/css/meteogram.css`
- Modify: `web/index.html` (link `meteogram.css` after `layout.css`)

**Interfaces:**
- Produces: token-driven styling for the `mg-*` classes and the legend. No test (CSS); verified by serving + visual check in Task 6.

- [ ] **Step 1: Add wind tokens to `web/css/tokens.css`**

In the LIGHT `:root` block, after the `--now:` line, add:
```css
  --area: #B5D4F4;
  --line: #0C447C;
  --compare: #7F77DD;
```
In the `:root[data-theme="dark"]` block, after its `--now:` line, add:
```css
  --area: #0C447C;
  --line: #85B7EB;
  --compare: #7F77DD;
```

- [ ] **Step 2: Create `web/css/meteogram.css`**

```css
/* Meteogram + legend styling. All colour via tokens (tokens.css). */
.mg-grid { stroke: var(--grid); stroke-width: 1; }
.mg-axis { fill: var(--axis-label); font-size: 11px; }
.mg-area { fill: var(--area); opacity: 0.55; }
.mg-line { fill: none; stroke: var(--line); stroke-width: 2; }
.mg-gust { fill: none; stroke: var(--gust); stroke-width: 1.6; stroke-dasharray: 4 3; }
.mg-now  { stroke: var(--now); stroke-width: 1.6; }
.mg-arrow path { fill: var(--axis-label); }
.mg-compare { fill: none; stroke: var(--compare); stroke-width: 1.4; }

/* controls row (model chip + text buttons) */
.card__controls { font-size: 11px; }
.chip { background: var(--chip-bg); color: var(--chip-text); padding: 2px 8px; border-radius: 9px; }
.linkbtn {
  background: transparent; border: none; cursor: pointer; font: inherit;
  color: var(--accent); padding: 2px 4px; min-height: 40px;
}
.linkbtn[aria-pressed="true"] { text-decoration: underline; }

/* legend under the chart */
.mg-legend { font-size: 11px; color: var(--text-secondary); padding: 2px 4px 0; }
.mg-legend .leg-mean { color: var(--line); }
.mg-legend .leg-gust { color: var(--gust); }
.mg-legend .leg-now  { color: var(--now); }
.mg-legend .leg-cmp  { color: var(--compare); }

/* tap tooltip */
.mg-wrap { position: relative; }
.mg-tip {
  position: absolute; pointer-events: none; transform: transl(-50%, -100%);
  background: var(--card-bg); border: 0.5px solid var(--card-border);
  border-radius: 6px; padding: 4px 6px; font-size: 11px; color: var(--text-primary);
  white-space: nowrap;
}
:root[data-theme="dark"] .mg-tip { background: var(--navy-800); border-color: var(--navy-600); }
```
(Note: the `.mg-tip` transform line has a deliberate exact value — use `translate(-50%, -100%)`; correct it to `translate` if reproducing.)

- [ ] **Step 3: Link `meteogram.css` in `web/index.html`**

Immediately after the existing `<link rel="stylesheet" href="./css/layout.css" />` line, add:
```html
  <link rel="stylesheet" href="./css/meteogram.css" />
```

- [ ] **Step 4: Verify it serves and tokens resolve**

Run: `npm run serve` then in another shell:
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/css/meteogram.css
curl -s http://localhost:5173/css/tokens.css | grep -c -- "--compare"
```
Expected: `200 text/css; charset=utf-8`, and `2` (compare token in both blocks). Stop the server.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` (22/22 — unchanged; CSS adds no tests).
```bash
git add web/css/tokens.css web/css/meteogram.css web/index.html
git commit -m "feat(forecast): wind tokens + meteogram/legend theme CSS"
```

---

## Task 5: Forecast card — fetch, render, loading/error + app wiring

**Files:**
- Create: `web/js/cards/forecast.js`
- Modify: `web/js/app.js`

**Interfaces:**
- Consumes: `fetchForecast, MODELS` (Task 1); `meteogram` (Task 3); `t` (i18n); `mountCard, skeletonHTML, errorHTML` (Phase 1 card.js); `loadSettings` (settings).
- Produces:
  - `forecastTitleRow(lang, { range, comparing })` → string (pure): title + `AROME 1.3` chip + `data-act="compare"` and `data-act="range"` link buttons with `aria-pressed`.
  - `legendHTML(lang, comparing)` → string (pure): `━ vent  ┄ rafales  │ maintenant` (+ compare model when comparing).
  - `renderForecast(state)` → `Promise<void>` (DOM): fetch for `state.settings` + `state.range`/`state.comparing`, mount title + meteogram (fade-in) + legend; on error mount title + `errorHTML`.
  - `mountForecastCard(settings)` (DOM): create the card's local `state`, render once, and return an object `{ state, refresh, onControlClick }` used by `app.js` and Task 6.

  Card `state` shape: `{ settings, range: "24h", comparing: false, compareModel: MODELS.arpege, data: null, compareData: null }`.

- [ ] **Step 1: Write `web/js/cards/forecast.js`**

```js
import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { meteogram } from "../charts/meteogram.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-forecast";
const SOURCE = "https://open-meteo.com/";

// Pure: the title row with chip + control buttons.
export function forecastTitleRow(lang, { range, comparing }) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<span class="chip">AROME 1.3</span> ` +
      `<button class="linkbtn" data-act="compare" aria-pressed="${comparing}">${t(lang, "compare")}</button> ` +
      `<button class="linkbtn" data-act="range" aria-pressed="${range === "7d"}">${t(lang, "seven_days")}</button>` +
    `</span></div>`;
}

// Pure: the legend line under the chart.
export function legendHTML(lang, comparing) {
  const cmp = comparing ? `&nbsp;&nbsp;<span class="leg-cmp">━ ARPEGE</span>` : "";
  return `<div class="mg-legend">` +
    `<span class="leg-mean">━</span> ${t(lang, "legend_mean") ?? "vent"}` +
    `&nbsp;&nbsp;<span class="leg-gust">┄</span> ${t(lang, "legend_gust") ?? "rafales"}` +
    `&nbsp;&nbsp;<span class="leg-now">│</span> ${t(lang, "legend_now") ?? "maintenant"}${cmp}</div>`;
}

function bodyHTML(lang, state, svg) {
  return forecastTitleRow(lang, state) +
    `<div class="mg-wrap">${svg}</div>` +
    legendHTML(lang, state.comparing);
}

// DOM: fetch + render (or error). Never throws out of the card.
export async function renderForecast(state) {
  const { lang } = state.settings;
  // loading: keep the title + a chart skeleton
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    const days = state.range === "7d" ? 7 : 1;
    state.data = await fetchForecast({
      lat: state.settings.lat, lon: state.settings.lon, model: MODELS.arome, days,
    });
    state.compareData = null;
    if (state.comparing) {
      state.compareData = await fetchForecast({
        lat: state.settings.lat, lon: state.settings.lon, model: state.compareModel, days,
      });
    }
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: state.range,
      lang,
      compare: state.compareData
        ? { times: state.compareData.times, speed: state.compareData.speed }
        : undefined,
    });
    mountCard(CARD_ID, bodyHTML(lang, state, svg), { fade: true });
  } catch {
    mountCard(CARD_ID, forecastTitleRow(lang, state) + errorHTML(lang, SOURCE));
  }
}

// DOM: create state, render once, return handle for app + interactions.
export function mountForecastCard(settings) {
  const state = {
    settings,
    range: "24h",
    comparing: false,
    compareModel: MODELS.arpege,
    data: null,
    compareData: null,
  };
  renderForecast(state);
  return { state, refresh: () => renderForecast(state) };
}
```

- [ ] **Step 2: Add the three legend i18n keys to `web/js/i18n.js`**

In `DICT`, add (keeping the existing formatting):
```js
  legend_mean: { fr: "vent",       en: "wind" },
  legend_gust: { fr: "rafales",    en: "gusts" },
  legend_now:  { fr: "maintenant", en: "now" },
```

- [ ] **Step 3: Wire the card into `web/js/app.js`**

Replace the forecast line inside `renderSkeletons()`:
```js
  mountCard("card-forecast", cardTitleRow(lang, "forecast_title") + skeletonHTML(1, true));
```
with nothing (remove that one line — the forecast card now owns its own mount). Then:

- Add an import at the top of `app.js`:
```js
import { mountForecastCard } from "./cards/forecast.js";
```
- Add a module-scope handle near `const state = {...}`:
```js
let forecastCard = null;
```
- In `renderAll()`, after `renderSkeletons()`, add:
```js
  forecastCard = mountForecastCard(state.settings);
```
- In the `btn-refresh` click handler, replace `renderAll` with a function that re-stamps the header and refreshes data:
```js
  document.getElementById("btn-refresh").addEventListener("click", () => {
    renderHeader();
    if (forecastCard) forecastCard.refresh();
  });
```
- In the FR/EN handler, after `renderAll();`, no change is needed (renderAll re-mounts the forecast card, which re-fetches). Leave as is.

- [ ] **Step 4: Headless smoke — stubbed fetch + DOM exercises the real card**

Create a throwaway `.superpowers/sdd/smoke-forecast.mjs` (NOT committed — `.superpowers/` is git-excluded):
```js
import assert from "node:assert/strict";

// minimal DOM
function el() { return { innerHTML: "", classList: { add(){}, remove(){} }, get offsetWidth(){return 0;} }; }
const nodes = { "card-forecast": el() };
globalThis.document = { getElementById: (id) => nodes[id] ?? null };

// stub fetch to return a small Open-Meteo payload
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ hourly: {
    time: Array.from({ length: 25 }, (_, i) => `2026-07-03T${String(i % 24).padStart(2, "0")}:00`),
    wind_speed_10m: Array.from({ length: 25 }, (_, i) => 8 + (i % 10)),
    wind_gusts_10m: Array.from({ length: 25 }, (_, i) => 12 + (i % 10)),
    wind_direction_10m: Array.from({ length: 25 }, (_, i) => (250 + i) % 360),
    precipitation: Array(25).fill(0), cloud_cover: Array(25).fill(10),
  }}),
});

const { mountForecastCard } = await import("../../web/js/cards/forecast.js");
const settings = { lang: "fr", lat: 47.716, lon: -3.95 };
const card = mountForecastCard(settings);
await new Promise((r) => setTimeout(r, 20)); // let the async render settle

const html = nodes["card-forecast"].innerHTML;
assert.ok(html.includes("Prévision vent · 24 h"), "title rendered");
assert.ok(html.includes('class="mg-line"'), "meteogram mean line rendered");
assert.ok(html.includes("mg-legend"), "legend rendered");
assert.ok(html.includes('data-act="compare"') && html.includes('data-act="range"'), "controls rendered");

// error path: fetch rejects -> errorHTML, card does not throw
globalThis.fetch = async () => { throw new Error("network"); };
card.state.comparing = false;
await card.refresh();
assert.ok(nodes["card-forecast"].innerHTML.includes("Source indisponible"), "error fallback rendered");

console.log("FORECAST SMOKE OK: render + legend + controls + error fallback");
```
Run: `node .superpowers/sdd/smoke-forecast.mjs`
Expected: `FORECAST SMOKE OK: ...`.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` (22/22 — the 3 new i18n keys don't break the "both langs defined" test).
```bash
git add web/js/cards/forecast.js web/js/app.js web/js/i18n.js
git commit -m "feat(forecast): forecast card fetch/render + loading/error + app wiring"
```

---

## Task 6: Forecast interactions — 7-day expand, compare overlay, tap tooltip

**Files:**
- Modify: `web/js/cards/forecast.js` (wire control-button clicks + tooltip; add `tooltipAt` usage)

**Interfaces:**
- Consumes: `tooltipAt, degToCardinal` (Task 2); the `state`/`renderForecast` from Task 5.
- Produces: click handling on `[data-act]` buttons that flip `state.range`/`state.comparing` and re-render; a pointer tooltip over `.mg-wrap` that reads the nearest hour and shows `12 kn · raf. 18 · W 270°`.

- [ ] **Step 1: Add interaction wiring to `web/js/cards/forecast.js`**

Add imports at the top (extend the existing meteogram import):
```js
import { meteogram, tooltipAt, degToCardinal } from "../charts/meteogram.js";
```
Add a delegated click + tooltip binder, and call it after each mount. Replace the two `mountCard(CARD_ID, bodyHTML(...))`/error mounts' follow-up by calling `bindInteractions(state)` at the end of `renderForecast` (both success and error paths — buttons exist in both). Add:

```js
function bindInteractions(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;

  // control buttons (compare / range) — event delegation
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "range") state.range = state.range === "7d" ? "24h" : "7d";
      if (act === "compare") state.comparing = !state.comparing;
      renderForecast(state);
    });
  });

  // tap tooltip over the chart
  const wrap = card.querySelector(".mg-wrap");
  if (!wrap || !state.data) return;
  const tip = document.createElement("div");
  tip.className = "mg-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  const show = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(frac * (state.data.times.length - 1));
    const p = tooltipAt(state.data, i);
    const hh = p.time.slice(11, 16);
    tip.textContent = `${hh} · ${p.mean} kn · raf. ${p.gust} · ${p.cardinal} ${p.dir}°`;
    tip.style.left = `${frac * 100}%`;
    tip.style.top = "6px";
    tip.hidden = false;
  };
  wrap.addEventListener("pointerdown", (e) => show(e.clientX));
  wrap.addEventListener("pointermove", (e) => { if (e.pressure > 0 || e.buttons) show(e.clientX); });
  wrap.addEventListener("pointerleave", () => { tip.hidden = true; });
}
```
Then, at the end of `renderForecast` (after BOTH the success `mountCard(...)` and the `catch` `mountCard(...)`), call `bindInteractions(state);`. Concretely, add `bindInteractions(state);` as the last statement of the `try` block (after the success mount) and as the last statement of the `catch` block (after the error mount).

- [ ] **Step 2: Extend the headless smoke to exercise a toggle (append to `.superpowers/sdd/smoke-forecast.mjs`)**

Add before the final `console.log`, restoring a working fetch first:
```js
// restore working fetch and verify the 7d toggle re-renders with day labels
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ hourly: {
    time: Array.from({ length: 49 }, (_, i) => {
      const d = 3 + Math.floor(i / 24); const hh = String(i % 24).padStart(2, "0");
      return `2026-07-0${d}T${hh}:00`;
    }),
    wind_speed_10m: Array.from({ length: 49 }, (_, i) => 8 + (i % 10)),
    wind_gusts_10m: Array.from({ length: 49 }, (_, i) => 12 + (i % 10)),
    wind_direction_10m: Array.from({ length: 49 }, (_, i) => (250 + i) % 360),
    precipitation: Array(49).fill(0), cloud_cover: Array(49).fill(10),
  }}),
});
// re-mount fresh (need querySelectorAll/createElement in the DOM stub)
```
Because Task 6 uses `querySelectorAll`, `querySelector`, `createElement`, `getBoundingClientRect`, `appendChild`, and `addEventListener`, upgrade the DOM stub at the TOP of the smoke file to provide them. Replace the `el()` factory and `document` with:
```js
function el() {
  const node = {
    innerHTML: "", hidden: false, className: "", style: {}, textContent: "",
    classList: { add(){}, remove(){} }, children: [],
    _listeners: {},
    get offsetWidth() { return 0; },
    setAttribute(k, v) { this["__" + k] = v; },
    getAttribute(k) { return this["__" + k] ?? null; },
    addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    getBoundingClientRect() { return { left: 0, width: 300 }; },
    querySelector(sel) { return this._q(sel)[0] ?? null; },
    querySelectorAll(sel) { return this._q(sel); },
    _q() { return []; }, // sufficient: click wiring is exercised via direct handles below
  };
  return node;
}
```
(For a lightweight smoke, asserting the 7d re-render produces weekday labels is enough; full DOM click simulation is verified by running the app in Step 3. Keep the smoke focused: after switching `card.state.range = "7d"; await card.refresh();`, assert the card HTML contains a weekday label like `>ven.</text>` or `>sam.</text>`.)

Final smoke additions:
```js
card.state.range = "7d";
await card.refresh();
await new Promise((r) => setTimeout(r, 20));
assert.match(nodes["card-forecast"].innerHTML, />(lun\.|mar\.|mer\.|jeu\.|ven\.|sam\.|dim\.)</,
  "7d mode shows weekday x-labels");
```
Run: `node .superpowers/sdd/smoke-forecast.mjs` → still prints the OK line (now also covering the 7d re-render).

- [ ] **Step 3: Run the app and verify interactions in a browser**

Run `npm run serve`, open `http://localhost:5173/`, and confirm:
1. The forecast card shows a real meteogram (area + line + dashed gusts + downwind arrows + a green "now" line) with `0h/6h/12h/18h/24h` labels and a legend beneath.
2. Tapping/clicking on the chart shows a tooltip like `07:00 · 12 kn · raf. 18 · W 270°` that tracks the pointer.
3. Clicking **7 j** re-renders with the full week and weekday labels; clicking it again returns to 24 h.
4. Clicking **+ comparer** overlays a second (purple) line and adds `━ ARPEGE` to the legend; clicking again removes it.
5. In dark mode the chart recolours correctly (area/line/gust/now/compare all follow the dark tokens).
6. The other four cards still show their skeletons; killing your network and clicking refresh makes only the forecast card show "Source indisponible — ouvrir sur le site ↗".

Stop the server.

- [ ] **Step 4: Full suite + commit**

Run: `npm test` (22/22 — no new unit tests; interactions are DOM).
```bash
git add web/js/cards/forecast.js
git commit -m "feat(forecast): 7-day expand, compare overlay, and tap tooltip"
```

---

## Self-review against the spec

**Spec coverage (Phase-2 scope):**
- §3.1 Open-Meteo direct, AROME default, exact hourly vars, `kn`, `Europe/Paris`, model list → Task 1. ✅
- §3.1 default 24 h, "7 j" week, "+ comparer" second model → Tasks 5, 6. ✅
- §6 meteogram: area+line, dashed gusts, 10/20/30 gridlines + labels, y auto-expand >32 kn, downwind arrows every ~2 h, 6-hourly x labels, now line, tooltip, compare overlay → Tasks 2, 3, 6. ✅
- §6 colours via tokens, theme-correct in light+dark, compare `#7F77DD` → Task 4 (classes + tokens). ✅
- §4 independent load/fail (skeleton + `errorHTML`) → Task 5. ✅
- brief card 3 model chip "AROME 1.3", "+ comparer", "7 j" controls; legend "vent/rafales/maintenant" → Tasks 4, 5. ✅
- **Deferred (correct):** location geocoding search (spec §5) and the HTML-escaping helper — both belong to the phase that first introduces user/scraped text (this phase feeds only numeric data). Live-wind, tide, isobar, BMS, and the Worker are their own later phases.

**Placeholder scan:** no "TBD/handle edge cases"; every code step is complete. The `.mg-tip` CSS `transform` value is called out explicitly with its exact intended value.

**Type/name consistency:** `data` shape `{times,speed,gust,dir,precip,cloud}` is produced by `normalizeForecast` (Task 1) and consumed by `meteogram`/`tooltipAt` (Tasks 2, 3, 6). `MODELS` keys/values consistent across adapter and card. `mountForecastCard(settings) → { state, refresh }` consumed by `app.js` (Task 5). CSS classes `mg-area/line/gust/now/grid/axis/arrow/compare` emitted by `meteogram` (Task 3) are exactly the ones styled in `meteogram.css` (Task 4). i18n keys `legend_mean/gust/now` added in Task 5 and consumed by `legendHTML`.

---

## Next phases (unchanged from the spec build order)
- **Phase 3 — Tide card** (Worker `/api/tide` + maree.info, cosine interpolation, tide-curve SVG).
- **Phase 4 — Isobar card** (Worker `/api/chart` + Met Office run resolver, image + stepper).
- **Phase 5 — Live wind + Bulletin** (Worker `/api/livewind` windmorbihan feed + auto-refresh; Worker `/api/bms` Météo-France rwg + token fetch; alert-strip activation). **Introduce `escapeHTML()` here** and route scraped BMS text through it.
- **Phase 6 — PWA & docs** (manifest, service worker, README, deploy).

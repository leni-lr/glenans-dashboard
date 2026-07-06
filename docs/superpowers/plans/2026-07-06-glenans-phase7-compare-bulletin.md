# Glénans Dashboard — Phase 7: Multi-model Comparison + Bulletin Forecast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the inline "+ comparer" overlay with a full-screen multi-model comparison view (5 free Open-Meteo models: overlay-on-top + per-model mini-meteograms), fix the 7-day view to use a long-range model, and add "Prévisions pour la journée" to the bulletin card.

**Architecture:** The comparison view fetches 5 models in parallel directly from Open-Meteo (browser, CORS, no key) and renders one overlay chart (all models' mean-wind lines) plus a grid of per-model meteograms, in a full-screen modal opened from the forecast card. The bulletin Worker parser is extended to surface forecast échéances (`<vent>`/`<mer>`) alongside the situation.

**Tech Stack:** existing vanilla ES frontend + `meteogram()`, existing Worker. Node `node --test` for pure logic.

## Global Constraints
- **No new runtime deps**; no build step; **no hex outside `web/css/tokens.css`** (add model-colour tokens there). (spec §2)
- **Independent load/fail:** one model failing must not blank the view (show that model as unavailable); the whole view failing falls back gracefully. `render*` never throws. (spec §4)
- **5 free Open-Meteo models only** — Meteoblue is not available via Open-Meteo and is excluded (no paid services). Models: `meteofrance_arome_france_hd`, `meteofrance_arome_france`, `icon_eu`, `ecmwf_ifs025`, `gfs_global`. (user decision 2026-07-06)
- **Bulletin text stays French**, routed through `escapeHTML` before any DOM sink. (spec §7)
- Comparison layout: **overlay of all models on top, then one readable mini-meteogram per model** below. (user decision)

## File structure
```
web/js/sources/compare.js     # NEW: COMPARE_MODELS + fetchAllModels()
web/js/charts/compare.js      # NEW: overlayChart() (pure) + trimTrailingNulls()
web/js/cards/compareview.js   # NEW: openCompareView() full-screen modal
web/css/compare.css           # NEW: modal + model colours + grid
web/css/tokens.css            # MODIFY: --cmp-0..4 (light + dark)
web/js/cards/forecast.js      # MODIFY: "comparer" opens the view; 7j uses ECMWF; drop inline ARPEGE overlay
web/js/sources/openmeteo.js   # MODIFY: add arome_france to MODELS
web/index.html                # MODIFY: <link> compare.css
web/test/compare.test.js      # NEW: overlayChart + trimTrailingNulls
worker/src/bms.js             # MODIFY: parseBMS returns forecasts[]
worker/test/bms.test.js       # MODIFY: forecasts assertions
worker/test/fixtures/bms-sample.xml # MODIFY: add a forecast échéance
web/js/cards/bulletin.js      # MODIFY: render day-forecast section
```

---

## Task 1: Comparison data source

**Files:** Create `web/js/sources/compare.js`, `web/test/compare.test.js` (compare.test.js also covers Task 2). Modify `web/js/sources/openmeteo.js`.

**Interfaces:**
- Produces: `COMPARE_MODELS` (array of `{ key, label, model }`), `fetchAllModels({lat, lon, days}) → Promise<Array<{key,label,data|null}>>` (never rejects; a failed model yields `data:null`).

- [ ] **Step 1: Add the 2.5 km model** — in `web/js/sources/openmeteo.js`, extend `MODELS`:
```js
export const MODELS = {
  arome:   "meteofrance_arome_france_hd",
  arome25: "meteofrance_arome_france",
  arpege:  "meteofrance_arpege_europe",
  icon:    "icon_eu",
  ecmwf:   "ecmwf_ifs025",
  gfs:     "gfs_global",
};
```

- [ ] **Step 2: Write the source** — `web/js/sources/compare.js`:
```js
import { fetchForecast, MODELS } from "./openmeteo.js";

export const COMPARE_MODELS = [
  { key: "arome_hd", label: "AROME HD",  model: MODELS.arome },
  { key: "arome25",  label: "AROME 2.5", model: MODELS.arome25 },
  { key: "icon",     label: "ICON-EU",   model: MODELS.icon },
  { key: "ecmwf",    label: "ECMWF",     model: MODELS.ecmwf },
  { key: "gfs",      label: "GFS",       model: MODELS.gfs },
];

// Fetch all comparison models in parallel; a failed model resolves to data:null
// so one bad model never blanks the view.
export async function fetchAllModels({ lat, lon, days = 7 }) {
  return Promise.all(
    COMPARE_MODELS.map(async (m) => {
      try {
        const data = await fetchForecast({ lat, lon, model: m.model, days });
        return { key: m.key, label: m.label, data };
      } catch {
        return { key: m.key, label: m.label, data: null };
      }
    })
  );
}
```

- [ ] **Step 3: Test** — add to `web/test/compare.test.js` (created here, extended in Task 2):
```js
import test from "node:test";
import assert from "node:assert/strict";
import { COMPARE_MODELS } from "../js/sources/compare.js";

test("COMPARE_MODELS lists the five free models with labels", () => {
  assert.equal(COMPARE_MODELS.length, 5);
  const keys = COMPARE_MODELS.map((m) => m.key);
  assert.deepEqual(keys, ["arome_hd", "arome25", "icon", "ecmwf", "gfs"]);
  for (const m of COMPARE_MODELS) assert.ok(m.label && m.model, "label + model set");
});
```

- [ ] **Step 4: Run** — `npm test` → still green (adds 1 test). Commit:
```bash
git add web/js/sources/compare.js web/js/sources/openmeteo.js web/test/compare.test.js
git commit -m "feat(compare): five-model Open-Meteo source"
```

---

## Task 2: Comparison overlay chart + full-screen view

**Files:** Create `web/js/charts/compare.js`, `web/js/cards/compareview.js`, `web/css/compare.css`. Modify `web/css/tokens.css`, `web/js/cards/forecast.js`, `web/index.html`, `web/test/compare.test.js`.

**Interfaces:**
- Consumes: `fetchAllModels`, `COMPARE_MODELS`; `meteogram()`, `computeYMax()` from `charts/meteogram.js`.
- Produces: `overlayChart(series, opts) → string` (SVG; `series` = `[{key,label,times,speed}]`, colour class `cmp-line--<idx>` per series, breaks lines at null); `trimTrailingNulls(data) → data`; `openCompareView(settings) → void`.

- [ ] **Step 1: Model-colour tokens** — in `web/css/tokens.css`, add to `:root`:
```css
  --cmp-0: #0C447C; --cmp-1: #378ADD; --cmp-2: #1D9E75; --cmp-3: #D85A30; --cmp-4: #7F77DD;
```
and to `:root[data-theme="dark"]`:
```css
  --cmp-0: #85B7EB; --cmp-1: #378ADD; --cmp-2: #5DCAA5; --cmp-3: #F0997B; --cmp-4: #9D96F0;
```

- [ ] **Step 2: Overlay chart + trim helper** — `web/js/charts/compare.js`:
```js
import { computeYMax } from "./meteogram.js";

// Drop trailing null speeds (short-range models pad the tail with nulls).
export function trimTrailingNulls(data) {
  let n = data.times.length;
  while (n > 0 && (data.speed[n - 1] == null)) n--;
  if (n === data.times.length) return data;
  return {
    times: data.times.slice(0, n),
    speed: data.speed.slice(0, n),
    gust: (data.gust ?? []).slice(0, n),
    dir: (data.dir ?? []).slice(0, n),
  };
}

// Overlay of each series' mean-wind line on one shared y-axis. Lines break at
// nulls (so a model that ends early just stops). Colours via .cmp-line--N.
export function overlayChart(series, opts = {}) {
  const W = opts.width ?? 320, H = opts.height ?? 150;
  const L = 26, R = 8, B = 22, TOP = 8;
  const plotW = W - L - R, plotH = H - B - TOP;
  const active = series.filter((s) => Array.isArray(s.speed) && s.speed.length);
  const maxLen = Math.max(1, ...active.map((s) => s.times.length));
  const allSpeeds = active.flatMap((s) => s.speed).filter((v) => v != null);
  const ym = computeYMax(allSpeeds);
  const x = (i) => L + (maxLen <= 1 ? 0 : (i * plotW) / (maxLen - 1));
  const y = (v) => TOP + plotH * (1 - v / ym);
  const f = (n) => n.toFixed(1);

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="${opts.ariaLabel ?? "Comparaison des modèles"}" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  for (const v of [10, 20, 30]) {
    if (v > ym) continue;
    s += `<line class="mg-grid" x1="${L}" y1="${f(y(v))}" x2="${W - R}" y2="${f(y(v))}"/>`;
    s += `<text class="mg-axis" x="${L - 4}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`;
  }
  active.forEach((ser) => {
    const idx = series.indexOf(ser);
    let d = "", pen = false;
    ser.speed.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${f(x(i))} ${f(y(v))} `;
      pen = true;
    });
    if (d) s += `<path class="cmp-line--${idx}" d="${d.trim()}"/>`;
  });
  return s + `</svg>`;
}
```

- [ ] **Step 3: Test the chart** — append to `web/test/compare.test.js`:
```js
import { overlayChart, trimTrailingNulls } from "../js/charts/compare.js";

test("overlayChart emits one coloured polyline per non-empty series", () => {
  const svg = overlayChart([
    { key: "a", label: "A", times: ["t0", "t1", "t2"], speed: [5, 6, 7] },
    { key: "b", label: "B", times: ["t0", "t1", "t2"], speed: [8, 9, 10] },
  ]);
  assert.match(svg, /cmp-line--0/);
  assert.match(svg, /cmp-line--1/);
});

test("overlayChart breaks a line at a null gap", () => {
  const svg = overlayChart([{ key: "a", label: "A", times: ["t0", "t1", "t2"], speed: [5, null, 7] }]);
  assert.equal((svg.match(/M/g) || []).length, 2, "two move commands around the gap");
});

test("trimTrailingNulls cuts the padded tail", () => {
  const t = trimTrailingNulls({ times: ["a", "b", "c"], speed: [1, 2, null], gust: [1, 2, null], dir: [0, 0, 0] });
  assert.equal(t.times.length, 2);
});
```

- [ ] **Step 4: The full-screen view** — `web/js/cards/compareview.js`:
```js
import { fetchAllModels } from "../sources/compare.js";
import { overlayChart, trimTrailingNulls } from "../charts/compare.js";
import { meteogram } from "../charts/meteogram.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

const OVERLAY_ID = "compare-overlay";

function legend(series) {
  return `<div class="cmp-legend">` + series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${i}"></span>${escapeHTML(s.label)}</span>`
  ).join("") + `</div>`;
}

function grid(series, lang) {
  return `<div class="cmp-grid">` + series.map((s) => {
    const body = s.data
      ? meteogram(trimTrailingNulls(s.data), { lang, range: "7d", nowTime: new Date().toISOString() })
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
    return `<figure class="cmp-cell"><figcaption>${escapeHTML(s.label)}</figcaption>${body}</figure>`;
  }).join("") + `</div>`;
}

export async function openCompareView(settings) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.className = "cmp-modal";
  host.innerHTML = `<div class="cmp-panel">` +
    `<div class="cmp-head"><span class="cmp-title">${t(lang, "compare_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<div class="cmp-body">${t(lang, "loading")}</div></div>`;
  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  try {
    const series = await fetchAllModels({ lat: settings.lat, lon: settings.lon, days: 7 });
    const lines = series.filter((s) => s.data).map((s) => ({
      key: s.key, label: s.label, times: s.data.times, speed: s.data.speed,
    }));
    const body = host.querySelector(".cmp-body");
    body.innerHTML = (lines.length
      ? `<div class="cmp-overlay">${overlayChart(lines, { lang })}</div>${legend(series)}`
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`) + grid(series, lang);
  } catch {
    host.querySelector(".cmp-body").innerHTML = `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
  }
}
```

- [ ] **Step 5: i18n keys** — in `web/js/i18n.js` add:
```js
  compare_title: { fr: "Comparaison des modèles", en: "Model comparison" },
  close:         { fr: "Fermer",                  en: "Close" },
  loading:       { fr: "Chargement…",             en: "Loading…" },
```

- [ ] **Step 6: CSS** — `web/css/compare.css`:
```css
.cmp-line--0 { fill: none; stroke: var(--cmp-0); stroke-width: 1.6; }
.cmp-line--1 { fill: none; stroke: var(--cmp-1); stroke-width: 1.6; }
.cmp-line--2 { fill: none; stroke: var(--cmp-2); stroke-width: 1.6; }
.cmp-line--3 { fill: none; stroke: var(--cmp-3); stroke-width: 1.6; }
.cmp-line--4 { fill: none; stroke: var(--cmp-4); stroke-width: 1.6; }
.cmp-modal { position: fixed; inset: 0; background: rgba(4,44,83,0.55);
  display: flex; align-items: flex-start; justify-content: center; z-index: 50; overflow-y: auto; }
.cmp-panel { background: var(--page-bg); width: 100%; max-width: 640px; min-height: 100%;
  padding: 12px 14px 32px; }
.cmp-head { display: flex; align-items: center; justify-content: space-between; }
.cmp-title { font-weight: 700; color: var(--text-primary); }
.cmp-overlay { margin-top: 8px; }
.cmp-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--text-secondary); padding: 4px 0 10px; }
.cmp-key { display: inline-flex; align-items: center; gap: 5px; }
.cmp-swatch { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
.cmp-swatch--0 { background: var(--cmp-0); } .cmp-swatch--1 { background: var(--cmp-1); }
.cmp-swatch--2 { background: var(--cmp-2); } .cmp-swatch--3 { background: var(--cmp-3); }
.cmp-swatch--4 { background: var(--cmp-4); }
.cmp-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 8px; }
@media (min-width: 480px) { .cmp-grid { grid-template-columns: 1fr 1fr; } }
.cmp-cell { margin: 0; }
.cmp-cell figcaption { font-size: 12px; color: var(--text-secondary); padding-bottom: 2px; }
.cmp-miss { font-size: 13px; color: var(--text-secondary); }
```
And add `<link rel="stylesheet" href="./css/compare.css" />` in `web/index.html` after `bulletin.css`.

- [ ] **Step 7: Rewire the forecast card** — in `web/js/cards/forecast.js`:
  - import `openCompareView` from `../cards/compareview.js`.
  - In `forecastTitleRow`, keep the `data-act="range"` (7 j) button; change the compare button label to plain `t(lang,"compare")` without `aria-pressed`.
  - In `bindInteractions`, replace the `compare` branch: `if (act === "compare") { openCompareView(state.settings); return; }` (no re-render). Keep `range`.
  - **7-day fix:** the range toggle now also swaps the model — 24 h uses AROME HD, 7 j uses ECMWF (which actually covers 7 days). In `renderForecast`, choose `const model = state.range === "7d" ? MODELS.ecmwf : MODELS.arome;` and pass it to `fetchForecast`. Update the chip text to reflect the active model: `AROME 1.3` for 24 h, `ECMWF` for 7 j.
  - Remove the inline compare state (`comparing`, `compareModel`, `compareData`) and the `compare` overlay/legend-cmp path — the modal replaces it.

- [ ] **Step 8: Run + smoke** — `npm test` (adds compare tests). Headless smoke `.superpowers/sdd/smoke-compare.mjs`: stub `document.createElement`/`body` + `fetch` returning a 2-model-ish payload; call `openCompareView({lang:"fr",lat:47.7,lon:-3.9})`; assert the overlay SVG + legend render and a failing model shows the fallback. Commit:
```bash
git add web/js/charts/compare.js web/js/cards/compareview.js web/css/compare.css web/css/tokens.css web/js/cards/forecast.js web/js/i18n.js web/index.html web/test/compare.test.js
git commit -m "feat(compare): full-screen multi-model comparison view + 7-day via ECMWF"
```

---

## Task 3: Bulletin "Prévisions pour la journée"

**Files:** Modify `worker/src/bms.js`, `worker/test/bms.test.js`, `worker/test/fixtures/bms-sample.xml`, `web/js/cards/bulletin.js`. Redeploy the Worker.

**Interfaces:**
- Produces: `parseBMS(xml)` return gains `forecasts: Array<{ title, vent, mer }>` — the échéances that carry a `<vent>` (day/night forecast), newest text robustly regardless of the shifting "Observations…" label.

- [ ] **Step 1: Extend the fixture** — add a forecast échéance to `worker/test/fixtures/bms-sample.xml` before `</bulletin>`:
```xml
<echeance idEcheance="j1">
<titreEcheance><![CDATA[Prévisions pour la journée du lundi 6 juillet]]></titreEcheance>
<region idRegion="cot4">
<vent><![CDATA[VENT : secteur Nord-Ouest 3 à 4, mollissant en soirée.]]></vent>
<mer><![CDATA[MER : peu agitée, devenant belle.]]></mer>
</region></echeance>
```

- [ ] **Step 2: Parse forecasts** — in `worker/src/bms.js`, add a helper and extend `parseBMS`:
```js
// All forecast échéances (those carrying a <vent>): title + vent + mer text.
function forecastEcheances(xml) {
  const out = [];
  const re = /<echeance\b[\s\S]*?<\/echeance>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const vent = cdata(block, "vent");
    if (!vent) continue;
    out.push({ title: cdata(block, "titreEcheance"), vent, mer: cdata(block, "mer") });
  }
  return out;
}
```
and in `parseBMS`, before `return`: `const forecasts = forecastEcheances(xml);` then include `forecasts` in the returned object.

- [ ] **Step 3: Tests** — add to `worker/test/bms.test.js`:
```js
test("parseBMS extracts forecast échéances with vent + mer", () => {
  const b = parseBMS(xml);
  assert.ok(b.forecasts.length >= 1, "at least one forecast");
  const f = b.forecasts[0];
  assert.match(f.title, /Prévisions pour la journée/);
  assert.match(f.vent, /VENT/);
  assert.match(f.mer, /MER/);
});
```
Run: `node --test worker/test/bms.test.js` → green.

- [ ] **Step 4: Render in the card** — in `web/js/cards/bulletin.js`, after the situation paragraph, render the first forecast (if any). Add a helper:
```js
function forecastHTML(lang, forecasts) {
  if (!forecasts || !forecasts.length) return "";
  const f = forecasts[0];
  return `<div class="bms-forecast">` +
    `<div class="bms-fc-title">${escapeHTML(f.title)}</div>` +
    `<p class="bms-fc-line">${escapeHTML(f.vent)}</p>` +
    (f.mer ? `<p class="bms-fc-line">${escapeHTML(f.mer)}</p>` : "") +
    `</div>`;
}
```
Insert `forecastHTML(lang, d.forecasts)` into the success `body` (between the situation `<p>` and the "voir plus" button). Add CSS to `web/css/bulletin.css`:
```css
.bms-forecast { margin-top: 8px; padding-top: 8px; border-top: 0.5px solid var(--card-border); }
.bms-fc-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.bms-fc-line { font-size: 13px; line-height: 1.45; color: var(--text-body); margin: 4px 0 0; }
```

- [ ] **Step 5: Test + smoke + deploy** — `npm test` green; update `.superpowers/sdd/smoke-bulletin.mjs` fetch stub to include `forecasts` and assert the day-forecast text renders. Then redeploy the Worker:
```bash
cd worker && npx wrangler deploy   # publishes the bms forecasts change
```
Commit:
```bash
git add worker/src/bms.js worker/test/bms.test.js worker/test/fixtures/bms-sample.xml web/js/cards/bulletin.js web/css/bulletin.css
git commit -m "feat(bulletin): add Prévisions pour la journée (forecast échéances)"
```

---

## Self-review vs decisions
- 5 free models, overlay-on-top + per-model grid → Tasks 1–2. ✅
- One model failing ≠ blank view (data:null + per-cell fallback) → Tasks 1–2. ✅
- 7-day no longer blank (ECMWF for 7 j; overlay lines break at model horizons) → Task 2. ✅
- Bulletin day-forecast, robust to the shifting "Observations…" label (keys off `<vent>` presence, not the title) → Task 3. ✅
- French source text through `escapeHTML`; colours via tokens → Tasks 2–3. ✅

## Suite after Phase 7
- web: 52 + ~4 compare = ~56. worker: 23 + 1 bms = 24. Worker redeploy required (Task 3).

## Next: deploy is automatic for web (Pages Action); Worker redeploys via `wrangler deploy` in Task 3.

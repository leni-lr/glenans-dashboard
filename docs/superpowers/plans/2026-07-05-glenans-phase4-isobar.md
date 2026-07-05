# Glénans Dashboard — Phase 4: Isobar Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or execute inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the isobar card's skeleton with the UK Met Office surface-pressure chart, proxied through the Worker, with a ◀/▶ time stepper.

**Architecture:** The Met Office page embeds the current run timestamp in its HTML (`…/surface-pressure/colour/{YYYY-MM-DDTHHMM}/FSXX12T_{HH}.gif`). The Worker fetches that page, extracts the live run (regex), and (a) serves a small JSON manifest `{run, steps}` and (b) proxies each step's GIF with CORS + a 1 h cache. The frontend shows `<img src="{WORKER_URL}/api/chart?step=NN">` with a stepper; a pure `chartStepLabel` formats "analyse T+0 · ven 12h".

**Tech Stack:** existing Worker (`worker/src/*`) + vanilla ES frontend. Node `node --test` for pure logic.

## Global Constraints
- Verified live: colour GIF URL `https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/colour/{RUN}/FSXX12T_{HH}.gif`, `RUN` like `2026-07-05T1200`, `HH` ∈ {00,12,24,36,48,60,72,96,120}; the current `RUN` is present verbatim in the page HTML; the superseded run 404s. No auth. (spec §3.5)
- Worker `/api/chart` (no step) → JSON `{run, steps}` with CORS. `/api/chart?step=NN` → the GIF bytes proxied with `Content-Type: image/gif`, CORS, **1 h cache**, browser UA; structured `{error}` JSON on failure. (spec §3.5)
- Card: `<img>` inside a 6px rounded inner border; centred stepper `◀ analyse T+0 · ven 12h ▶`; current step kept in the card state (session). Loads/fails independently (skeleton → `errorHTML(lang,"https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure")`); never throws. Colours via tokens. (spec §6 / brief card 7)
- No new runtime deps. Worker tests run via `node --test worker/test/*.test.js`.

## File structure
```
worker/src/chart.js        # NEW: parseLatestRun(), CHART_STEPS, chartGifURL()
worker/src/index.js        # MODIFY: add /api/chart routes
worker/test/chart.test.js  # NEW (+ fixture reuse or capture)
web/js/charts/chart.js     # NEW: chartStepLabel() (pure)
web/js/sources/chart.js    # NEW: fetchChartManifest()
web/js/cards/isobar.js     # NEW: mountIsobarCard()
web/js/app.js              # MODIFY: mount isobar card
web/css/isobar.css         # NEW: img frame + stepper
web/index.html             # MODIFY: <link> isobar.css
web/test/chart.test.js     # NEW (chartStepLabel)
```

---

## Task 1: Worker chart module (parser + URL + steps) — SUBAGENT
**Files:** Create `worker/src/chart.js`, `worker/test/chart.test.js`, `worker/test/fixtures/metoffice-surface-pressure.html`.

**Interfaces:** `CHART_STEPS = [0,12,24,36,48,60,72,96,120]`; `parseLatestRun(html)` → `"YYYY-MM-DDTHHMM"` (throws if absent); `chartGifURL(run, step)` → the colour GIF URL (step→2-digit-min padded: 0→"00", 12→"12", 96→"96", 120→"120").

- [ ] **Step 1: capture fixture** — from `worker/`: `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0" "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure" -o test/fixtures/metoffice-surface-pressure.html`. Confirm it contains a `surface-pressure/colour/…T….../FSXX12T_00.gif` URL; note the real RUN value.
- [ ] **Step 2: failing test** — `worker/test/chart.test.js`:
```js
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
```
- [ ] **Step 3: run → RED**, then implement `worker/src/chart.js`:
```js
export const CHART_STEPS = [0, 12, 24, 36, 48, 60, 72, 96, 120];
export function parseLatestRun(html) {
  const m = html.match(/surface-pressure\/colour\/(\d{4}-\d{2}-\d{2}T\d{4})\//);
  if (!m) throw new Error("chart run not found");
  return m[1];
}
export function chartGifURL(run, step) {
  const hh = String(step).padStart(2, "0");
  return `https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/colour/${run}/FSXX12T_${hh}.gif`;
}
```
- [ ] **Step 4: run → GREEN** (`node --test worker/test/chart.test.js` 4/4). Repo `npm test` still 42.
- [ ] **Step 5: commit** — `git add worker/src/chart.js worker/test/chart.test.js worker/test/fixtures/metoffice-surface-pressure.html && git commit -m "feat(worker): Met Office chart run parser + URL builder"`

---

## Task 2: Worker chart routes — INLINE
**Files:** Modify `worker/src/index.js`.

Add to the router (before the 404): a `/api/chart` branch. Fetch the Met Office page (browser UA) once, `parseLatestRun`; if `step` param present, `chartGifURL(run, step)` → fetch the GIF → return its bytes with `Content-Type: image/gif`, CORS, `Cache-Control: max-age=3600`, and `ctx.waitUntil(cache.put(...))`; else return `json({run, steps: CHART_STEPS})`. On any failure return `{error}` JSON (502). Cache both per-URL (key on pathname+search) for 1 h.

- [ ] **Step 1:** import `{ parseLatestRun, chartGifURL, CHART_STEPS }`; add the route; keep the tide route intact.
- [ ] **Step 2:** local sanity via `npx wrangler dev` (from `worker/`): `curl .../api/chart` → JSON `{run, steps}`; `curl -o /dev/null -w "%{http_code} %{content_type}" ".../api/chart?step=0"` → `200 image/gif`; `OPTIONS` → CORS. Stop dev.
- [ ] **Step 3:** commit — `git add worker/src/index.js && git commit -m "feat(worker): /api/chart manifest + GIF proxy"`

---

## Task 3: Frontend isobar card + label + wiring — INLINE
**Files:** Create `web/js/charts/chart.js`, `web/js/sources/chart.js`, `web/js/cards/isobar.js`, `web/css/isobar.css`, `web/test/chart.test.js`; Modify `web/js/app.js`, `web/index.html`.

- **`chart.js`** pure: `chartStepLabel(run, step, lang)` → `${step===0?"analyse T+0":`T+${step}`} · ${weekdayShort} ${HH}h` where valid = run + step hours. Test:
```js
import test from "node:test"; import assert from "node:assert/strict";
import { chartStepLabel } from "../js/charts/chart.js";
test("step 0 labels the analysis + valid time", () => {
  const l = chartStepLabel("2026-07-05T1200", 0, "fr");
  assert.match(l, /analyse T\+0/); assert.match(l, /12h/);
});
test("step 12 advances the valid time by 12h", () => {
  const l = chartStepLabel("2026-07-05T1200", 12, "fr");
  assert.match(l, /T\+12/); assert.match(l, /00h/);
});
```
Implementation:
```js
export function chartStepLabel(run, step, lang) {
  const iso = `${run.slice(0,4)}-${run.slice(5,7)}-${run.slice(8,10)}T${run.slice(11,13)}:${run.slice(13,15)}`;
  const valid = new Date(new Date(iso).getTime() + step * 3600000);
  const day = valid.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "short" });
  const hh = String(valid.getHours()).padStart(2, "0");
  return `${step === 0 ? "analyse T+0" : `T+${step}`} · ${day} ${hh}h`;
}
```
- **`sources/chart.js`**: `fetchChartManifest()` → GET `${WORKER_URL}/api/chart` → `{run, steps}`; throws if `WORKER_URL` empty / error (mirror `sources/tide.js`).
- **`cards/isobar.js`**: `mountIsobarCard(settings)` → `{state:{settings, idx:0, run:null, steps:[]}, refresh}`. `renderIsobar`: skeleton → fetch manifest → render title + `<img class="isobar-img" src="${WORKER_URL}/api/chart?step=${steps[idx]}" alt="...">` + a centred stepper `◀ {chartStepLabel(run, steps[idx], lang)} ▶` (two `.linkbtn` with `data-act="prev"`/`"next"`); bind clicks that move `idx` within `[0, steps.length)` and re-render (no refetch — just swap). On failure → `errorHTML`. Never throws.
- **`isobar.css`**: `.isobar-img{width:100%;display:block;border:0.5px solid var(--card-border);border-radius:6px}` `.isobar-step{text-align:center;font-size:12px;color:var(--text-body);padding-top:4px}`.
- **`app.js`**: remove the `card-isobar` skeleton line from `renderSkeletons`; import + mount-once/else-refresh `isobarCard` in `renderAll`; add to `btn-refresh`. (Mirror the tide card wiring.)
- **`index.html`**: `<link>` isobar.css after tidecurve.css.

- [ ] Steps: write `chart.js` + test (RED→GREEN); write source/card/CSS; wire app.js + index; headless smoke `.superpowers/sdd/smoke-isobar.mjs` (temp-set WORKER_URL, stub fetch → manifest `{run:"2026-07-05T1200",steps:[0,12,24]}`; assert card shows an `<img` with `step=0`, a stepper label `analyse T+0`; click `next` → `step=12` and `T+12`; then stub reject → fallback; restore config). `npm test` → 44 (42 + 2 chart). Commit `feat(isobar): Met Office chart card + stepper + app wiring`.

---

## Self-review vs spec
- §3.5 Met Office colour GIF via Worker proxy, 1 h cache, run resolved from page → Tasks 1,2. ✅
- §6 img in rounded frame + centred stepper, current step in state → Task 3. ✅
- §4 independent load/fail → Task 3. ✅
- Deferred: pinch-zoom (brief mentions it; native mobile pinch on the `<img>` works without code — note; a dedicated zoom control is out of scope this phase). bw charts + steps beyond the mockup's T+84 (we expose the real 0..120).

## Next: Phase 5 (live wind + bulletin), Phase 6 (PWA + docs).

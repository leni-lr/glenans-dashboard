# Glénans Dashboard — Phase 3: Tide Card + Cloudflare Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tide card's skeleton with a real day tide-curve for Penfret (maree.info port 94), scraped via a new Cloudflare Worker, rendered as a cosine-interpolated inline-SVG with HW/LW annotations, a coefficient badge, and a rising/falling "now" dot.

**Architecture:** First use of the `/worker` Cloudflare Worker: a small CORS proxy/scraper exposing `GET /api/tide?port=94`, which fetches maree.info, extracts the day's tide extremes + coefficients into normalised JSON, caches 6 h, and returns structured error JSON on failure. The frontend `sources/tide.js` calls the Worker (via `WORKER_URL`); `charts/tidecurve.js` is a pure cosine-interpolation + inline-SVG builder (classes only, theme-correct); `cards/tide.js` orchestrates and mounts. Deterministic logic is `node --test`ed; the Worker's HTML parser is verified against a real captured fixture; the card is verified by a headless smoke.

**Tech Stack:** Vanilla ES modules (frontend, no build). Cloudflare Worker (`wrangler`, free tier) as an ES-module Worker (`export default { fetch }`). Node `>=20` `node --test`.

## Global Constraints

- No build step / no runtime deps in `/web`. The Worker is a separate `/worker` package; its only tool is `wrangler` (dev/deploy) — no runtime npm deps in the Worker either (plain `fetch`/`Response`/Cache API).
- maree.info **port 94 = Penfret (Îles de Glénan)** (verified against the live page title). The tide card title is `Marée · {port}` where `{port}` is the port name returned by the Worker (parsed from the page — do NOT hardcode "Concarneau"; the mockup label was a placeholder).
- Worker endpoint `GET /api/tide?port=94`. It MUST: send a normal browser `User-Agent`; cache responses with the Cache API for **6 hours**; set CORS `Access-Control-Allow-Origin: *` (the GitHub-Pages frontend calls it cross-origin) and handle `OPTIONS` preflight; on any failure return `{ "error": "..." }` JSON with a non-2xx status — never an unhandled 500. (spec §2, §3.3)
- Tide extremes: HW (pleine mer / "PM") and LW (basse mer / "BM") **times + heights**, plus the tide **coefficient(s)** for today. To draw a gap-free 00:00–24:00 curve, the Worker returns extremes spanning from the last extreme **before** today 00:00 through the first **after** tomorrow 00:00. (spec §3.3)
- Cosine interpolation between consecutive extremes `(t0,h0)→(t1,h1)`: `h(t) = (h0+h1)/2 + (h0−h1)/2 · cos(π (t−t0)/(t1−t0))`. (spec §3.3)
- Tide-curve SVG (~120px, spans 00:00–24:00): area fill under the curve (blue-200 light / navy-800 dark, ~45% opacity) + 2px line; each extreme annotated on the curve — "PM HH:MM" + height for highs, "BM HH:MM" + height for lows (two stacked 11px labels), edge extremes get a time-only label; "now": filled dot (r≈5) + thin ring (r≈8.5) in the now-green with the current time and ↗ (rising) / ↘ (falling); x-axis labels every 6 h; coefficient badge in the card title row. Colours via CSS tokens only (no inline hex). (spec §6 / brief card 5)
- Card loads/fails independently: skeleton while loading; `errorHTML(lang, "https://maree.info/94")` on failure (incl. when `WORKER_URL` is unset — the Worker isn't deployed yet, so the card degrades gracefully until it is). Never throw out of the card. (spec §4)
- This phase still feeds only numeric/enumerated tide data + a short port name into the DOM. The port name comes from a scraped page, so it is the FIRST externally-sourced string reaching a sink — introduce `escapeHTML()` now (carried-forward item) and route the port name through it.

---

## File structure introduced/changed in this phase

```
worker/
  wrangler.toml            # NEW: Worker config
  src/index.js             # NEW: router + CORS + cache; imports parseTide
  src/tide.js              # NEW: parseTide(html) — isolated maree.info parser
  test/tide.test.js        # NEW: parser test against a real captured fixture
  test/fixtures/maree-94.html  # NEW: trimmed real maree.info/94 HTML (captured at build)
web/js/
  util/html.js             # NEW: escapeHTML()
  charts/tidecurve.js      # NEW: hoursFromMidnight(), tideHeightAt(), tideCurve()
  sources/tide.js          # NEW: fetchTide(port) via WORKER_URL
  cards/tide.js            # NEW: mountTideCard()
  app.js                   # MODIFY: mount the tide card in place of its skeleton
  i18n.js                  # MODIFY: +tide labels (rising/falling, PM/BM already implied)
web/css/
  tokens.css               # MODIFY: add --tide-area, --tide-line (light + dark)
  tidecurve.css            # NEW: .tc-* styling via tokens
web/index.html             # MODIFY: <link> tidecurve.css
web/test/
  tidecurve.test.js        # NEW
  html.test.js             # NEW (escapeHTML)
```

---

## Task 1: escapeHTML helper + tide interpolation math

**Files:** Create `web/js/util/html.js`, `web/js/charts/tidecurve.js` (helpers only; SVG in Task 2); Test `web/test/html.test.js`, `web/test/tidecurve.test.js`.

**Interfaces:**
- `escapeHTML(s)` → string (pure): replaces `& < > " '` with entities; coerces non-strings via `String()`.
- `hoursFromMidnight(isoT, todayISO)` → number (pure): fractional hours from `todayISO`+"T00:00" to `isoT` (can be negative / >24).
- `tideHeightAt(points, th)` → number (pure): `points` = array of `{th, h}` sorted ascending by `th`; cosine-interpolate between the bracketing pair; clamp to the end heights outside the range.

- [ ] **Step 1: failing tests**

`web/test/html.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { escapeHTML } from "../js/util/html.js";

test("escapeHTML neutralises HTML metacharacters", () => {
  assert.equal(escapeHTML(`<b>"x"&'y'</b>`), "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
});
test("escapeHTML coerces non-strings", () => {
  assert.equal(escapeHTML(72), "72");
});
```

`web/test/tidecurve.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { hoursFromMidnight, tideHeightAt } from "../js/charts/tidecurve.js";

test("hoursFromMidnight measures fractional hours from today 00:00", () => {
  assert.equal(hoursFromMidnight("2026-07-04T07:32", "2026-07-04"), 7 + 32 / 60);
  assert.ok(Math.abs(hoursFromMidnight("2026-07-03T22:05", "2026-07-04") - (-1 - 55 / 60)) < 1e-9);
});

test("tideHeightAt returns the extreme heights at the extremes", () => {
  const pts = [{ th: 1.5, h: 1.24 }, { th: 7.5, h: 4.36 }];
  assert.ok(Math.abs(tideHeightAt(pts, 1.5) - 1.24) < 1e-9);
  assert.ok(Math.abs(tideHeightAt(pts, 7.5) - 4.36) < 1e-9);
});

test("tideHeightAt is the midpoint mean at the half-way time", () => {
  const pts = [{ th: 0, h: 1 }, { th: 6, h: 5 }];
  assert.ok(Math.abs(tideHeightAt(pts, 3) - 3) < 1e-9); // (1+5)/2
});

test("tideHeightAt clamps outside the sampled range", () => {
  const pts = [{ th: 2, h: 1 }, { th: 8, h: 5 }];
  assert.equal(tideHeightAt(pts, 0), 1);
  assert.equal(tideHeightAt(pts, 10), 5);
});
```

- [ ] **Step 2: run → fail** (`node --test web/test/html.test.js web/test/tidecurve.test.js`) — modules not found.

- [ ] **Step 3: implement**

`web/js/util/html.js`:
```js
// Escape a value for safe interpolation into HTML text/attribute contexts.
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => MAP[c]);
}
```

`web/js/charts/tidecurve.js` (helpers; SVG appended in Task 2):
```js
// Fractional hours from `todayISO` 00:00 (local) to an ISO-ish "YYYY-MM-DDTHH:MM".
export function hoursFromMidnight(isoT, todayISO) {
  return (new Date(isoT).getTime() - new Date(`${todayISO}T00:00`).getTime()) / 3600000;
}

// Cosine interpolation of tide height at time `th` (hours), given extremes
// `points` = [{th, h}] sorted ascending. Clamps to end heights outside the range.
export function tideHeightAt(points, th) {
  if (th <= points[0].th) return points[0].h;
  const last = points[points.length - 1];
  if (th >= last.th) return last.h;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1];
    if (th >= a.th && th <= b.th) {
      return (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos((Math.PI * (th - a.th)) / (b.th - a.th));
    }
  }
  return last.h;
}
```

- [ ] **Step 4: run → pass** (both suites green). Full suite `npm test` (should be 32 prior + 6 new = 38).
- [ ] **Step 5: commit**
```bash
git add web/js/util/html.js web/js/charts/tidecurve.js web/test/html.test.js web/test/tidecurve.test.js
git commit -m "feat(tide): escapeHTML + cosine tide interpolation helpers"
```

---

## Task 2: tide-curve SVG builder

**Files:** Modify `web/js/charts/tidecurve.js` (add `tideCurve`); Modify `web/test/tidecurve.test.js` (add builder tests).

**Interfaces:**
- Consumes `tideHeightAt` (same file).
- `tideCurve(model, opts = {})` → SVG string (pure). `model` = `{ extremes: [{th, h, type:"high"|"low", time:"HH:MM"}], nowTh, rising }` where `th` = hours-from-midnight, `time` = display "HH:MM", `nowTh` = current time in hours, `rising` = boolean. `opts`: `width/height`. Emits classes only: `tc-area`, `tc-line`, `tc-label-main`, `tc-label-sub`, `tc-axis`, `tc-now-dot`, `tc-now-ring`, `tc-now-label`. Curve sampled every 0.5 h across 0..24 via `tideHeightAt`; extremes inside (0,24) get a two-line "PM/BM HH:MM" + "H,H m" label; extremes at/outside the edges get a time-only label; the now dot+ring sits on the curve at `nowTh` with a "HH:MM ↗/↘" label; x labels at 0/6/12/18/24 h.

- [ ] **Step 1: failing tests (append)**
```js
import { tideCurve } from "../js/charts/tidecurve.js";

function sampleTide() {
  return {
    extremes: [
      { th: -2.4, h: 4.7, type: "high", time: "21:36" },
      { th: 3.5, h: 1.1, type: "low", time: "03:30" },
      { th: 9.7, h: 4.8, type: "high", time: "09:42" },
      { th: 16.0, h: 1.2, type: "low", time: "15:58" },
      { th: 22.1, h: 4.7, type: "high", time: "22:05" },
      { th: 28.3, h: 1.1, type: "low", time: "04:18" },
    ],
    nowTh: 7.2, rising: true,
  };
}

test("tideCurve emits an area + line path and starts with <svg>", () => {
  const svg = tideCurve(sampleTide());
  assert.ok(svg.startsWith("<svg"));
  assert.match(svg, /class="tc-area"/);
  assert.match(svg, /class="tc-line"/);
});

test("tideCurve annotates interior highs/lows with PM/BM + time", () => {
  const svg = tideCurve(sampleTide());
  assert.ok(svg.includes("PM 09:42"));
  assert.ok(svg.includes("BM 15:58"));
});

test("tideCurve draws the now dot + ring + rising arrow", () => {
  const svg = tideCurve(sampleTide());
  assert.match(svg, /class="tc-now-dot"/);
  assert.match(svg, /class="tc-now-ring"/);
  assert.ok(svg.includes("↗"));
});

test("tideCurve labels the x-axis every 6 hours", () => {
  const svg = tideCurve(sampleTide());
  for (const l of ["0h", "6h", "12h", "18h", "24h"]) assert.ok(svg.includes(`>${l}</text>`));
});
```

- [ ] **Step 2: run → fail** (builder tests fail; the 4 helper tests still pass).

- [ ] **Step 3: implement (append to `web/js/charts/tidecurve.js`)**
```js
export function tideCurve(model, opts = {}) {
  const W = opts.width ?? 300, H = opts.height ?? 118;
  const L = 10, R = 10, B = 20, TOP = 26;
  const YMAX = 5.4; // metres, headroom above typical Glénan HW ~4.8
  const pts = model.extremes;
  const x = (th) => L + (th / 24) * (W - L - R);
  const y = (h) => TOP + (H - B - TOP) * (1 - h / YMAX);
  const f = (n) => n.toFixed(1);

  let line = "", area = "";
  for (let th = 0; th <= 24.001; th += 0.5) {
    const px = f(x(th)), py = f(y(tideHeightAt(pts, th)));
    line += (th === 0 ? "M" : " L") + px + " " + py;
  }
  const baseY = H - B;
  area = `${line} L${f(x(24))} ${baseY} L${f(x(0))} ${baseY} Z`;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${opts.ariaLabel ?? "Courbe de marée du jour"}" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  s += `<path class="tc-area" d="${area}"/><path class="tc-line" d="${line}"/>`;

  for (const e of pts) {
    if (e.th <= 0 || e.th >= 24) {
      if (e.th > -1 && e.th < 25) {
        s += `<text class="tc-label-sub" x="${f(x(Math.min(24, Math.max(0, e.th))))}" y="${f(y(e.h) - 6)}" text-anchor="middle">${e.time}</text>`;
      }
      continue;
    }
    const tag = e.type === "high" ? "PM" : "BM";
    const yTop = e.type === "high" ? y(e.h) - 12 : y(e.h) - 16;
    s += `<text class="tc-label-main" x="${f(x(e.th))}" y="${f(yTop)}" text-anchor="middle">${tag} ${e.time}</text>`;
    s += `<text class="tc-label-sub" x="${f(x(e.th))}" y="${f(yTop + 11)}" text-anchor="middle">${e.h.toFixed(1).replace(".", ",")} m</text>`;
  }

  const nx = f(x(model.nowTh)), ny = f(y(tideHeightAt(pts, model.nowTh)));
  s += `<circle class="tc-now-dot" cx="${nx}" cy="${ny}" r="5"/><circle class="tc-now-ring" cx="${nx}" cy="${ny}" r="8.5"/>`;
  const nowH = String(Math.floor(model.nowTh)).padStart(2, "0") + ":" + String(Math.round((model.nowTh % 1) * 60)).padStart(2, "0");
  s += `<text class="tc-now-label" x="${f(x(model.nowTh) - 12)}" y="${f(y(tideHeightAt(pts, model.nowTh)) - 10)}" text-anchor="end">${nowH} ${model.rising ? "↗" : "↘"}</text>`;

  for (const th of [0, 6, 12, 18, 24]) {
    s += `<text class="tc-axis" x="${f(x(th))}" y="${H - 3}" text-anchor="middle">${th}h</text>`;
  }
  return s + `</svg>`;
}
```

- [ ] **Step 4: run → pass** (`# pass 8` in tidecurve.test.js: 4 helper + 4 builder). Full suite `npm test` (42).
- [ ] **Step 5: commit**
```bash
git add web/js/charts/tidecurve.js web/test/tidecurve.test.js
git commit -m "feat(tide): cosine tide-curve SVG builder (area/line/annotations/now-dot)"
```

---

## Task 3: tide tokens + tidecurve CSS

**Files:** Modify `web/css/tokens.css` (+`--tide-area`,`--tide-line` both blocks); Create `web/css/tidecurve.css`; Modify `web/index.html` (link).

**Interfaces:** token-driven styling for `tc-*`. No test; verified by serving.

- [ ] **Step 1:** add to `tokens.css` after `--compare:` in each block —
  LIGHT: `--tide-area: #85B7EB;  --tide-line: #185FA5;`
  DARK:  `--tide-area: #0C447C;  --tide-line: #378ADD;`
- [ ] **Step 2:** create `web/css/tidecurve.css`:
```css
.tc-area { fill: var(--tide-area); opacity: 0.45; }
.tc-line { fill: none; stroke: var(--tide-line); stroke-width: 2; }
.tc-axis { fill: var(--axis-label); font-size: 11px; }
.tc-label-main { fill: var(--text-primary); font-size: 11px; font-weight: 500; }
.tc-label-sub  { fill: var(--text-secondary); font-size: 11px; }
.tc-now-dot  { fill: var(--now); }
.tc-now-ring { fill: none; stroke: var(--now); stroke-width: 1.4; }
.tc-now-label { fill: var(--now); font-size: 11px; font-weight: 500; }
```
- [ ] **Step 3:** in `web/index.html`, add after the `meteogram.css` link: `<link rel="stylesheet" href="./css/tidecurve.css" />`.
- [ ] **Step 4:** serve check: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/css/tidecurve.css` → `200 text/css; charset=utf-8`; `curl -s http://localhost:5173/css/tokens.css | grep -c -- "--tide-line"` → `2`. `npm test` still 42.
- [ ] **Step 5:** commit
```bash
git add web/css/tokens.css web/css/tidecurve.css web/index.html
git commit -m "feat(tide): tide-curve tokens + theme CSS"
```

---

## Task 4: Cloudflare Worker — /api/tide (maree.info scraper)

**Files:** Create `worker/wrangler.toml`, `worker/src/index.js`, `worker/src/tide.js`, `worker/test/tide.test.js`, `worker/test/fixtures/maree-94.html`.

**Interfaces:**
- `parseTide(html)` (pure, in `worker/src/tide.js`) → `{ port, today, coef: [n...], extremes: [{ type:"high"|"low", time:"HH:MM", iso:"YYYY-MM-DDTHH:MM", h:Number }] }`. Throws if it can't find the tide data.
- `worker/src/index.js` `export default { fetch(request, env, ctx) }`: routes `GET /api/tide?port=NN`, adds CORS, caches 6 h, returns the parsed JSON or `{error}` JSON.

**This task discovers the parser against the LIVE page** — maree.info is undocumented. The live page (verified) carries the data BOTH as an embedded `var Marees = { … }` JS object AND as an HTML table; pick whichever parses more robustly and keep ALL parsing in `parseTide` so it's a one-function fix when the site changes.

- [ ] **Step 1: capture a real fixture**

From `worker/`:
```bash
mkdir -p test/fixtures
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0" "https://maree.info/94" -o test/fixtures/maree-94.html
wc -c test/fixtures/maree-94.html   # expect ~25-40 KB
```
Open the fixture and locate the tide data: search for `var Marees`, and for the table rows containing times like `07h32`, heights like `4,36 m`, and coefficients. Note the exact structure you'll parse (record it in your report). Confirm the port name (page `<title>` contains "Penfret").

- [ ] **Step 2: write the parser test against the fixture (RED)**

`worker/test/tide.test.js` — assert the SHAPE + the KNOWN values you read out of the fixture in Step 1 (fill these in from the actual captured file — they are real, not invented):
```js
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
```

- [ ] **Step 3: implement `worker/src/tide.js`** — write `parseTide(html)` to extract, from the real structure you identified in Step 1, the port name (from `<title>`), the coefficient(s), and the extremes (type from PM/BM or rising/falling, `HH:MM`, height in metres parsing the French `4,36` decimal comma, and an `iso` timestamp built from the page's date context). Keep every selector/regex here. Times/heights use French formats (`07h32`, `4,36 m`) — normalise to `HH:MM` and a `Number`. Run `node --test worker/test/tide.test.js` → GREEN.

- [ ] **Step 4: implement `worker/src/index.js` (router + CORS + cache)**
```js
import { parseTide } from "./tide.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname !== "/api/tide") return json({ error: "not found" }, 404);

    const port = (url.searchParams.get("port") || "94").replace(/[^0-9]/g, "") || "94";
    const cache = caches.default;
    const cacheKey = new Request(`https://tide.cache/${port}`, request);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    try {
      const res = await fetch(`https://maree.info/${port}`, { headers: { "User-Agent": UA } });
      if (!res.ok) return json({ error: `maree.info HTTP ${res.status}` }, 502);
      const data = parseTide(await res.text());
      const out = json(data, 200, { "Cache-Control": "public, max-age=21600" });
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    } catch (e) {
      return json({ error: `tide parse failed: ${String(e.message || e)}` }, 502);
    }
  },
};
```

- [ ] **Step 5: `worker/wrangler.toml`**
```toml
name = "glenans"
main = "src/index.js"
compatibility_date = "2025-01-01"
```

- [ ] **Step 6: local Worker sanity (network-permitting)** — from `worker/`, `npx --yes wrangler dev --port 8787 &` then `curl -s "http://localhost:8787/api/tide?port=94"` and confirm JSON with `port`, `coef`, `extremes`. If `wrangler` can't run in this environment, note it and rely on the fixture test. Stop the dev server.

- [ ] **Step 7: full suite + commit** — `npm test` (from repo root) must still discover only `web/test/**`; the Worker tests run via `node --test worker/test/tide.test.js` (run both, report both). Then:
```bash
git add worker/wrangler.toml worker/src/index.js worker/src/tide.js worker/test/tide.test.js worker/test/fixtures/maree-94.html
git commit -m "feat(worker): Cloudflare Worker with /api/tide maree.info scraper"
```
(Report the real values your fixture test asserts, and the structure `parseTide` targets, so the reviewer can verify against the captured fixture.)

---

## Task 5: tide adapter + tide card + app wiring

**Files:** Create `web/js/sources/tide.js`, `web/js/cards/tide.js`; Modify `web/js/app.js`, `web/js/i18n.js`.

**Interfaces:**
- `sources/tide.js`: `fetchTide(port)` → `Promise<normalised>` — `GET ${WORKER_URL}/api/tide?port=${port}` (import `WORKER_URL` from `../../config.js`); throws if `WORKER_URL` is empty or the response carries `{error}` or is non-OK. Returns the Worker's `{port, today, coef, extremes}` unchanged.
- `cards/tide.js`: `mountTideCard(settings)` → `{ state, refresh }`. Renders a title row `Marée · {escapeHTML(port)}` + a `coef NN` badge, the tide curve (converting extremes → `{th: hoursFromMidnight, h, type, time}` + `nowTh` from `new Date()` + `rising` from the slope), loading skeleton, and `errorHTML(lang,"https://maree.info/94")` on any failure. Never throws.

- [ ] **Step 1: `web/js/sources/tide.js`**
```js
import { WORKER_URL } from "../../config.js";
export async function fetchTide(port = "94") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/tide?port=${encodeURIComponent(port)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `tide HTTP ${res.status}`);
  return data;
}
```

- [ ] **Step 2: `web/js/cards/tide.js`**
```js
import { fetchTide } from "../sources/tide.js";
import { hoursFromMidnight, tideHeightAt, tideCurve } from "../charts/tidecurve.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-tide";
const SOURCE = "https://maree.info/94";

function titleRow(lang, port, coef) {
  const badge = coef && coef.length
    ? `<span class="chip chip--coef">${t(lang, "tide_coef")} ${coef[0]}</span>` : "";
  return `<div class="card__title-row"><span class="card__title">${t(lang, "tide_title")} · ${escapeHTML(port || "")}</span>${badge}</div>`;
}

function toModel(data) {
  const pts = data.extremes
    .map((e) => ({ th: hoursFromMidnight(e.iso, data.today), h: e.h, type: e.type, time: e.time }))
    .sort((a, b) => a.th - b.th);
  const now = new Date();
  const nowTh = (now.getHours() + now.getMinutes() / 60);
  const rising = tideHeightAt(pts, nowTh + 0.05) >= tideHeightAt(pts, nowTh);
  return { extremes: pts, nowTh, rising };
}

export async function renderTide(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, `<div class="card__title-row"><span class="card__title">${t(lang, "tide_title")}</span></div>` + skeletonHTML(0, true));
  try {
    const data = await fetchTide(state.settings.port);
    const svg = tideCurve(toModel(data), { lang });
    mountCard(CARD_ID, titleRow(lang, data.port, data.coef) + svg, { fade: true });
  } catch {
    mountCard(CARD_ID, `<div class="card__title-row"><span class="card__title">${t(lang, "tide_title")}</span></div>` + errorHTML(lang, SOURCE));
  }
}

export function mountTideCard(settings) {
  const state = { settings };
  renderTide(state);
  return { state, refresh: () => renderTide(state) };
}
```

- [ ] **Step 3:** i18n — `tide_title`/`tide_coef` already exist (Phase 1). No new keys required. (Confirm they exist; if not, add `tide_title:{fr:"Marée",en:"Tide"}`, `tide_coef:{fr:"coef",en:"coef"}`.)

- [ ] **Step 4:** a small CSS touch — in `web/css/tidecurve.css` add `.chip--coef { background: var(--coef-bg); color: var(--coef-text); }` so the coef badge uses the coefficient tokens.

- [ ] **Step 5:** wire into `app.js` exactly like the forecast card: remove the `card-tide` line from `renderSkeletons()`; `import { mountTideCard } from "./cards/tide.js";`; add `let tideCard = null;`; in `renderAll()` after the forecast-card block, add the same mount-once/else-refresh pattern for `tideCard = mountTideCard(state.settings)`; in `btn-refresh` also call `tideCard.refresh()`. (Mirror the forecast card's wiring precisely.)

- [ ] **Step 6: headless smoke** — throwaway `.superpowers/sdd/smoke-tide.mjs` (git-excluded): stub `document`, stub `fetch` to return a canned Worker tide payload (port "Penfret", coef `[72]`, a handful of extremes spanning yesterday-late→tomorrow-early), import `mountTideCard`, wait, assert the card HTML includes `Marée · Penfret`, a `coef 72` badge, `class="tc-line"`, and a now dot; then stub `fetch` to reject and assert the error fallback. Run it → prints an OK line.

- [ ] **Step 7:** `npm test` (42, unchanged — the card is DOM). Commit:
```bash
git add web/js/sources/tide.js web/js/cards/tide.js web/js/app.js web/js/i18n.js web/css/tidecurve.css
git commit -m "feat(tide): tide source + card + app wiring"
```

- [ ] **Step 8: browser check (controller/manual)** — with a deployed Worker URL in `config.js`, the tide card shows the Penfret day curve with PM/BM annotations, a coef badge, and the rising/falling now-dot; without a Worker URL it shows the graceful "Source indisponible ↗" fallback. (The Worker deploy is the user's step; the card degrades correctly until then.)

---

## Self-review against the spec
- §3.3 maree.info port 94 (**Penfret**), HW/LW times+heights + coefficient, 6 h cache, structured errors, CORS → Task 4. ✅
- §3.3 cosine interpolation, span 00:00–24:00 incl. bracketing extremes → Tasks 1, 5. ✅
- §6 tide curve: area+line, PM/BM annotations, edge time-only, now dot+ring + ↗/↘, x labels, coef badge, tokens-only colours → Tasks 2, 3, 5. ✅
- §4 independent load/fail (incl. no WORKER_URL) → Task 5. ✅
- carried-forward escapeHTML introduced + used on the scraped port name → Tasks 1, 5. ✅
- **Deferred:** SHOM fallback (code comment only, noted); station/port SELECTOR UI (settings panel — later); live-wind/BMS/isobars/PWA are their own phases.

**Placeholder note:** Task 4's `parseTide` body is intentionally discovered against the live page (undocumented source) with a REAL captured fixture driving its test — the honest treatment for a scrape, not a placeholder. Every other task carries complete code.

## Next phases
- **Phase 4 — Isobar card** (Worker `/api/chart` + Met Office run resolver, image + stepper).
- **Phase 5 — Live wind + Bulletin** (Worker `/api/livewind` windmorbihan feed + auto-refresh; `/api/bms` Météo-France rwg + token; alert strip). escapeHTML already in place for the scraped BMS text.
- **Phase 6 — PWA & docs**.

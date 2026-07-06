# Glénans Dashboard — Phase 5: Live Wind + Bulletin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live-wind and bulletin skeleton cards with the real Drénec anemometer (windmorbihan, via Worker) and the Météo-France marine bulletin (rwg API, via Worker), and light the amber alert strip when a gale warning is active.

**Architecture:** Two new Worker routes proxy CORS-locked / token-gated upstreams and return normalised JSON: `/api/livewind?nid=6` (windmorbihan observations, latest reading) and `/api/bms?zone=BMSCOTE-01-04` (Météo-France XML → situation + gale status). Two new frontend cards consume them, mirroring the existing tide/isobar card pattern. The live-wind card auto-refreshes every 5 min; the bulletin card drives the global `#alert-strip`. All scraped/external text passes through `escapeHTML` before any DOM sink.

**Tech Stack:** existing Cloudflare Worker (`worker/src/*`, `wrangler`) + vanilla ES frontend. Node `node --test` for pure logic.

## Global Constraints

- **No new runtime deps** in `/web` and `/worker`; no build step. (spec §2)
- **No hardcoded hex outside `web/css/tokens.css`** — components reference CSS custom properties only. Available tokens include `--text-primary`, `--text-secondary`, `--text-body`, `--accent`, `--gust`, `--danger`, `--bms-none-bg`, `--bms-none-text`, `--alert-bg`, `--alert-text`. (tokens.css)
- **Cards load/fail independently:** skeleton → on error `errorHTML(lang, sourceHref)`; a `render*` function never throws. (spec §4)
- **CORS:** every Worker response carries `Access-Control-Allow-Origin: *` and structured `{error}` JSON on failure (the shared `CORS`/`json` helpers in `worker/src/index.js` already do this). (spec §2)
- **Bulletin text stays in French** regardless of UI language; it is source text, never translated, and is routed through `escapeHTML`. (spec §3.4, §7)
- **The Météo-France Bearer token is a Worker-side constant** (overridable by `env.MF_TOKEN`); it is NEVER shipped to `/web`. (spec §3.4)
- Live wind: **Worker cache 2 min**; frontend **auto-refresh every 5 min** + manual refresh; a reading **older than 20 min renders in the danger colour**. (spec §3.2)
- Bulletin: **Worker cache 30 min**. (spec §3.4)
- Card order is fixed in `index.html` (forecast → livewind → tide → bulletin → isobar); do not reorder. (spec §4)

## Verified upstream contracts (captured live 2026-07-05)

**Live wind — windmorbihan (CORS-locked to windmorbihan.com → must proxy):**
```
GET https://backend.windmorbihan.com/observations/chart.json?sensor=6&time_frame=60
→ 200 application/json; an array (oldest→newest) of readings:
  {"ts":1783281996,"ws":{"moy":7,"max":7},"wd":{"moy":261},"wv":{"moy":""}, ...}
  ts  = epoch SECONDS;  ws.moy = mean knots;  ws.max = gust knots;  wd.moy = direction ° true.
  Latest reading = LAST array element. sensor=6 is Drénec (LCJ 1-min anemometer, île Drénec 47.718,-4.009).
```

**Bulletin — Météo-France rwg (401 without token):**
```
GET https://rwg.meteofrance.com/internet2018client/2.0/report
      ?domain=BMRCOTE-01-04&report_type=marine&report_subtype=BMR_cote_fr&format=xml
    Header: Authorization: Bearer <JWT>
    Token mint (rotates ~hourly): GET meteofrance.com sets an `mfsession` cookie
    whose ROT13 (letters only) IS the Bearer JWT. The Worker mints fresh per
    request; env.MF_TOKEN overrides. (No hardcoded token — the captured one dies in ~1h.)
→ 200 application/xml. Relevant CDATA elements:
  <titreBulletin>      Bulletin côte "Penmarc'h – Aiguillon" soir
  <situation>          the "situation générale" paragraph  ← main card text
  <bulletinSpecial>    "Pas d'avis de vent fort en cours ni prévu."  ← gale status, INLINE
  Zone map: page zone BMSCOTE-01-04 → API domain BMRCOTE-01-04 (BMS→BMR prefix swap).
  Active warning ⇔ <bulletinSpecial> does NOT match /pas d'avis/i.
```

## File structure
```
worker/src/livewind.js        # NEW: parseLiveWind(), liveWindURL()
worker/src/bms.js             # NEW: parseBMS(), bmsURL(), bmsDomain(), mfToken()
worker/src/index.js           # MODIFY: add /api/livewind + /api/bms routes (pass env to bms)
worker/test/livewind.test.js  # NEW
worker/test/bms.test.js       # NEW (+ fixture worker/test/fixtures/bms-sample.xml)
web/js/util/time.js           # NEW: minutesAgo() (pure)
web/js/sources/livewind.js    # NEW: fetchLiveWind(), STATION_NID
web/js/sources/bms.js         # NEW: fetchBMS()
web/js/cards/livewind.js      # NEW: mountLiveWindCard() (+ 5-min auto-refresh)
web/js/cards/bulletin.js      # NEW: mountBulletinCard() (+ drives #alert-strip)
web/css/livewind.css          # NEW
web/css/bulletin.css          # NEW
web/test/livewind.test.js     # NEW (minutesAgo)
web/js/app.js                 # MODIFY: mount both cards; drop renderSkeletons; wire refresh
web/js/settings.js            # MODIFY: add zone default
web/js/i18n.js                # MODIFY: add see_less key
web/index.html                # MODIFY: <link> livewind.css + bulletin.css
```

Reuse (do NOT re-implement): `degToCardinal(deg)` is exported from `web/js/charts/meteogram.js`; `escapeHTML(s)` from `web/js/util/html.js`; `mountCard/skeletonHTML/errorHTML` from `web/js/card.js`; `t(lang,key)` from `web/js/i18n.js`; the `CORS`/`json`/`UA` helpers and `caches.default` pattern in `worker/src/index.js`.

Existing i18n keys already present (do not re-add): `livewind_title` ("Vent actuel"/"Live wind"), `livewind_gust` ("raf."/"gust"), `livewind_updated` ("mis à jour il y a"/"updated"), `livewind_ago` ("min"/"min ago"), `bulletin_title` ("Situation générale"/"General situation"), `bms_none` ("BMS : aucun"), `bms_active` ("BMS en cours"), `see_more` ("voir plus"/"see more").

---

## Task 1: Worker `/api/livewind` (windmorbihan proxy)

**Files:**
- Create: `worker/src/livewind.js`, `worker/test/livewind.test.js`
- Modify: `worker/src/index.js`

**Interfaces:**
- Produces: `parseLiveWind(jsonText) → { mean:number, gust:number, dir:number|null, ts:number }` (latest reading; throws on empty/garbage). `liveWindURL(nid) → string`.
- Consumes: `CORS`, `UA`, `json()`, `caches.default` from `worker/src/index.js`.

- [ ] **Step 1: Write the failing test** — `worker/test/livewind.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveWind, liveWindURL } from "../src/livewind.js";

const sample = JSON.stringify([
  { ts: 1783281876, ws: { moy: 7, max: 8 }, wd: { moy: 261 } },
  { ts: 1783281996, ws: { moy: 6, max: 9 }, wd: { moy: 264 } },
]);

test("parseLiveWind returns the newest (last) reading", () => {
  const r = parseLiveWind(sample);
  assert.equal(r.mean, 6);
  assert.equal(r.gust, 9);
  assert.equal(r.dir, 264);
  assert.equal(r.ts, 1783281996);
});

test("parseLiveWind tolerates a missing/empty direction", () => {
  const r = parseLiveWind(JSON.stringify([{ ts: 100, ws: { moy: 5, max: 6 }, wd: { moy: "" } }]));
  assert.equal(r.dir, null);
  assert.equal(r.mean, 5);
});

test("parseLiveWind throws on an empty array", () => {
  assert.throws(() => parseLiveWind("[]"));
});

test("liveWindURL builds the observations URL for a sensor", () => {
  assert.equal(liveWindURL(6),
    "https://backend.windmorbihan.com/observations/chart.json?sensor=6&time_frame=60");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test worker/test/livewind.test.js`
Expected: FAIL — cannot find module `../src/livewind.js`.

- [ ] **Step 3: Write the implementation** — `worker/src/livewind.js`:
```js
// windmorbihan observations feed: array of readings, oldest→newest. We surface
// only the latest. Fields: ts (epoch seconds), ws.moy/ws.max (knots, mean/gust),
// wd.moy (degrees true). Empty strings appear when a sensor lacks that channel.
export function liveWindURL(nid) {
  return `https://backend.windmorbihan.com/observations/chart.json?sensor=${nid}&time_frame=60`;
}

export function parseLiveWind(jsonText) {
  const arr = JSON.parse(jsonText);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("no readings");
  const last = arr[arr.length - 1];
  const mean = Number(last?.ws?.moy);
  const gust = Number(last?.ws?.max);
  const dir = Number(last?.wd?.moy);
  const ts = Number(last?.ts);
  if (!Number.isFinite(mean) || !Number.isFinite(ts)) throw new Error("bad reading");
  return {
    mean,
    gust: Number.isFinite(gust) ? gust : mean,
    dir: Number.isFinite(dir) ? dir : null,
    ts,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test worker/test/livewind.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Add the route** — in `worker/src/index.js`, add the import at the top (next to the existing chart import):
```js
import { parseLiveWind, liveWindURL } from "./livewind.js";
```
Add this handler (mirror `handleChart`'s shape — cache key, browser UA, `ctx.waitUntil`):
```js
async function handleLiveWind(url, request, ctx) {
  const nid = (url.searchParams.get("nid") || "6").replace(/[^0-9]/g, "") || "6";
  const cache = caches.default;
  const cacheKey = new Request(`https://livewind.cache/${nid}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(liveWindURL(nid), { headers: { "User-Agent": UA } });
    if (!res.ok) return json({ error: `windmorbihan HTTP ${res.status}` }, 502);
    const data = parseLiveWind(await res.text());
    const out = json({ nid: Number(nid), ...data }, 200, { "Cache-Control": "public, max-age=120" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `livewind failed: ${String(e.message || e)}` }, 502);
  }
}
```
Register it in the router (before the 404), keeping the existing routes intact:
```js
if (url.pathname === "/api/livewind") return handleLiveWind(url, request, ctx);
```

- [ ] **Step 6: Local sanity** — from `worker/`: `npx wrangler dev`, then in another shell:
  - `curl "http://localhost:8787/api/livewind?nid=6"` → JSON `{"nid":6,"mean":…,"gust":…,"dir":…,"ts":…}`.
  - `curl -o /dev/null -w "%{http_code}\n" "http://localhost:8787/api/livewind?nid=6"` → `200`.
  Stop `wrangler dev` (and kill any stray dev server on 8787).

- [ ] **Step 7: Commit**
```bash
git add worker/src/livewind.js worker/test/livewind.test.js worker/src/index.js
git commit -m "feat(worker): /api/livewind windmorbihan observations proxy"
```

---

## Task 2: Worker `/api/bms` (Météo-France bulletin proxy)

**Files:**
- Create: `worker/src/bms.js`, `worker/test/bms.test.js`, `worker/test/fixtures/bms-sample.xml`
- Modify: `worker/src/index.js`

**Interfaces:**
- Produces: `parseBMS(xml) → { title:string, situation:string, special:string, warning:boolean }` (throws if both title and situation are empty). `bmsDomain(zone) → string`, `bmsURL(zone) → string`, `mfToken(env) → string`.
- Consumes: `CORS`, `UA`, `json()`, `caches.default` from `worker/src/index.js`; the router's `env`.

- [ ] **Step 1: Capture the fixture** — save this exact XML to `worker/test/fixtures/bms-sample.xml` (a trimmed real response — enough for the parser):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bulletin producteurBulletin="CNP" langueBulletin="FR" typeBulletin="cote" soustypeBulletin="BMR" zoneBulletin="4">
<titreBulletin><![CDATA[Bulletin côte "Penmarc'h – Aiguillon" soir]]></titreBulletin>
<chapeauBulletin><![CDATA[Origine Météo-France.]]></chapeauBulletin>
<bulletinSpecial><![CDATA[Pas d'avis de vent fort en cours ni prévu. ]]></bulletinSpecial>
<echeance idEcheance="sit1" nomEcheance="situation générale">
    <titreEcheance><![CDATA[Situation générale le dimanche 5 juillet 2026]]></titreEcheance>
    <region idRegion="cot4">
    <situation><![CDATA[Anticyclone 1028 hPa au sud de l'Irlande, s'affaissant sur place, prévu 1022 hPa demain midi.]]></situation>
    </region>
</echeance>
</bulletin>
```

- [ ] **Step 2: Write the failing test** — `worker/test/bms.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBMS, bmsDomain, bmsURL } from "../src/bms.js";

const xml = readFileSync(new URL("./fixtures/bms-sample.xml", import.meta.url), "utf8");

test("parseBMS extracts title + situation", () => {
  const b = parseBMS(xml);
  assert.match(b.title, /Penmarc'h/);
  assert.match(b.situation, /Anticyclone 1028 hPa/);
});

test("parseBMS flags no warning when bulletinSpecial says 'Pas d'avis'", () => {
  assert.equal(parseBMS(xml).warning, false);
  assert.match(parseBMS(xml).special, /Pas d'avis/);
});

test("parseBMS flags a warning when bulletinSpecial is anything else", () => {
  const active = xml.replace("Pas d'avis de vent fort en cours ni prévu. ",
    "Avis de coup de vent en cours.");
  assert.equal(parseBMS(active).warning, true);
});

test("parseBMS throws when the document has no title and no situation", () => {
  assert.throws(() => parseBMS("<bulletin></bulletin>"));
});

test("bmsDomain maps the page zone BMS→BMR", () => {
  assert.equal(bmsDomain("BMSCOTE-01-04"), "BMRCOTE-01-04");
});

test("bmsURL builds the rwg report URL", () => {
  assert.equal(bmsURL("BMSCOTE-01-04"),
    "https://rwg.meteofrance.com/internet2018client/2.0/report?domain=BMRCOTE-01-04&report_type=marine&report_subtype=BMR_cote_fr&format=xml");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test worker/test/bms.test.js`
Expected: FAIL — cannot find module `../src/bms.js`.

- [ ] **Step 4: Write the implementation** — `worker/src/bms.js`:
```js
// Météo-France marine bulletin (rwg API). The page zone (BMSCOTE-01-04) maps to
// the API domain (BMRCOTE-01-04, "bulletin marine rivage/côte"). The gale-warning
// status lives INLINE in <bulletinSpecial>; "Pas d'avis…" means no warning.
// The Bearer JWT has iat but no exp, so a Worker-side constant is acceptable;
// override with env.MF_TOKEN. The token is never shipped to the frontend.
const MF_TOKEN_DEFAULT =
  "eyJhbGciOiJIUzI1NiIsImNsYXNzIjoiaW50ZXJuZXQiLCJ0eXAiOiJKV1QifQ.eyJpYXQiOjE3ODMyODE3ODAsImp0aSI6ImNmMGY1ZTczNTA0NjAwZTUxYWZjNTAzNmY5YmNlZTFlIn0.cy0vnfMvA8eU5hG8Y2bjDffQ7f7O_07H3nzPRN1N4N8";

export function mfToken(env) {
  return (env && env.MF_TOKEN) || MF_TOKEN_DEFAULT;
}

export function bmsDomain(zone) {
  return String(zone).replace(/[^A-Za-z0-9-]/g, "").replace(/^BMS/i, "BMR");
}

export function bmsURL(zone) {
  return `https://rwg.meteofrance.com/internet2018client/2.0/report?domain=${bmsDomain(zone)}&report_type=marine&report_subtype=BMR_cote_fr&format=xml`;
}

function cdata(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  return m ? m[1].trim() : "";
}

export function parseBMS(xml) {
  const title = cdata(xml, "titreBulletin");
  const situation = cdata(xml, "situation");
  const special = cdata(xml, "bulletinSpecial");
  if (!title && !situation) throw new Error("bms parse: empty");
  const warning = special ? !/pas d'avis/i.test(special) : false;
  return { title, situation, special, warning };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test worker/test/bms.test.js`
Expected: PASS (6/6).

- [ ] **Step 6: Add the route** — in `worker/src/index.js`, add the import:
```js
import { parseBMS, bmsURL, mfToken } from "./bms.js";
```
Add the handler (note it takes `env` for the token):
```js
async function handleBMS(url, request, env, ctx) {
  const zone = (url.searchParams.get("zone") || "BMSCOTE-01-04").replace(/[^A-Za-z0-9-]/g, "") || "BMSCOTE-01-04";
  const cache = caches.default;
  const cacheKey = new Request(`https://bms.cache/${zone}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(bmsURL(zone), {
      headers: {
        "User-Agent": UA,
        "Authorization": `Bearer ${mfToken(env)}`,
        "Origin": "https://meteofrance.com",
        "Referer": "https://meteofrance.com/",
        "Accept": "*/*",
      },
    });
    if (!res.ok) return json({ error: `meteofrance HTTP ${res.status}` }, 502);
    const data = parseBMS(await res.text());
    const out = json(data, 200, { "Cache-Control": "public, max-age=1800" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `bms failed: ${String(e.message || e)}` }, 502);
  }
}
```
Register it in the router, passing `env`:
```js
if (url.pathname === "/api/bms") return handleBMS(url, request, env, ctx);
```

- [ ] **Step 7: Local sanity** — from `worker/`: `npx wrangler dev`, then:
  - `curl "http://localhost:8787/api/bms?zone=BMSCOTE-01-04"` → JSON with `situation` text, `warning:false`, and `"BMS":` absent.
  - `curl -o /dev/null -w "%{http_code}\n" "http://localhost:8787/api/bms"` → `200`.
  Stop `wrangler dev`; kill any stray 8787 server.

- [ ] **Step 8: Commit**
```bash
git add worker/src/bms.js worker/test/bms.test.js worker/test/fixtures/bms-sample.xml worker/src/index.js
git commit -m "feat(worker): /api/bms Météo-France bulletin proxy + gale status"
```

---

## Task 3: Frontend live-wind card + 5-min auto-refresh

**Files:**
- Create: `web/js/util/time.js`, `web/js/sources/livewind.js`, `web/js/cards/livewind.js`, `web/css/livewind.css`, `web/test/livewind.test.js`
- Modify: `web/js/app.js`, `web/index.html`

**Interfaces:**
- Consumes: Worker `/api/livewind?nid=6` → `{nid,mean,gust,dir,ts}`; `degToCardinal` from `charts/meteogram.js`; `mountCard/skeletonHTML/errorHTML`, `t`.
- Produces: `minutesAgo(tsSeconds, nowMs?) → number` (pure). `fetchLiveWind(station?) → Promise<{nid,mean,gust,dir,ts}>`. `STATION_NID` map. `mountLiveWindCard(settings) → { state, refresh, stop }`.

- [ ] **Step 1: Write the failing test** — `web/test/livewind.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { minutesAgo } from "../js/util/time.js";

const NOW = 1_000_000_000_000; // fixed clock (ms)

test("minutesAgo rounds elapsed whole minutes", () => {
  assert.equal(minutesAgo(NOW / 1000 - 120, NOW), 2);
  assert.equal(minutesAgo(NOW / 1000 - 20, NOW), 0);
});

test("minutesAgo never returns negative for a future timestamp", () => {
  assert.equal(minutesAgo(NOW / 1000 + 300, NOW), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/test/livewind.test.js`
Expected: FAIL — cannot find module `../js/util/time.js`.

- [ ] **Step 3: Write `web/js/util/time.js`:**
```js
// Whole minutes between an epoch-SECONDS timestamp and now. Never negative.
export function minutesAgo(tsSeconds, nowMs = Date.now()) {
  return Math.max(0, Math.round((nowMs - tsSeconds * 1000) / 60000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/test/livewind.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Write `web/js/sources/livewind.js`:**
```js
import { WORKER_URL } from "../../config.js";

// windmorbihan station slug → sensor nid. Drénec (nid 6) is the LCJ anemometer
// on île Drénec, in the Glénan — the reference reading for sailing there.
export const STATION_NID = { Drenec: 6 };

export async function fetchLiveWind(station = "Drenec") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const nid = STATION_NID[station] ?? STATION_NID.Drenec;
  const res = await fetch(`${WORKER_URL}/api/livewind?nid=${nid}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `livewind HTTP ${res.status}`);
  return data;
}
```

- [ ] **Step 6: Write `web/js/cards/livewind.js`:**
```js
import { fetchLiveWind } from "../sources/livewind.js";
import { degToCardinal } from "../charts/meteogram.js";
import { minutesAgo } from "../util/time.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-livewind";
const SOURCE = "https://www.windmorbihan.com/Drenec";
const STALE_MIN = 20;
const REFRESH_MS = 5 * 60 * 1000;

function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "livewind_title")}</span></div>`;
}

function bodyHTML(lang, d) {
  const age = minutesAgo(d.ts);
  const staleCls = age >= STALE_MIN ? " lw-stamp--stale" : "";
  const dirLine = d.dir == null ? "" :
    `<div class="lw-dir">` +
      `<span class="lw-arrow" style="transform:rotate(${d.dir}deg)">↑</span>` +
      `<span>${degToCardinal(d.dir)} ${d.dir}°</span>` +
    `</div>`;
  return plainTitle(lang) +
    `<div class="lw-main">` +
      `<span class="lw-speed">${d.mean}</span><span class="lw-unit">kn</span>` +
      `<span class="lw-gust">${t(lang, "livewind_gust")} ${d.gust}</span>` +
    `</div>` +
    dirLine +
    `<div class="lw-stamp${staleCls}">${t(lang, "livewind_updated")} ${age} ${t(lang, "livewind_ago")}</div>`;
}

export async function renderLiveWind(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(2));
  try {
    const d = await fetchLiveWind(state.settings.station);
    mountCard(CARD_ID, bodyHTML(lang, d), { fade: true });
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
  }
}

export function mountLiveWindCard(settings) {
  const state = { settings };
  renderLiveWind(state);
  const timer = setInterval(() => renderLiveWind(state), REFRESH_MS);
  return { state, refresh: () => renderLiveWind(state), stop: () => clearInterval(timer) };
}
```

- [ ] **Step 7: Write `web/css/livewind.css`** (tokens only — no hex):
```css
.lw-main { display: flex; align-items: baseline; gap: 8px; margin-top: 4px; }
.lw-speed { font-size: 44px; font-weight: 700; line-height: 1; color: var(--text-primary); }
.lw-unit { font-size: 16px; color: var(--text-secondary); }
.lw-gust { margin-left: auto; font-size: 14px; color: var(--gust); }
.lw-dir { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 14px; color: var(--text-body); }
.lw-arrow { display: inline-block; font-size: 18px; color: var(--accent); }
.lw-stamp { margin-top: 6px; font-size: 12px; color: var(--text-secondary); }
.lw-stamp--stale { color: var(--danger); font-weight: 600; }
```

- [ ] **Step 8: Link the stylesheet** — in `web/index.html`, after the `isobar.css` link:
```html
  <link rel="stylesheet" href="./css/livewind.css" />
```

- [ ] **Step 9: Wire `web/js/app.js`** — (a) add import next to the other card imports:
```js
import { mountLiveWindCard } from "./cards/livewind.js";
```
(b) add a module-scope handle: `let livewindCard = null;` (beside `let tideCard = null;`).
(c) in `renderSkeletons`, remove the `card-livewind` line (the card now mounts its own skeleton). After Task 4 removes the `card-bulletin` line too, `renderSkeletons` will be empty — leave that cleanup to Task 4.
(d) in `renderAll`, add after the forecast block (order forecast → livewind → tide → bulletin → isobar):
```js
  if (!livewindCard) {
    livewindCard = mountLiveWindCard(state.settings);
  } else {
    livewindCard.state.settings = state.settings;
    livewindCard.refresh();
  }
```
(e) in the `btn-refresh` handler, add: `if (livewindCard) livewindCard.refresh();`

- [ ] **Step 10: Run the web suite**

Run: `npm test`
Expected: PASS — 46 tests (44 prior + 2 minutesAgo).

- [ ] **Step 11: Headless smoke** — create `.superpowers/sdd/smoke-livewind.mjs` (temp-set `WORKER_URL`, stub `document` + `fetch`; restore config in `finally`):
```js
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const CONFIG = new URL("../../web/config.js", import.meta.url);
const ORIGINAL = readFileSync(CONFIG, "utf8");
writeFileSync(CONFIG, 'export const WORKER_URL = "https://test.worker";\n');
try {
  const card = { innerHTML: "", classList: { add() {}, remove() {} }, get offsetWidth() { return 0; } };
  globalThis.document = { getElementById: (id) => (id === "card-livewind" ? card : null) };
  const nowTs = Math.floor(Date.now() / 1000) - 120; // 2 min old
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ nid: 6, mean: 7, gust: 9, dir: 264, ts: nowTs }) });

  const { mountLiveWindCard } = await import("../../web/js/cards/livewind.js");
  const handle = mountLiveWindCard({ lang: "fr", station: "Drenec" });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(card.innerHTML.includes('class="lw-speed">7'), "shows mean speed 7");
  assert.ok(card.innerHTML.includes("raf. 9"), "shows gust");
  assert.ok(card.innerHTML.includes("W ") && card.innerHTML.includes("264°"), "shows cardinal + degrees");
  assert.ok(!card.innerHTML.includes("lw-stamp--stale"), "fresh reading not marked stale");

  // stale reading (>20 min) → danger class
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ nid: 6, mean: 4, gust: 5, dir: 90, ts: Math.floor(Date.now()/1000) - 25*60 }) });
  await handle.refresh();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(card.innerHTML.includes("lw-stamp--stale"), "stale reading marked");

  // failure path → fallback, no throw
  globalThis.fetch = async () => { throw new Error("worker down"); };
  await handle.refresh();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(card.innerHTML.includes("Source indisponible"), "error fallback");
  handle.stop();
  console.log("LIVEWIND SMOKE OK: speed+gust+dir, stale flag, error fallback");
} finally { writeFileSync(CONFIG, ORIGINAL); }
```
Run: `node .superpowers/sdd/smoke-livewind.mjs` → prints `LIVEWIND SMOKE OK…`. (264° → `degToCardinal` yields "W"; a 2-min reading is not stale; the 25-min reading is.)

- [ ] **Step 12: Commit**
```bash
git add web/js/util/time.js web/js/sources/livewind.js web/js/cards/livewind.js web/css/livewind.css web/test/livewind.test.js web/js/app.js web/index.html
git commit -m "feat(livewind): Drénec anemometer card + 5-min auto-refresh + app wiring"
```

---

## Task 4: Frontend bulletin card + alert strip

**Files:**
- Create: `web/js/sources/bms.js`, `web/js/cards/bulletin.js`, `web/css/bulletin.css`
- Modify: `web/js/app.js`, `web/js/settings.js`, `web/js/i18n.js`, `web/index.html`

**Interfaces:**
- Consumes: Worker `/api/bms?zone=BMSCOTE-01-04` → `{title,situation,special,warning}`; `escapeHTML` from `util/html.js`; `mountCard/skeletonHTML/errorHTML`, `t`; the global `#alert-strip` element in `index.html`.
- Produces: `fetchBMS(zone?) → Promise<{title,situation,special,warning}>`. `mountBulletinCard(settings) → { state, refresh }`.

- [ ] **Step 1: Add settings + i18n** — in `web/js/settings.js`, add `zone: "BMSCOTE-01-04",` to the `DEFAULTS` object (beside `port`). In `web/js/i18n.js`, add to `DICT` (beside `see_more`):
```js
  see_less:         { fr: "voir moins",           en: "see less" },
```

- [ ] **Step 2: Write `web/js/sources/bms.js`:**
```js
import { WORKER_URL } from "../../config.js";

// Marine bulletin from the Worker (Météo-France rwg proxy). Text stays French.
export async function fetchBMS(zone = "BMSCOTE-01-04") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/bms?zone=${encodeURIComponent(zone)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `bms HTTP ${res.status}`);
  return data;
}
```

- [ ] **Step 3: Write `web/js/cards/bulletin.js`** (all source text through `escapeHTML`; drives `#alert-strip`):
```js
import { fetchBMS } from "../sources/bms.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-bulletin";
const SOURCE = "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04";

function pill(lang, warning) {
  const cls = warning ? "bms-pill--active" : "bms-pill--none";
  const label = warning ? t(lang, "bms_active") : t(lang, "bms_none");
  return `<span class="bms-pill ${cls}">${label}</span>`;
}
function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "bulletin_title")}</span></div>`;
}
function titleRow(lang, warning) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "bulletin_title")}</span>${pill(lang, warning)}</div>`;
}

// The amber alert strip is a global element; the bulletin card owns it.
function setAlertStrip(warning, special) {
  const el = document.getElementById("alert-strip");
  if (!el) return;
  if (warning) { el.textContent = special; el.hidden = false; }
  else { el.textContent = ""; el.hidden = true; }
}

export async function renderBulletin(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(3));
  try {
    const d = await fetchBMS(state.settings.zone);
    const body = titleRow(lang, d.warning) +
      `<p class="bms-text" data-clamped="true">${escapeHTML(d.situation)}</p>` +
      `<button class="linkbtn bms-more" data-act="more">${t(lang, "see_more")}</button>`;
    mountCard(CARD_ID, body, { fade: true });
    setAlertStrip(d.warning, d.special);
    bindMore(state);
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
    setAlertStrip(false, "");
  }
}

function bindMore(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  const p = card.querySelector(".bms-text");
  const btn = card.querySelector(".bms-more");
  if (!p || !btn) return;
  btn.addEventListener("click", () => {
    const clamped = p.getAttribute("data-clamped") === "true";
    p.setAttribute("data-clamped", clamped ? "false" : "true");
    btn.textContent = t(state.settings.lang, clamped ? "see_less" : "see_more");
  });
}

export function mountBulletinCard(settings) {
  const state = { settings };
  renderBulletin(state);
  return { state, refresh: () => renderBulletin(state) };
}
```

- [ ] **Step 4: Write `web/css/bulletin.css`** (tokens only):
```css
.bms-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.bms-pill--none { background: var(--bms-none-bg); color: var(--bms-none-text); }
.bms-pill--active { background: var(--alert-bg); color: var(--alert-text); }
.bms-text { font-size: 14px; line-height: 1.5; color: var(--text-body); white-space: pre-line; margin-top: 6px; }
.bms-text[data-clamped="true"] {
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.bms-more { margin-top: 4px; }
```

- [ ] **Step 5: Link the stylesheet** — in `web/index.html`, after the `livewind.css` link:
```html
  <link rel="stylesheet" href="./css/bulletin.css" />
```

- [ ] **Step 6: Wire `web/js/app.js`** — (a) import:
```js
import { mountBulletinCard } from "./cards/bulletin.js";
```
(b) module-scope handle `let bulletinCard = null;`.
(c) `renderSkeletons` now has both its lines removed (livewind in Task 3, bulletin here) → it is empty. Delete the `renderSkeletons` function definition and its call inside `renderAll`.
(d) in `renderAll`, add the bulletin block AFTER the tide block (order forecast → livewind → tide → bulletin → isobar):
```js
  if (!bulletinCard) {
    bulletinCard = mountBulletinCard(state.settings);
  } else {
    bulletinCard.state.settings = state.settings;
    bulletinCard.refresh();
  }
```
(e) in `btn-refresh`, add: `if (bulletinCard) bulletinCard.refresh();`

- [ ] **Step 7: Run the web suite**

Run: `npm test`
Expected: PASS — still 46 (no new unit tests this task; bulletin logic is covered by the Worker `parseBMS` tests + the smoke below).

- [ ] **Step 8: Headless smoke** — create `.superpowers/sdd/smoke-bulletin.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const CONFIG = new URL("../../web/config.js", import.meta.url);
const ORIGINAL = readFileSync(CONFIG, "utf8");
writeFileSync(CONFIG, 'export const WORKER_URL = "https://test.worker";\n');
try {
  const cards = {};
  const mk = () => ({ innerHTML: "", hidden: true, textContent: "",
    classList: { add() {}, remove() {} }, get offsetWidth() { return 0; },
    _btn: null,
    querySelector(sel) {
      if (sel === ".bms-text") return { getAttribute: () => "true", setAttribute() {} };
      if (sel === ".bms-more") return { addEventListener() {} };
      return null;
    } });
  cards["card-bulletin"] = mk();
  cards["alert-strip"] = mk();
  globalThis.document = { getElementById: (id) => cards[id] || null };

  // no warning
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    title: "T", situation: "Anticyclone 1028 hPa <b>test</b>", special: "Pas d'avis de vent fort.", warning: false }) });
  const { mountBulletinCard } = await import("../../web/js/cards/bulletin.js");
  const handle = mountBulletinCard({ lang: "fr", zone: "BMSCOTE-01-04" });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(cards["card-bulletin"].innerHTML.includes("bms-pill--none"), "green pill when no warning");
  assert.ok(cards["card-bulletin"].innerHTML.includes("&lt;b&gt;test&lt;/b&gt;"), "situation HTML-escaped");
  assert.equal(cards["alert-strip"].hidden, true, "alert strip hidden when no warning");

  // active warning → amber strip
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    title: "T", situation: "S", special: "Avis de coup de vent en cours.", warning: true }) });
  await handle.refresh();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(cards["card-bulletin"].innerHTML.includes("bms-pill--active"), "amber pill when warning");
  assert.equal(cards["alert-strip"].hidden, false, "alert strip shown when warning");
  assert.match(cards["alert-strip"].textContent, /coup de vent/, "strip carries the special text");

  // failure → fallback + strip hidden
  globalThis.fetch = async () => { throw new Error("down"); };
  await handle.refresh();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(cards["card-bulletin"].innerHTML.includes("Source indisponible"), "error fallback");
  assert.equal(cards["alert-strip"].hidden, true, "strip hidden on error");
  console.log("BULLETIN SMOKE OK: escaped situation, green/amber pill, alert strip toggle, fallback");
} finally { writeFileSync(CONFIG, ORIGINAL); }
```
Run: `node .superpowers/sdd/smoke-bulletin.mjs` → prints `BULLETIN SMOKE OK…`.

- [ ] **Step 9: Commit**
```bash
git add web/js/sources/bms.js web/js/cards/bulletin.js web/css/bulletin.css web/js/app.js web/js/settings.js web/js/i18n.js web/index.html
git commit -m "feat(bulletin): Météo-France situation card + BMS pill + alert strip"
```

---

## Self-review vs spec

- §3.2 live wind via Worker (2-min cache), Drénec nid, mean/gust/dir, "mis à jour il y a X min", 5-min auto-refresh, >20 min → danger → Tasks 1, 3. ✅
- §3.4 bulletin via Worker (30-min cache), token as Worker constant (never frontend), zone BMS→BMR, situation générale, French text, gale status → alert strip + pill → Tasks 2, 4. ✅
- §4 card order preserved; alert strip only when warning active; independent load/fail → Tasks 3, 4. ✅
- §7 source text (BMS) not translated + routed through `escapeHTML` → Task 4. ✅
- Global: no new deps, no hex outside tokens.css, `render*` never throws → all tasks. ✅
- Deferred to Phase 6: PWA manifest + service worker + README + deploy. Live-wind auto-refresh uses `setInterval` (card exposes `stop()` for completeness; app mounts once so no leak).

## Expected suite after Phase 5
- web: **46** (44 + 2 minutesAgo). worker: **19** (9 + 4 livewind + 6 bms). Plus smokes `smoke-livewind.mjs`, `smoke-bulletin.mjs`.

## Next: Phase 6 (PWA manifest + service worker + README + deploy).

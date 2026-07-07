# Glénans Dashboard — Phase 9: Location Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the user search any place and have all five cards follow it: forecast (lat/lon), live wind (nearest of 29 windmorbihan stations, or "no local station" outside coverage), tide (nearest of 140 maree.info ports), bulletin (containing/nearest of 9 BMS zones). Penfret stays the default.

**Architecture:** Tapping the header location opens a search box (Open-Meteo geocoding, called directly — CORS `*`). Picking a result stores `{lat, lon, place}` and *resolves* the nearest station / port / zone from three static lookup tables via a pure nearest-point helper. Each card reads its resolved id from settings. The live-wind card shows the station name and degrades to a "no local station" message beyond the windmorbihan network.

**Tech Stack:** vanilla ES frontend, existing Worker (unchanged). Node `node --test` for the pure geo + resolution logic. One build script (Node) generates the ports table once.

## Global Constraints
- **No new runtime deps**; no build step for the app (the ports build script is a dev tool; its output is committed static data). (spec §2)
- **All external calls already used** stay as-is; geocoding is a direct browser call to `geocoding-api.open-meteo.com` (CORS `*`, verified). (recon 2026-07-07)
- **Penfret is the default** (`lat 47.716, lon -3.950, place "Penfret · Glénan"`, station Drénec/nid 6, port 94, zone BMSCOTE-01-04). (user)
- Colours via tokens; source/derived strings through `escapeHTML` before DOM sinks. (spec §6/§7)
- Cards load/fail independently; `render*` never throws. (spec §4)

## Verified data (recon 2026-07-07)
- **Geocoding:** `GET https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=6&language=fr` → `{results:[{name,admin1,admin2,latitude,longitude,country_code}]}`, CORS `*`.
- **windmorbihan stations:** `https://backend.windmorbihan.com/capteurs/list.json` → `sensors.WindSensor` = 29 stations, each `{nid,label,lat,lng}`, coverage lat 47.02–48.04 / lng −4.73…−2.15 (South Brittany). Readings via existing `/api/livewind?nid=<nid>`.
- **maree.info ports:** `https://maree.info/` lists 140 ports as `<a href="/<id>" id="Port<id>_0" class="Port …">Name</a>`; each port page carries `<meta itemprop="latitude" content="…">`/`longitude`.
- **BMS zones:** 9 total (metropolitan + Corsica); Glénan ⊂ `BMSCOTE-01-04` (Penmarc'h / Anse de l'Aiguillon).

## File structure
```
scripts/build-ports.mjs        # NEW: dev tool → fetches the 140 port coords → web/js/data/ports.js
web/js/data/stations.js        # NEW: 29 windmorbihan stations (static)
web/js/data/ports.js           # NEW (generated): 140 maree.info ports
web/js/data/bmszones.js        # NEW: 9 BMS zones (static, representative coords)
web/js/util/geo.js             # NEW: haversineKm(), nearest()
web/js/sources/geocode.js      # NEW: searchPlaces()
web/js/location.js             # NEW: resolveLocation()
web/js/cards/locationsearch.js # NEW: openLocationSearch() modal
web/css/location.css           # NEW
web/js/sources/livewind.js     # MODIFY: fetchLiveWind(nid) by nid + null handling
web/js/cards/livewind.js       # MODIFY: station name from settings; "no local station"
web/js/app.js                  # MODIFY: header tappable → search; persist resolved ids
web/js/settings.js             # MODIFY: defaults (stationNid/label, port, zone)
web/js/i18n.js                 # MODIFY: search/location/no-station strings
web/index.html                 # MODIFY: <link> location.css; make header-place a button
web/test/geo.test.js           # NEW
web/test/location.test.js      # NEW
```

---

## Task 1: Geo helper + static datasets (stations, zones) + ports build

**Files:** Create `web/js/util/geo.js`, `web/js/data/stations.js`, `web/js/data/bmszones.js`, `scripts/build-ports.mjs`, `web/js/data/ports.js` (generated), `web/test/geo.test.js`.

**Interfaces:**
- Produces: `haversineKm(aLat,aLon,bLat,bLon)→number`; `nearest(lat,lon,items)→{item,km}` (items have `.lat`,`.lon`). `STATIONS` (29 `{nid,label,lat,lon}`), `PORTS` (140 `{id,label,lat,lon}`), `BMS_ZONES` (9 `{code,title,lat,lon}`).

- [ ] **Step 1: geo helper + test** — `web/js/util/geo.js`:
```js
export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371, d = Math.PI / 180;
  const dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Nearest item (each with .lat/.lon) to a point; returns { item, km }.
export function nearest(lat, lon, items) {
  let best = null, bestKm = Infinity;
  for (const it of items) {
    const km = haversineKm(lat, lon, it.lat, it.lon);
    if (km < bestKm) { bestKm = km; best = it; }
  }
  return best ? { item: best, km: bestKm } : null;
}
```
`web/test/geo.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, nearest } from "../js/util/geo.js";

test("haversineKm is ~0 for the same point and ~sane for a known pair", () => {
  assert.ok(haversineKm(47.7, -4.0, 47.7, -4.0) < 0.001);
  // Drénec (47.718,-4.009) → Concarneau (47.875,-3.919) ≈ 18 km
  assert.ok(Math.abs(haversineKm(47.718, -4.009, 47.875, -3.919) - 18) < 4);
});

test("nearest picks the closest item", () => {
  const items = [
    { id: "a", lat: 48.0, lon: -4.5 },
    { id: "b", lat: 47.72, lon: -4.0 },
    { id: "c", lat: 46.0, lon: -1.0 },
  ];
  const r = nearest(47.716, -3.95, items);
  assert.equal(r.item.id, "b");
  assert.ok(r.km < 6);
});
```
Run: `node --test web/test/geo.test.js` → PASS.

- [ ] **Step 2: stations dataset** — `web/js/data/stations.js` (the 29 windmorbihan WindSensor stations; `nid`, `label`, `lat`, `lon`). Generate by running this once from the repo root and pasting the printed array:
```bash
node -e 'const u="https://backend.windmorbihan.com/capteurs/list.json";fetch(u,{headers:{"User-Agent":"Mozilla/5.0"}}).then(r=>r.json()).then(d=>{const w=d.sensors.WindSensor;const a=Object.values(w).map(s=>({nid:s.nid,label:s.label,lat:s.lat,lon:s.lng})).sort((x,y)=>x.nid-y.nid);process.stdout.write("export const STATIONS = "+JSON.stringify(a,null,0)+";\n");})'
```
Wrap the printed output as the file body (prepend a comment):
```js
// windmorbihan WindSensor network (29 stations). Live readings via the Worker
// /api/livewind?nid=<nid>. Generated from capteurs/list.json (2026-07-07).
export const STATIONS = [ /* …printed array… */ ];
export const STATION_COVERAGE_KM = 45; // beyond this, treat as "no local station"
```

- [ ] **Step 3: BMS zones dataset** — `web/js/data/bmszones.js` (9 zones; representative mid-segment coord each):
```js
// Météo-France coastal bulletin zones (9). `lat/lon` is a representative point on
// each zone's coast segment; the nearest zone to a location wins.
export const BMS_ZONES = [
  { code: "BMSCOTE-01-01", title: "Frontière belge / Baie de Somme",        lat: 50.9, lon: 1.9 },
  { code: "BMSCOTE-01-02", title: "Baie de Somme / Cap de la Hague",        lat: 49.6, lon: -0.5 },
  { code: "BMSCOTE-01-03", title: "Cap de la Hague / Penmarc'h",            lat: 48.6, lon: -3.9 },
  { code: "BMSCOTE-01-04", title: "Penmarc'h / Anse de l'Aiguillon",        lat: 47.3, lon: -2.6 },
  { code: "BMSCOTE-01-05", title: "Anse de l'Aiguillon / Frontière espagnole", lat: 45.0, lon: -1.2 },
  { code: "BMSCOTE-02-01", title: "Frontière espagnole / Port-Camargue",    lat: 43.2, lon: 3.7 },
  { code: "BMSCOTE-02-02", title: "Port-Camargue / Saint-Raphaël",          lat: 43.3, lon: 5.9 },
  { code: "BMSCOTE-02-03", title: "Saint-Raphaël / Menton",                 lat: 43.6, lon: 7.2 },
  { code: "BMSCOTE-02-04", title: "Corse",                                  lat: 42.1, lon: 9.0 },
];
```

- [ ] **Step 4: ports build script** — `scripts/build-ports.mjs` (fetches the 140 port coords once; keep it resumable + polite):
```js
import { writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0";
const dec = (s) => s.replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&ecirc;/g, "ê")
  .replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç").replace(/&ocirc;/g, "ô").replace(/&icirc;/g, "î")
  .replace(/&#039;/g, "'").replace(/&amp;/g, "&");

const home = await (await fetch("https://maree.info/", { headers: { "User-Agent": UA } })).text();
const re = /<a href="\/(\d{1,4})" id="Port\d+_0"[^>]*>([^<]+)<\/a>/g;
const seen = new Set(), list = [];
let m;
while ((m = re.exec(home))) { if (!seen.has(m[1])) { seen.add(m[1]); list.push({ id: m[1], label: dec(m[2]) }); } }

const ports = [];
for (const p of list) {
  try {
    const html = await (await fetch(`https://maree.info/${p.id}`, { headers: { "User-Agent": UA } })).text();
    const la = html.match(/itemprop="latitude" content="([-\d.]+)"/);
    const lo = html.match(/itemprop="longitude" content="([-\d.]+)"/);
    if (la && lo) ports.push({ id: p.id, label: p.label, lat: Number(la[1]), lon: Number(lo[1]) });
  } catch { /* skip a port that fails; nearest-match still works */ }
}
writeFileSync(new URL("../web/js/data/ports.js", import.meta.url),
  "// maree.info ports (Channel + Atlantic coast). Generated by scripts/build-ports.mjs.\n" +
  "export const PORTS = " + JSON.stringify(ports) + ";\n");
console.log(`wrote ${ports.length} ports`);
```
Run: `node scripts/build-ports.mjs` → prints `wrote ~140 ports`; creates `web/js/data/ports.js`. Confirm port 94 (Penfret) is present.

- [ ] **Step 5: Run + commit**
```bash
npm test   # geo tests pass
git add web/js/util/geo.js web/js/data/stations.js web/js/data/bmszones.js web/js/data/ports.js scripts/build-ports.mjs web/test/geo.test.js
git commit -m "feat(location): geo helper + station/port/zone datasets"
```

---

## Task 2: Geocoding source + location resolver

**Files:** Create `web/js/sources/geocode.js`, `web/js/location.js`, `web/test/location.test.js`.

**Interfaces:**
- Produces: `searchPlaces(query)→Promise<Array<{name,label,lat,lon}>>` (`label` = "Name, admin"). `resolveLocation({lat,lon})→{stationNid:number|null, stationLabel:string, port:string, zone:string}` (nearest station within `STATION_COVERAGE_KM` else null; nearest port id; nearest zone code).

- [ ] **Step 1: geocode source** — `web/js/sources/geocode.js`:
```js
// Open-Meteo geocoding — called directly (CORS *). Returns [] on any failure.
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.results || []).map((r) => ({
      name: r.name,
      label: [r.name, r.admin2 || r.admin1].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: resolver + test** — `web/js/location.js`:
```js
import { STATIONS, STATION_COVERAGE_KM } from "./data/stations.js";
import { PORTS } from "./data/ports.js";
import { BMS_ZONES } from "./data/bmszones.js";
import { nearest } from "./util/geo.js";

// Resolve a lat/lon to the nearest live-wind station (within coverage, else null),
// tide port, and bulletin zone.
export function resolveLocation({ lat, lon }) {
  const st = nearest(lat, lon, STATIONS.map((s) => ({ ...s })));
  const inCoverage = st && st.km <= STATION_COVERAGE_KM;
  const port = nearest(lat, lon, PORTS);
  const zone = nearest(lat, lon, BMS_ZONES);
  return {
    stationNid: inCoverage ? st.item.nid : null,
    stationLabel: inCoverage ? st.item.label : "",
    port: port ? port.item.id : "94",
    zone: zone ? zone.item.code : "BMSCOTE-01-04",
  };
}
```
`web/test/location.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocation } from "../js/location.js";

test("Penfret/Glénan resolves to Drénec + a South-Brittany zone", () => {
  const r = resolveLocation({ lat: 47.716, lon: -3.95 });
  assert.equal(r.stationNid, 6, "nearest station is Drénec");
  assert.equal(r.zone, "BMSCOTE-01-04", "South-Brittany bulletin zone");
  assert.ok(r.port, "a tide port resolved");
});

test("a far-inland/foreign point has no local wind station", () => {
  const r = resolveLocation({ lat: 45.76, lon: 4.83 }); // Lyon
  assert.equal(r.stationNid, null, "no windmorbihan station within coverage");
});
```
Run: `node --test web/test/location.test.js` → PASS.

- [ ] **Step 3: commit**
```bash
npm test
git add web/js/sources/geocode.js web/js/location.js web/test/location.test.js
git commit -m "feat(location): geocoding source + nearest station/port/zone resolver"
```

---

## Task 3: Location search modal + header wiring + card fallbacks

**Files:** Create `web/js/cards/locationsearch.js`, `web/css/location.css`. Modify `web/js/sources/livewind.js`, `web/js/cards/livewind.js`, `web/js/app.js`, `web/js/settings.js`, `web/js/i18n.js`, `web/index.html`.

**Interfaces:**
- Consumes: `searchPlaces`, `resolveLocation`, `mountCard`/`t`/`escapeHTML`.
- Produces: `openLocationSearch(settings, onPick)` — modal; `onPick({lat,lon,place})` fires when a result is chosen.

- [ ] **Step 1: settings defaults** — in `web/js/settings.js` `DEFAULTS`, replace the `station`/`port`/`zone` trio with the resolved shape (Penfret):
```js
  place: "Penfret · Glénan",
  lat: 47.716,
  lon: -3.950,
  stationNid: 6,
  stationLabel: "Drénec",
  port: "94",
  zone: "BMSCOTE-01-04",
```
(Remove the old `station: "Drenec"` key.)

- [ ] **Step 2: live-wind by nid** — in `web/js/sources/livewind.js`, replace the slug/STATIONS lookup with a direct nid:
```js
export async function fetchLiveWind(nid) {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  if (nid == null) throw new Error("no station");
  const res = await fetch(`${WORKER_URL}/api/livewind?nid=${encodeURIComponent(nid)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `livewind HTTP ${res.status}`);
  return data;
}
```
(Drop the `STATIONS`/`stationLabel` exports here — the label now lives in settings.)

- [ ] **Step 3: live-wind card — name + "no local station"** — in `web/js/cards/livewind.js`: title uses `state.settings.stationLabel`; when `stationNid == null`, render a muted "no local station" note instead of fetching:
```js
import { fetchLiveWind } from "../sources/livewind.js";
// …
export async function renderLiveWind(state) {
  const { lang, stationNid, stationLabel } = state.settings;
  if (stationNid == null) {
    mountCard(CARD_ID, plainTitle(lang, "") +
      `<p class="lw-none">${t(lang, "livewind_none")}</p>`);
    return;
  }
  mountCard(CARD_ID, plainTitle(lang, stationLabel) + skeletonHTML(2));
  try {
    const d = await fetchLiveWind(stationNid);
    mountCard(CARD_ID, bodyHTML(lang, d, stationLabel), { fade: true });
  } catch {
    mountCard(CARD_ID, plainTitle(lang, stationLabel) + errorHTML(lang, SOURCE));
  }
}
```
Add `.lw-none { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }` to `web/css/livewind.css`.

- [ ] **Step 4: i18n** — add to `web/js/i18n.js`:
```js
  location_title:   { fr: "Changer de lieu",       en: "Change location" },
  location_search:  { fr: "Rechercher un lieu…",   en: "Search a place…" },
  location_none:    { fr: "Aucun résultat",        en: "No results" },
  livewind_none:    { fr: "Pas de station d'observation à proximité.",
                      en: "No nearby observation station." },
```

- [ ] **Step 5: search modal** — `web/js/cards/locationsearch.js`:
```js
import { searchPlaces } from "../sources/geocode.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

export function openLocationSearch(settings, onPick) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.className = "loc-modal";
  host.innerHTML = `<div class="loc-panel">` +
    `<div class="loc-head"><span class="loc-title">${t(lang, "location_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<input class="loc-input" type="search" autocomplete="off" placeholder="${t(lang, "location_search")}" />` +
    `<ul class="loc-results"></ul></div>`;
  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  const input = host.querySelector(".loc-input");
  const list = host.querySelector(".loc-results");
  let seq = 0;
  const run = async (q) => {
    const mine = ++seq;
    const results = await searchPlaces(q);
    if (mine !== seq) return; // a newer keystroke won
    list.innerHTML = results.length
      ? results.map((r, i) =>
          `<li><button class="loc-item" data-i="${i}">${escapeHTML(r.label)}</button></li>`).join("")
      : `<li class="loc-empty">${t(lang, "location_none")}</li>`;
    list.querySelectorAll(".loc-item").forEach((b) => b.addEventListener("click", () => {
      const r = results[Number(b.getAttribute("data-i"))];
      close();
      onPick({ lat: r.lat, lon: r.lon, place: r.label });
    }));
  };
  let timer = null;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 250); });
  input.focus();
}
```

- [ ] **Step 6: header wiring** — `web/index.html`: make the place a button (`<button id="header-place" class="app-header__place" type="button"></button>`), and add `<link rel="stylesheet" href="./css/location.css" />`. In `web/js/app.js`:
  - import `openLocationSearch` + `resolveLocation`.
  - in `wireEvents`, bind the header place:
```js
  const place = document.getElementById("header-place");
  if (place) place.addEventListener("click", () => openLocationSearch(state.settings, (loc) => {
    const derived = resolveLocation(loc);
    state.settings = { ...state.settings, ...loc, ...derived };
    saveSetting("place", loc.place); saveSetting("lat", loc.lat); saveSetting("lon", loc.lon);
    saveSetting("stationNid", derived.stationNid); saveSetting("stationLabel", derived.stationLabel);
    saveSetting("port", derived.port); saveSetting("zone", derived.zone);
    renderAll();
  }));
```
  (Confirm `saveSetting` persists each key and returns the merged settings; if it only accepts one key, call it per key as above and then `state.settings = loadSettings()`.)

- [ ] **Step 7: CSS** — `web/css/location.css`:
```css
.app-header__place { background: transparent; border: none; cursor: pointer; font: inherit; text-align: left; }
.loc-modal { position: fixed; inset: 0; background: rgba(4,44,83,0.55); display: flex;
  align-items: flex-start; justify-content: center; z-index: 60; padding: 16px; }
.loc-panel { background: var(--card-bg); border: 0.5px solid var(--card-border); border-radius: var(--radius);
  max-width: 460px; width: 100%; padding: 14px; margin-top: 40px; }
.loc-head { display: flex; align-items: center; justify-content: space-between; }
.loc-title { font-weight: 700; color: var(--text-primary); }
.loc-input { width: 100%; margin-top: 10px; padding: 10px; font: inherit; font-size: 15px;
  border: 0.5px solid var(--card-border); border-radius: 8px; background: var(--page-bg); color: var(--text-primary); }
.loc-results { list-style: none; margin: 8px 0 0; padding: 0; }
.loc-results li { border-top: 0.5px solid var(--card-border); }
.loc-item { width: 100%; text-align: left; background: transparent; border: none; cursor: pointer;
  font: inherit; font-size: 14px; color: var(--text-body); padding: 10px 4px; min-height: 44px; }
.loc-empty { font-size: 13px; color: var(--text-secondary); padding: 10px 4px; }
```

- [ ] **Step 8: verify + smoke + commit** — `npm test` (60 + geo/location tests). Update `.superpowers/sdd/smoke-livewind.mjs` to pass `stationNid`/`stationLabel` in settings and assert the title shows the station + the null-station note path. Add `.superpowers/sdd/smoke-location.mjs` (stub `document.createElement`/`fetch`→geocoding; assert results render and picking one calls `onPick` with lat/lon). Commit:
```bash
git add web/js/cards/locationsearch.js web/css/location.css web/js/sources/livewind.js web/js/cards/livewind.js web/js/app.js web/js/settings.js web/js/i18n.js web/index.html web/css/livewind.css
git commit -m "feat(location): header search + resolve nearest station/port/zone + wiring"
```

---

## Self-review vs decisions
- Free search anywhere (geocoding) with Penfret default → Tasks 2–3. ✅
- Forecast lat/lon; tide nearest of 140 ports; bulletin nearest of 9 zones → Tasks 1–3. ✅
- Live wind nearest of 29 stations, name shown, "no local station" beyond coverage → Tasks 2–3. ✅
- No new runtime deps; datasets static/generated; direct geocoding (CORS verified) → all. ✅

## Suite after Phase 9
- web: 60 + geo(2) + location(2) ≈ 64. worker: 25 (unchanged — no Worker changes).

## Deploy: web auto-deploys via Pages on merge; Worker unchanged (no redeploy).
```

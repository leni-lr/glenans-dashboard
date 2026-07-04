# Glénans Morning Briefing — Design Specification

**Date:** 2026-07-03
**Status:** Approved for implementation planning
**Source brief:** `brief-glenans-dashboard.md`
**Design mockup:** `glenans_dashboard_detailed_variants.html`

## 1. Purpose

A personal, single-page, mobile-first weather briefing dashboard for a sailing
instructor at Penfret, Îles de Glénan (Brittany). Every morning it shows, on one
phone screen, everything needed to make the day's sailing decisions: the marine
bulletin, today's wind forecast, the live wind now, today's tide curve, and the
surface-pressure (isobar) chart.

No accounts, no database, no paid services, no custom domain. Function over form:
plain, fast, readable outdoors on a phone. Installable as a PWA.

## 2. Architecture

Two components in one public GitHub repo.

### `/web` — static frontend (GitHub Pages)
- **Vanilla HTML/CSS/JS. No build step.** No framework — the SVG charts are
  hand-rolled to match the approved mockup exactly (ports of the proven code in
  `glenans_dashboard_detailed_variants.html`), so a framework would add weight
  for no gain.
- PWA: manifest + service worker. The service worker caches the **app shell only**;
  data is always fetched fresh, with a graceful "données de HH:MM" (stale) fallback
  when offline.
- `config.js` holds a single `WORKER_URL` constant so a forker can point the app at
  their own Worker.
- All colours are CSS custom properties on `:root` with a `[data-theme="dark"]`
  override block. No hardcoded hex in components.

### `/worker` — Cloudflare Worker (`wrangler`, free tier, `*.workers.dev`)
CORS proxy + fetch/scrape layer for the sources that browsers cannot call directly.
Uses the Cache API with per-source TTLs, sends a normal browser `User-Agent`, and
returns **structured error JSON** on failure (never an opaque 500). Four endpoints:

| Endpoint | Source | Cache TTL |
|---|---|---|
| `GET /api/bms?zone=BMSCOTE-01-04` | Météo-France rwg API | 30 min |
| `GET /api/livewind?station=Drenec` | windmorbihan JSON feed | 2 min |
| `GET /api/tide?port=94` | maree.info HTML | 6 h |
| `GET /api/chart?step=T24` | UK Met Office GIF | 1 h |

Open-Meteo (forecast) is **not** proxied — it is CORS-enabled and called directly
from the browser.

### Frontend module layout
Small, single-responsibility files:
- `sources/` — one adapter per source: `openmeteo.js`, `livewind.js`, `tide.js`,
  `bms.js`, `chart.js`. Each returns normalised JSON. **All source-specific
  parsing/selector/endpoint logic lives only here**, so a broken source is a
  one-file fix.
- `charts/` — `meteogram.js`, `tidecurve.js` (inline-SVG renderers).
- `cards/` — one render+state module per card; each loads and fails independently.
- `i18n.js`, `theme.js`, `settings.js` (localStorage), `app.js` (wiring).

## 3. Data sources (verified 2026-07-03)

Confidence legend: ✅ contract fully verified against the live source today.

### 3.1 Wind forecast — Open-Meteo ✅ (direct, no key)
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- Default model: **AROME France HD** — `models=meteofrance_arome_france_hd`.
  Comparison models (verify identifiers against current docs at build):
  `meteofrance_arpege_europe`, `icon_eu`, `ecmwf_ifs025`, `gfs_global`.
- Hourly: `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`,
  `precipitation`, `cloud_cover`.
- Units: `wind_speed_unit=kn`, `timezone=Europe/Paris`.
- Default display: today, full 24 h. "7 j" expands to the full week. "+ comparer"
  overlays a second model.

### 3.2 Live wind — windmorbihan JSON feed ✅ (via Worker)
- The site loads **one JSON endpoint returning an array of all stations** (exact
  request URL to be captured at build; response shape confirmed). Each element:
  ```json
  { "nid": 73091304, "created": { "1783112461": "3 Juillet 2026 à 23h01" },
    "category": "mf_6mins", "wind_dir_true": 309,
    "wind_pow_knot": 14, "wind_pow_knot_max": 15,
    "timeline_heure": { "heure": "23", "timestamp": 1783029600 } }
  ```
- Adapter maps `wind_pow_knot` → mean (kn), `wind_pow_knot_max` → gust (kn),
  `wind_dir_true` → direction (deg, + derived cardinal), `created` key/value →
  reading epoch + display time.
- Station selection: filter the array by `nid`. A small hardcoded slug→nid map
  (default **Drénec**) lives in `sources/livewind.js`; Drénec's exact `nid` is
  resolved at build.
- Worker cache 2 min; frontend auto-refreshes card #4 every 5 min + manual refresh.
- If a reading is older than 20 min, the timestamp renders in the danger colour.

### 3.3 Tide — maree.info/94 ✅ (via Worker, HTML)
- Port `94` = **Concarneau** (matches the mockup title). Server-rendered HTML table;
  no JS needed. Verified values for 2026-07-03:
  BM 01h34 / 1,24 m · PM 07h32 / 4,36 m (coef 72) · BM 13h41 / 1,30 m ·
  PM 19h42 / 4,55 m (coef 71); next day BM 02h10 / 1,27 m · PM 08h08 / 4,33 m.
- Extract per day: HW/LW **times + heights** and the **tide coefficient**.
- Curve interpolation (cosine, per brief): for extremes `(t0,h0)→(t1,h1)`,
  `h(t) = (h0+h1)/2 + (h0−h1)/2·cos(π(t−t0)/(t1−t0))`. Include the previous day's
  last extreme and the next day's first so the curve spans 00:00–24:00 with no gaps.
- Fallback note (code comment only): SHOM open data, if maree.info scraping breaks.
- Worker cache 6 h.

### 3.4 Marine bulletin (BMS) — Météo-France rwg API ✅ (via Worker)
- Real endpoint (replaces HTML scraping):
  ```
  https://rwg.meteofrance.com/internet2018client/2.0/report
     ?domain=BMRCOTE-01-04&report_type=marine&report_subtype=BMR_cote_fr&format=xml
  ```
- **Zone mapping:** the page URL zone `BMSCOTE-01-04` → API domain `BMRCOTE-01-04`
  (BMR = *bulletin marine rivage/côte*). This carries the situation générale and
  wind / sea state / visibility / weather sections.
- **Auth:** requires `Authorization: Bearer <JWT>`. The token is minted fresh by
  meteofrance.com (`iat` present, **no `exp`**), so it is **not** hardcoded
  long-term. The Worker acquires a fresh token (from the meteofrance.com site,
  mechanism confirmed at build) and falls back to a configured token constant.
  Token-refresh + zone→domain mapping are isolated in `worker` config.
- **Gale/storm warnings ("BMS en cours"):** likely a separate `report_subtype`;
  confirmed at build. When active, the frontend shows the amber alert strip and the
  "BMS en cours" pill; otherwise "BMS : aucun" (green).
- Bulletin text stays in **French** regardless of UI language.
- Worker cache 30 min.

### 3.5 Isobars — UK Met Office ✅ (via Worker, image proxy)
- Real public GIF URL pattern (no auth):
  ```
  https://data.consumer-digital.api.metoffice.gov.uk/v1/surface-pressure/colour/
     {YYYY-MM-DDTHHMM}/FSXX12T_{HH}.gif
  ```
  where `{YYYY-MM-DDTHHMM}` is the latest analysis run (e.g. `2026-07-03T1200`) and
  `{HH}` ∈ `00,12,24,36,48,60,72` (forecast step). The Worker computes the latest
  available run and proxies the image (CORS + stability). Cache 1 h.
- UI: `<img>` with a centred time stepper (`◀ analyse T+0 · ven 06h ▶`),
  pinch-zoomable on mobile. Current step persisted in `localStorage` for the session.

## 4. UI (mobile-first, single column, exact order)

1. **Header** — location name + date/time, manual refresh, FR/EN toggle, settings
   (location, station, port, theme). Light: navy bar. Dark: no bar, text on page.
2. **Alert strip** — amber, high-visibility, only when a BMS warning is active.
3. **Wind forecast** — 24 h meteogram, model chip (AROME 1.3 selected),
   "+ comparer", "7 j".
4. **Live wind** — big current speed, gusts, direction arrow + cardinal + degrees,
   "mis à jour il y a X min".
5. **Tide** — day curve with HW/LW annotations, "now" dot (rising/falling arrow),
   coefficient badge.
6. **Bulletin** — "Situation générale" + BMS status pill; French text clamped to
   ~4 lines with a "voir plus" expander.
7. **Isobar** — Met Office chart + time stepper, pinch-zoomable.
8. **Footer** — credits + direct links to each original source page.

Each card **loads and fails independently**. On failure a card shows a muted
"Source indisponible — ouvrir sur le site ↗" message; the rest of the page is
unaffected. While loading, simple skeleton blocks (no spinners). A subtle fade-in
on data arrival is the only motion.

## 5. Location & selectors
- **Forecast location** (Open-Meteo only): default Penfret ≈ 47.716 N, −3.950 E
  (verify at build). Free search via Open-Meteo geocoding + manual lat/lon input.
- **Live-wind station** (windmorbihan slug list, default Drénec) and **tide port**
  (maree.info port id, default 94) are separate fixed-list selectors.
- All selections persist in `localStorage`.

## 6. Design system (approved mockup)

Two themes, one layout: **light ("Classique")** navy header + white cards on pale
blue; **dark ("Nuit")** one deep-navy surface with hairline-separated sections.
Theme = auto via `prefers-color-scheme` + manual override (auto/light/dark) in
settings, persisted. Full palette, per-token light/dark values, typography, and
component specs are taken verbatim from the brief's "Design specification" section
and the mockup file — implemented as CSS custom properties.

Key component specs (see brief for full detail):
- **Meteogram:** inline SVG, full width, ~120px. Mean wind = filled area + 2px line;
  gusts = dashed line above; gridlines at 10/20/30 kn (y auto-expands past 32 kn);
  downwind direction arrows (rotation = dir+180°) every ~2 h; x-labels every 6 h;
  green "now" line; tap tooltip (hour/mean/gust/dir); compare = thin `#7F77DD` line.
- **Tide curve:** inline SVG ~120px, 00:00–24:00, cosine curve + area fill + 2px
  line; HW/LW annotated on curve; "now" dot (r≈5) + ring (r≈8.5) in now-green with
  time + ↗/↘; x-labels every 6 h; coefficient badge in the title row.
- **Live wind, Bulletin, Isobar, Header:** per brief.

## 7. i18n
Simple FR/EN dictionary for all UI labels; toggle in header; persisted. Default
French. Source texts (BMS bulletin) stay in their original language.

## 8. Repo deliverables
- `/web` — static app (PWA manifest, service worker, `config.js`).
- `/worker` — Worker source + `wrangler.toml`.
- `README.md` — 10-minute setup for a stranger: fork → `wrangler deploy` → paste
  Worker URL into `config.js` → enable GitHub Pages. Includes a screenshot
  placeholder and a disclaimer that scraped/undocumented sources may break and this
  is a personal tool, not an official product.
- Commented, dependency-light fetch code with selectors/endpoints isolated per
  source.

## 9. Build order (each card works end-to-end before the next)
1. App shell: layout, theme system (light/dark/auto), i18n, header, settings,
   skeleton blocks, per-card error/fallback handling.
2. Wind meteogram (Open-Meteo direct) — incl. "+ comparer" and "7 j".
3. Tide card (Worker `/api/tide`, maree.info).
4. Isobar card (Worker `/api/chart`, Met Office).
5. Live wind (Worker `/api/livewind`, windmorbihan) + BMS bulletin (Worker
   `/api/bms`, Météo-France rwg + token fetch).
6. PWA (manifest, service worker, stale-data fallback), README, deploy docs.

## 10. Acceptance checklist (from brief)
- [ ] Opens on a phone from the GitHub Pages URL; installable to home screen.
- [ ] Card order: forecast meteogram → live wind → tide → bulletin → isobars.
- [ ] Live wind (Drénec) shows within ~2 s; auto-refreshes every 5 min.
- [ ] 24 h AROME HD meteogram in knots for Penfret: area+line mean, dashed gusts,
      direction arrows, "now" line; compare + 7-day work.
- [ ] Tide card: day curve, HW/LW annotations, "now" dot with rising/falling arrow;
      times/heights/coefficient match maree.info/94.
- [ ] BMS situation text displays; amber alert strip appears when a warning is active.
- [ ] Isobar chart visible and steppable through forecast times.
- [ ] Light and dark themes match the palette; auto-switch + manual override work.
- [ ] Killing the Worker breaks only the proxied cards, each with a fallback link.
- [ ] FR/EN toggle switches all UI labels; choices survive reload.

## 11. Open items resolved at build (non-blocking)
- windmorbihan feed request URL + Drénec `nid`.
- Météo-France token-acquisition mechanism + the `report_subtype` for active BMS
  gale warnings.
- Exact Open-Meteo comparison-model identifiers and Penfret coordinates
  (verify against current docs).

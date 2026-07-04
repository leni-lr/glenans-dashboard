# Brief for Claude Code — "Glénans Morning Briefing" dashboard

## What you are building

A personal, single-page weather briefing dashboard for a sailing instructor based at Penfret, Îles de Glénan (Brittany, France). Every morning it must show, on one mobile screen, everything needed to make the day's sailing decisions: the official marine bulletin, today's wind forecast, the actual wind right now, today's tide, and the surface-pressure (isobar) chart.

No accounts, no database, no paid services, no custom domain. Function over form: plain, fast, readable outdoors on a phone.

## Architecture

Two components in one public GitHub repo:

1. **`/web`** — a static frontend deployed on **GitHub Pages**, installable as a **PWA** (manifest + service worker). The service worker caches the app shell only; data is always fetched fresh, with a graceful "stale data from HH:MM" fallback if offline.
   - Keep the stack simple: vanilla HTML/CSS/JS (or Preact via CDN if genuinely helpful). No build step preferred; if unavoidable, use Vite with a documented `npm run build` → `gh-pages` deploy.
2. **`/worker`** — a **Cloudflare Worker** (free tier, `*.workers.dev` subdomain, deployed with `wrangler`) acting as CORS proxy + scraper for the sources that have no API. It exposes small JSON endpoints (below), caches responses with the Cache API, sends a normal browser `User-Agent`, and returns structured error JSON on failure.

The frontend reads the Worker base URL from a single config constant (`config.js`) so anyone forking the repo can point it at their own Worker.

## Data sources (5 cards)

### 1. Marine bulletin (BMS / "situation générale") — Météo France
Reference page the user reads today: `https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04`

- First, inspect that page's network traffic: meteofrance.com loads bulletin content from internal JSON endpoints. **Prefer the underlying JSON endpoint if you can identify a stable one**; otherwise scrape the HTML via the Worker (`GET /api/bms?zone=BMSCOTE-01-04`).
- Extract: zone name, bulletin issue/validity time, whether a BMS (gale/storm warning) is in progress, the "situation générale" text, and the wind / sea state / visibility / weather sections.
- Worker cache: 30 minutes. Bulletin text stays in French regardless of UI language.

### 2. Wind forecast — Open-Meteo (free, no key, CORS-enabled, called directly from the browser)
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- Default model: **AROME France HD 1.3 km** (`models=meteofrance_arome_france_hd`). Comparison models selectable: `meteofrance_arpege_europe`, `icon_eu`, `ecmwf_ifs025`, `gfs_global` (verify exact model identifiers against current Open-Meteo docs).
- Hourly variables: `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`; also fetch `precipitation` and `cloud_cover` for context.
- Units: `wind_speed_unit=kn`, `timezone=Europe/Paris`.
- Default display: **today, full 24 h**. A "7 days" button expands to the full week (not shown by default). A "compare" control overlays a second model on the same chart.
- Chart: Windy-style meteogram, fully specified in the Design specification below. Implement as **hand-rolled inline SVG** (no chart library) to match the approved mockup exactly and keep the bundle tiny.

### 3. Live wind now — windmorbihan.com (scraped via Worker)
Reference page: `https://www.windmorbihan.com/Drenec` (Drénec station, in the Glénan archipelago).

- Worker endpoint: `GET /api/livewind?station=Drenec`. Inspect the page first: many wind-station sites load readings from a JSON/AJAX endpoint — prefer that over HTML parsing.
- Extract: current wind speed (kn), gusts, direction (degrees + cardinal), reading timestamp.
- Worker cache: 2 minutes. Frontend auto-refreshes this card every 5 minutes while open, plus manual refresh.
- Station is user-changeable among windmorbihan stations (a small hardcoded list of station slugs is fine).

### 4. Tide of the day — maree.info (scraped via Worker)
Reference page: `https://maree.info/94` (the port the user uses today; keep `94` as the default port id).

- Worker endpoint: `GET /api/tide?port=94`.
- Extract for today (and tomorrow morning): high/low water **times and heights**, and the **tide coefficient** — sailors need the coefficient.
- Worker cache: 6 hours. If scraping proves brittle, note SHOM open data as a fallback in a code comment, but implement maree.info first since those are the exact numbers the user is used to.
- Display: a **tide curve of the day is required** (not a plain list): smooth curve of water height over 0–24 h, HW/LW times and heights annotated directly on the curve, coefficient badge, and a "now" dot on the curve showing the current position and whether the tide is rising or falling. Full spec in the Design specification below.
- Curve interpolation: cosine interpolation between consecutive extremes — for extremes (t0, h0) → (t1, h1): `h(t) = (h0+h1)/2 + (h0−h1)/2 × cos(π(t−t0)/(t1−t0))`. Include the last extreme of the previous day and the first of the next day so the curve spans 00:00–24:00 without gaps.

### 5. Isobar / surface pressure chart — UK Met Office
Reference page: `https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure`

- The chart images (latest analysis + forecast steps T+12 … T+84) live at stable public URLs; identify them from the page. Display in an `<img>` with a time stepper (◀ T+0 T+12 T+24 … ▶), pinch-zoomable on mobile.
- If hotlinking is blocked by headers, proxy the images through the Worker (`GET /api/chart?step=T24`, cache 1 hour).

## Location handling

- **Forecast location** (drives Open-Meteo only): default **Penfret, Îles de Glénan ≈ 47.716 N, −3.950 E** (verify coordinates). Free search via the Open-Meteo geocoding API (`https://geocoding-api.open-meteo.com/v1/search`), plus a manual lat/lon input.
- **Live-wind station** and **tide port** are separate selectors (those sources have fixed station lists), defaulting to Drénec and maree.info port 94.
- All selections persist in `localStorage`.

## UI (mobile-first, single column, in this exact order)

1. Header: location name + date/time, manual refresh button, FR/EN toggle, settings (location, station, port, theme).
2. Alert strip (only when a BMS warning is active) — amber, high-visibility, directly under the header.
3. **Wind forecast** card: 24 h meteogram, model chip (AROME 1.3 selected), "+ compare" toggle, "7 days" expand.
4. **Live wind** card: big current speed, gusts, direction arrow + cardinal + degrees, "updated X min ago".
5. **Tide** card: day curve with HW/LW annotations, "now" dot, coefficient badge.
6. **Bulletin** card: BMS status pill + situation générale text, collapsible beyond ~4 lines.
7. **Isobar** card: Met Office chart image + time stepper, pinch-zoomable.
8. Footer: credits and direct links to each original source page.

Each card loads and fails **independently**: if one source is down, show a muted "Source indisponible — ouvrir sur le site ↗" message in that card only; never blank the whole page. While loading, show simple skeleton blocks (no spinners).

## Design specification (approved mockup — follow closely)

Two themes sharing one layout: **light** ("Classique": navy header, white cards on a pale blue page) and **dark** ("Nuit": one deep-navy surface, cards replaced by hairline-separated sections). Theme = auto via `prefers-color-scheme`, plus a manual override in settings (auto / light / dark), persisted in `localStorage`. Implement all colors as CSS custom properties on `:root` with a `[data-theme="dark"]` override block — no hardcoded hex in components.

### Palette (marine blue ramp)

Core ramp: `navy-900 #042C53`, `navy-800 #0C447C`, `navy-600 #185FA5`, `blue-400 #378ADD`, `blue-200 #85B7EB`, `blue-100 #B5D4F4`, `blue-50 #E6F1FB`.

| Token | Light | Dark |
|---|---|---|
| page background | `#F4F8FC` | `#042C53` |
| card background | `#FFFFFF`, border `0.5px #B5D4F4`, radius `12px` | none — sections separated by `0.5px #0C447C` hairlines |
| header bar | `#0C447C` bg, `#E6F1FB` title, `#B5D4F4` subtitle | transparent (page bg), same text colors |
| text primary / big numbers | `#042C53` (pure white `#FFFFFF` never used for text in light) | `#FFFFFF` big numbers, `#E6F1FB` titles |
| text secondary / labels | `#185FA5` | `#85B7EB` |
| body text (bulletin) | `#0C447C` | `#B5D4F4` |
| interactive accents (links, "+ comparer", "7 j") | `#378ADD` | `#378ADD` |
| wind: area fill | `#B5D4F4` at ~55% opacity | `#0C447C` at ~55% opacity |
| wind: mean line (2px) | `#0C447C` | `#85B7EB` |
| gusts (dashed 1.6px, dash 4 3) + "raf." text | `#D85A30` | `#F0997B` |
| "now" markers (chart line, tide dot) | `#1D9E75` | `#5DCAA5` |
| chart gridlines | `#E6F1FB` | `#0C447C` |
| chart axis labels (11px) | `#185FA5` | `#85B7EB` |
| model chip | bg `#E6F1FB`, text `#0C447C` | bg `#0C447C`, text `#B5D4F4` |
| coefficient badge | bg `#E1F5EE`, text `#085041` | bg `#085041`, text `#9FE1CB` |
| "BMS: none" pill | bg `#EAF3DE`, text `#27500A` | bg `#173404`, text `#C0DD97` |
| BMS alert strip | bg `#EF9F27`, text `#412402` (both themes) | same |
| danger emphasis (e.g. forecast max ≥ 22 kn) | `#A32D2D` | `#F09595` |

Rule of thumb baked into the mockup: text sitting on a colored background always uses a dark/light stop of the same color family, never plain black or white-on-light.

### Typography and shape

System font stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Sentence case everywhere. Weights: 400 and 500 only. Sizes: header title 15px/500; card titles 12px/500; body 12px; live wind number 28–30px/500 with 14px unit; chart labels 11px minimum. Cards: 12px radius, 10–12px padding. No gradients, no shadows, no animations (a subtle fade-in on data arrival is the only motion allowed). Tap targets ≥ 40px.

### Component specs

**Wind meteogram (card 3).** Inline SVG, full card width, ~120px tall. Mean wind as a filled area + 2px line; gusts as a dashed line above; horizontal gridlines at 10/20/30 kn with left labels; y-scale auto-expands if gusts exceed 32 kn. Below the plot, a row of small direction arrows (one every ~2 h) pointing **downwind** (rotation = direction + 180°, up = north). X-axis labels every 6 h (0h/6h/12h/18h/24h). Vertical green "now" line at the current time. Legend line under the chart: mean / gusts / now. Tapping the chart shows a tooltip with the hour, mean, gusts, and direction. "+ compare" overlays a second model as a thin solid line in `#7F77DD` (purple, distinct from everything else) with its name added to the legend; "7 j" switches the x-domain to 7 days with day labels.

**Live wind (card 4).** Left: label "Vent actuel · {station}", then `12 kn  raf. 18` (speed in text-primary, "raf." value in gust color), then "mis à jour il y a X min". Right: large direction arrow icon rotated to point downwind with `W · 270°` beneath. If the reading is older than 20 min, show the timestamp in the danger color.

**Tide curve (card 5).** Inline SVG, ~120px tall, spanning 00:00–24:00. Curve per the cosine interpolation in source #4; area fill under the curve (`blue-200` light / `navy-800` dark at ~45% opacity) with a 2px line. Annotate each extreme on the curve: "PM 09:42" + height for highs (two stacked 11px labels), "BM 15:58" + height for lows; edge extremes get a time-only label. "Now": filled dot (r≈5) plus a thin ring (r≈8.5) in the now-green, with the current time and a ↗ (rising) or ↘ (falling) arrow next to it. X-axis labels every 6 h. Coefficient badge in the card title row.

**Bulletin (card 6).** Title row: "Situation générale" + status pill ("BMS : aucun" green, or "BMS en cours" using the alert amber). French bulletin text at 12px, line-height 1.5, clamped to ~4 lines with a "voir plus" expander.

**Isobar (card 7).** The Met Office image inside the card with a rounded 6px inner border, centered stepper below: `◀  analyse T+0 · ven 06h  ▶`. Keep the current step in `localStorage` for the session.

**Header.** Light: navy bar. Dark: no bar, header text sits on the page. Contents identical: "Penfret · Glénan" + "ven. 3 juil. · 07:12", refresh icon, FR/EN, settings.

A reference mockup screenshot (`design/mockup-light.png`, `design/mockup-dark.png`) will be added to the repo — match it visually.

## i18n

Simple FR/EN dictionary for all UI labels, toggle in header, persisted in `localStorage`. Default: French. Source texts (BMS) remain in their original language.

## Repo deliverables

- `/web` — static app (PWA manifest, service worker, `config.js` with `WORKER_URL`).
- `/worker` — Worker source + `wrangler.toml`.
- `README.md` — 10-minute setup for a stranger: fork → deploy Worker with `wrangler deploy` → paste Worker URL in `config.js` → enable GitHub Pages. Include a screenshot placeholder and a disclaimer that scraped sources may break and this is a personal tool, not an official product.
- Small, dependency-light, commented scraping code (selectors isolated in one place per source so they're easy to fix when sites change).

## Acceptance checklist

- [ ] Opens on a phone from GitHub Pages URL, installable to home screen.
- [ ] Card order is: forecast meteogram → live wind → tide → bulletin → isobars.
- [ ] Live wind from Drénec shows within ~2 s, auto-refreshes every 5 min.
- [ ] 24 h AROME HD meteogram in knots for Penfret: area + line for mean wind, dashed gust line, direction arrows, "now" line; model compare and 7-day expand work.
- [ ] Tide card renders the day curve with HW/LW annotations and a "now" dot with rising/falling arrow; times, heights and coefficient match maree.info/94.
- [ ] BMS situation text displays; amber alert strip appears when a warning is active.
- [ ] Isobar chart visible and steppable through forecast times.
- [ ] Light and dark themes both match the approved palette; auto-switches with system setting and manual override works.
- [ ] Killing the Worker breaks only the 3 proxied cards, each with a fallback link.
- [ ] FR/EN toggle switches all UI labels; choices survive reload.

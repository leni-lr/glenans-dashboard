<p align="center">
  <img src="web/icons/icon.svg" width="104" height="104" alt="compass-rose logo" />
</p>

<h1 align="center">Dashboard Météo · Glénans Briefing</h1>

A personal, mobile-first marine weather-briefing dashboard. Built for a sailing
instructor at Penfret (Îles de Glénan, Brittany), but it follows **any French
coastal spot** you search. One phone screen: wind forecast, live observed wind,
tide curve, Météo-France marine bulletin, and the Met Office isobar chart.

Static frontend (`/web`, vanilla JS, no build step) on GitHub Pages + a Cloudflare
Worker (`/worker`) that proxies the CORS-locked / token-gated sources.

> **Screenshot:** _add one here_ — open the app on a phone and drop a capture in
> `web/` (e.g. `web/screenshot.png`), then reference it: `![app](web/screenshot.png)`.

## Features
- **Wind forecast** — Open-Meteo AROME HD (24 h) / ECMWF (7 j, and outside France);
  tap-and-slide tooltip with a direction arrow.
- **Model comparison** — "comparer" opens a full-screen overlay of five models
  (AROME HD/2.5, ICON-EU, ECMWF, GFS) plus a chart per model, over today / tomorrow / 7 j.
- **Live wind** — nearest of the windmorbihan observation stations (name shown);
  auto-refreshes every 5 min; falls back to *"no local station"* outside coverage.
- **Tide** — day curve from the nearest maree.info port, adaptive to the local range,
  with HW/LW and a "now" marker showing the current height.
- **Marine bulletin** — Météo-France situation générale + the day's full report
  (VENT/MER/HOULE/…), the zone in effect, and an amber alert strip for gale warnings.
  Translated to English in EN mode.
- **Isobars** — UK Met Office surface-pressure chart, black-and-white by default with a
  colour toggle, a time stepper, and click-to-enlarge (pinch-zoom).
- **Location search** — search a maree.info port (exact tide) or any town; the app
  resolves the nearest station / port / bulletin zone. Penfret is the default.
- **PWA** — installable ("Add to Home Screen"), FR/EN, light/dark, offline app shell.

## Deploy in ~10 minutes

You need a (free) Cloudflare account and this repo forked to your GitHub.

### 1. Deploy the Worker
```bash
cd worker
npx wrangler login       # opens a browser once
npx wrangler deploy
```
Copy the printed URL, e.g. `https://glenans.<your-subdomain>.workers.dev`.

### 2. Point the frontend at your Worker
Edit `web/config.js`:
```js
export const WORKER_URL = "https://glenans.<your-subdomain>.workers.dev";
```
Commit and push.

### 3. Turn on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The included workflow publishes `web/` on every push to `main`. Your app appears at
`https://<you>.github.io/<repo>/` — open it on your phone and **Add to Home Screen**
(it installs as "Dashboard Météo").

## Develop locally
```bash
npm test                          # web unit tests (node --test)
node --test worker/test/*.test.js # worker unit tests
node scripts/serve.mjs            # serve web/ locally
cd worker && npx wrangler dev     # run the Worker locally
node scripts/build-ports.mjs      # regenerate the maree.info port table
```

## How it fails
Each card loads and fails independently. If the Worker is down, only the proxied
cards (live wind, tide, bulletin, isobar) show a muted "source unavailable" link;
the forecast (direct Open-Meteo) and the rest of the page keep working. The service
worker serves the last-known data and an offline app shell.

## Sources
Open-Meteo (forecast + geocoding), windmorbihan (live wind), maree.info (tide),
Météo-France (bulletin), UK Met Office (isobars), Google Translate (EN bulletin).
Links to each original page are in the app footer.

## Disclaimer
Personal tool, **not an official product**. Several sources are scraped or use
undocumented endpoints and **may break without notice** (e.g. the Météo-France
token scheme, the windmorbihan feed, or the translation endpoint). No warranty;
verify critical decisions against the official sources.

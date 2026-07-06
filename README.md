# Glénans · Morning Briefing

A personal, mobile-first weather-briefing dashboard for a sailing instructor at
Penfret, Îles de Glénan (Brittany). One phone screen: wind forecast, live Drénec
wind, tide curve, Météo-France marine bulletin, and the Met Office isobar chart.

Static frontend (`/web`, vanilla JS, no build) on GitHub Pages + a Cloudflare
Worker (`/worker`) that proxies the CORS-locked / token-gated sources.

![screenshot placeholder](web/icons/icon-512.png)

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
`https://<you>.github.io/<repo>/` — open it on your phone and **Add to Home Screen**.

## Develop locally
```bash
npm test                       # web unit tests (node --test)
node --test worker/test/*.test.js
node scripts/serve.mjs         # serve web/ locally
cd worker && npx wrangler dev  # run the Worker locally
```

## How it fails
Each card loads and fails independently. If the Worker is down, only the proxied
cards (live wind, tide, bulletin, isobar) show a muted "source unavailable" link;
the forecast (direct Open-Meteo) and the rest of the page keep working. The service
worker serves the last-known data and an offline app shell.

## Sources
Open-Meteo (forecast), windmorbihan (live wind), maree.info (tide),
Météo-France (bulletin), UK Met Office (isobars). Links to each original page are
in the app footer.

## Disclaimer
Personal tool, **not an official product**. Several sources are scraped or use
undocumented endpoints and **may break without notice** (e.g. the Météo-France
token scheme or the windmorbihan feed). No warranty; verify critical decisions
against the official sources.

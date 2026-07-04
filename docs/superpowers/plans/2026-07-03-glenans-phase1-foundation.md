# Glénans Dashboard — Phase 1: Foundation & App Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the running, themed, internationalised app shell — header, alert strip, five empty cards with skeleton/error states, footer — with a zero-dependency test harness, so later phases can drop real data into each card.

**Architecture:** Vanilla ESM modules loaded directly by the browser (`<script type="module">`, no build step). Pure logic (i18n, theme resolution, settings, card state→HTML) lives in modules whose browser access (`document`, `localStorage`, `window`) is confined to function bodies, so the same files are imported and unit-tested by Node's built-in test runner. UI wiring is verified by running the app.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript (ES modules). Node `>=20` for `node --test` (built-in, no dependencies). Python 3 `http.server` OR a bundled no-dependency Node static server for local preview.

## Global Constraints

- No build step. Browser loads ES modules directly. (spec §2)
- No runtime dependencies in `/web`. Dev-only: none beyond Node's built-in test runner. (spec §2, §8)
- All colours are CSS custom properties on `:root` with a `[data-theme="dark"]` override block. No hardcoded hex in components. (spec §2, §6)
- Palette (exact hex, marine blue ramp): `navy-900 #042C53`, `navy-800 #0C447C`, `navy-600 #185FA5`, `blue-400 #378ADD`, `blue-200 #85B7EB`, `blue-100 #B5D4F4`, `blue-50 #E6F1FB`. (spec §6 / brief)
- Font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Weights 400 and 500 only. Sentence case. (brief typography)
- Card order, top to bottom: forecast → live wind → tide → bulletin → isobars. (spec §4)
- Default language French; FR/EN toggle; choices persist in `localStorage`. (spec §7)
- Theme: auto via `prefers-color-scheme` + manual override (auto/light/dark), persisted. (spec §6)
- Each card loads and fails independently; on failure show muted "Source indisponible — ouvrir sur le site ↗"; while loading show skeleton blocks (no spinners). (spec §4)
- Tap targets ≥ 40px; card radius 12px, padding 10–12px; no gradients, no shadows, no animations except a subtle fade-in on data arrival. (brief typography/shape)

---

## File structure introduced in this phase

```
web/
  index.html            # app shell markup: header, alert strip, 5 cards, footer
  config.js             # export const WORKER_URL
  css/
    tokens.css          # :root palette + [data-theme="dark"] overrides + base reset
    layout.css          # header, cards, skeletons, alert strip, footer
  js/
    i18n.js             # DICT + t(lang, key); pure
    theme.js            # resolveTheme() pure; applyTheme()/initTheme() DOM
    settings.js         # DEFAULTS + loadSettings()/saveSetting(); localStorage in bodies
    card.js             # cardStates() pure string builders; mountCard() DOM
    app.js              # wiring: render header, apply theme, toggles, mount skeleton cards
  test/
    i18n.test.js
    theme.test.js
    settings.test.js
    card.test.js
package.json            # scripts: test, serve
.gitignore
```

---

## Task 1: Repo scaffold, test harness, dev server

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `web/config.js`
- Create: `web/js/smoke.js`
- Create: `web/test/smoke.test.js`
- Create: `scripts/serve.mjs`

**Interfaces:**
- Produces: `web/config.js` exporting `WORKER_URL` (string); npm scripts `test` and `serve`; a working `node --test` cycle proving ESM + the runner are wired.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "glenans-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "serve": "node scripts/serve.mjs"
  }
}
```

- [ ] **Step 3: Create `web/config.js`**

```js
// Point this at your deployed Cloudflare Worker (see /worker and README).
// Example: "https://glenans.<your-subdomain>.workers.dev"
export const WORKER_URL = "";
```

- [ ] **Step 4: Create `scripts/serve.mjs` (no-dependency static server for local preview)**

```js
// Minimal static file server for local preview of /web. No dependencies.
// Usage: npm run serve  ->  http://localhost:5173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../web/", import.meta.url).pathname;
const PORT = 5173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/index.html";
    const filePath = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`serving web/ at http://localhost:${PORT}`));
```

- [ ] **Step 5: Write the failing smoke test**

Create `web/js/smoke.js`:

```js
export const ok = () => true;
```

Create `web/test/smoke.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { ok } from "../js/smoke.js";

test("test harness runs ESM modules", () => {
  assert.equal(ok(), true);
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: `# pass 1` with exit code 0. (This proves `node --test` discovers `web/test/**` and imports ESM.)

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore web/config.js web/js/smoke.js web/test/smoke.test.js scripts/serve.mjs
git commit -m "chore: scaffold web app, node --test harness, static dev server"
```

---

## Task 2: i18n module (FR/EN dictionary + lookup)

**Files:**
- Create: `web/js/i18n.js`
- Test: `web/test/i18n.test.js`

**Interfaces:**
- Produces:
  - `LANGS = ["fr", "en"]`
  - `DICT` — object keyed by message id, each `{ fr, en }`.
  - `t(lang, key)` → string. Returns `DICT[key][lang]`; if the key is unknown, returns `key` unchanged (so a missing label is visible, not a crash).

- [ ] **Step 1: Write the failing test**

Create `web/test/i18n.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { t, LANGS, DICT } from "../js/i18n.js";

test("t returns the French string by default key", () => {
  assert.equal(t("fr", "forecast_title"), "Prévision vent · 24 h");
});

test("t returns the English string", () => {
  assert.equal(t("en", "forecast_title"), "Wind forecast · 24 h");
});

test("t echoes unknown keys instead of throwing", () => {
  assert.equal(t("fr", "no_such_key"), "no_such_key");
});

test("every DICT entry defines both languages", () => {
  for (const key of Object.keys(DICT)) {
    for (const lang of LANGS) {
      assert.equal(typeof DICT[key][lang], "string", `${key}.${lang} missing`);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/i18n.test.js`
Expected: FAIL — cannot import `../js/i18n.js` (module not found).

- [ ] **Step 3: Write the implementation**

Create `web/js/i18n.js`:

```js
// FR/EN UI dictionary. Source texts (BMS bulletin) are NOT translated — they
// stay in their original language and never pass through here.
export const LANGS = ["fr", "en"];

export const DICT = {
  header_subtitle_sep: { fr: " · ", en: " · " },
  forecast_title:   { fr: "Prévision vent · 24 h", en: "Wind forecast · 24 h" },
  compare:          { fr: "+ comparer",            en: "+ compare" },
  seven_days:       { fr: "7 j",                   en: "7 d" },
  livewind_title:   { fr: "Vent actuel",           en: "Live wind" },
  livewind_gust:    { fr: "raf.",                  en: "gust" },
  livewind_updated: { fr: "mis à jour il y a",     en: "updated" },
  livewind_ago:     { fr: "min",                   en: "min ago" },
  tide_title:       { fr: "Marée",                 en: "Tide" },
  tide_coef:        { fr: "coef",                  en: "coef" },
  bulletin_title:   { fr: "Situation générale",    en: "General situation" },
  bms_none:         { fr: "BMS : aucun",           en: "BMS: none" },
  bms_active:       { fr: "BMS en cours",          en: "BMS in effect" },
  see_more:         { fr: "voir plus",             en: "see more" },
  isobar_title:     { fr: "Isobares · Met Office", en: "Isobars · Met Office" },
  source_down:      { fr: "Source indisponible — ouvrir sur le site ↗",
                      en: "Source unavailable — open on the site ↗" },
  refresh:          { fr: "Rafraîchir",            en: "Refresh" },
  settings:         { fr: "Réglages",              en: "Settings" },
};

export function t(lang, key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] ?? entry.fr ?? key;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/i18n.test.js`
Expected: PASS — `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add web/js/i18n.js web/test/i18n.test.js
git commit -m "feat(i18n): FR/EN dictionary and t() lookup"
```

---

## Task 3: Theme module (resolve + apply + persist)

**Files:**
- Create: `web/js/theme.js`
- Test: `web/test/theme.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `THEME_PREFS = ["auto", "light", "dark"]`
  - `resolveTheme(pref, prefersDark)` → `"light" | "dark"` (pure). For `"auto"`, returns `"dark"` when `prefersDark` is true, else `"light"`; for explicit prefs, returns them unchanged.
  - `applyTheme(pref)` (DOM) — resolves against `window.matchMedia("(prefers-color-scheme: dark)").matches` and sets `document.documentElement.dataset.theme` to the resolved value.
  - `initTheme(pref)` (DOM) — calls `applyTheme(pref)` and registers a `matchMedia` change listener that re-applies while pref is `"auto"`.

- [ ] **Step 1: Write the failing test**

Create `web/test/theme.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, THEME_PREFS } from "../js/theme.js";

test("auto follows the system: dark when prefersDark", () => {
  assert.equal(resolveTheme("auto", true), "dark");
});

test("auto follows the system: light otherwise", () => {
  assert.equal(resolveTheme("auto", false), "light");
});

test("explicit light ignores the system", () => {
  assert.equal(resolveTheme("light", true), "light");
});

test("explicit dark ignores the system", () => {
  assert.equal(resolveTheme("dark", false), "dark");
});

test("THEME_PREFS lists the three accepted values", () => {
  assert.deepEqual(THEME_PREFS, ["auto", "light", "dark"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/theme.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `web/js/theme.js`:

```js
export const THEME_PREFS = ["auto", "light", "dark"];

// Pure: given a stored preference and whether the OS prefers dark, return the
// concrete theme to apply.
export function resolveTheme(pref, prefersDark) {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return prefersDark ? "dark" : "light";
}

// DOM: resolve against the live media query and stamp the root element.
export function applyTheme(pref) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(pref, prefersDark);
}

// DOM: apply now and keep following the system while pref stays "auto".
export function initTheme(pref) {
  applyTheme(pref);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if ((document.documentElement.dataset.themePref || "auto") === "auto") {
      applyTheme("auto");
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/theme.test.js`
Expected: PASS — `# pass 5`. (Only the pure `resolveTheme` is exercised; `applyTheme`/`initTheme` are verified by running the app in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add web/js/theme.js web/test/theme.test.js
git commit -m "feat(theme): resolveTheme pure logic + apply/init DOM helpers"
```

---

## Task 4: Settings module (localStorage-backed, with defaults)

**Files:**
- Create: `web/js/settings.js`
- Test: `web/test/settings.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULTS = { lang: "fr", themePref: "auto", station: "Drenec", port: "94", lat: 47.716, lon: -3.950, place: "Penfret · Glénan" }`
  - `mergeSettings(stored)` → object (pure): `DEFAULTS` overlaid with any valid keys from `stored`; unknown keys in `stored` are dropped.
  - `loadSettings()` (DOM) — reads `localStorage["glenans"]`, JSON-parses, returns `mergeSettings(parsed)`; on any error returns `{ ...DEFAULTS }`.
  - `saveSetting(key, value)` (DOM) — loads, sets one key, writes back JSON; returns the new settings object.

- [ ] **Step 1: Write the failing test**

Create `web/test/settings.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, DEFAULTS } from "../js/settings.js";

test("mergeSettings fills every default when stored is empty", () => {
  assert.deepEqual(mergeSettings({}), DEFAULTS);
});

test("mergeSettings overlays provided values", () => {
  const s = mergeSettings({ lang: "en", port: "56" });
  assert.equal(s.lang, "en");
  assert.equal(s.port, "56");
  assert.equal(s.station, DEFAULTS.station); // untouched keys keep defaults
});

test("mergeSettings drops unknown keys", () => {
  const s = mergeSettings({ hacker: 1, lang: "en" });
  assert.equal(s.hacker, undefined);
});

test("mergeSettings tolerates null/undefined input", () => {
  assert.deepEqual(mergeSettings(null), DEFAULTS);
  assert.deepEqual(mergeSettings(undefined), DEFAULTS);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/settings.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `web/js/settings.js`:

```js
const STORAGE_KEY = "glenans";

export const DEFAULTS = {
  lang: "fr",
  themePref: "auto",
  station: "Drenec",
  port: "94",
  lat: 47.716,
  lon: -3.950,
  place: "Penfret · Glénan",
};

// Pure: DEFAULTS overlaid with only the known keys from `stored`.
export function mergeSettings(stored) {
  const out = { ...DEFAULTS };
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && stored[key] !== undefined) out[key] = stored[key];
    }
  }
  return out;
}

// DOM: read + parse + merge, never throw.
export function loadSettings() {
  try {
    return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...DEFAULTS };
  }
}

// DOM: update one key and persist.
export function saveSetting(key, value) {
  const next = { ...loadSettings(), [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/settings.test.js`
Expected: PASS — `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add web/js/settings.js web/test/settings.test.js
git commit -m "feat(settings): localStorage-backed settings with pure merge + defaults"
```

---

## Task 5: Design tokens & base CSS

**Files:**
- Create: `web/css/tokens.css`

**Interfaces:**
- Produces: CSS custom properties consumed by `layout.css` (Task 6) and every later card. Light values on `:root`; dark overrides under `:root[data-theme="dark"]`. No test (CSS); verified visually in Task 8.

- [ ] **Step 1: Create `web/css/tokens.css`**

```css
/* Marine-blue design tokens. All component colours reference these vars;
   never hardcode hex outside this file. Light on :root, dark overrides below. */
:root {
  /* core ramp (theme-independent reference) */
  --navy-900: #042C53;
  --navy-800: #0C447C;
  --navy-600: #185FA5;
  --blue-400: #378ADD;
  --blue-200: #85B7EB;
  --blue-100: #B5D4F4;
  --blue-50:  #E6F1FB;

  /* semantic tokens — LIGHT ("Classique") */
  --page-bg: #F4F8FC;
  --card-bg: #FFFFFF;
  --card-border: #B5D4F4;
  --header-bg: #0C447C;
  --header-title: #E6F1FB;
  --header-subtitle: #B5D4F4;
  --text-primary: #042C53;
  --text-secondary: #185FA5;
  --text-body: #0C447C;
  --accent: #378ADD;
  --gust: #D85A30;
  --now: #1D9E75;
  --grid: #E6F1FB;
  --axis-label: #185FA5;
  --chip-bg: #E6F1FB;
  --chip-text: #0C447C;
  --coef-bg: #E1F5EE;
  --coef-text: #085041;
  --bms-none-bg: #EAF3DE;
  --bms-none-text: #27500A;
  --alert-bg: #EF9F27;
  --alert-text: #412402;
  --danger: #A32D2D;

  /* shape */
  --radius: 12px;
  --hairline: #B5D4F4;

  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:root[data-theme="dark"] {
  --page-bg: #042C53;
  --card-bg: transparent;         /* dark = hairline-separated sections, no cards */
  --card-border: transparent;
  --header-bg: transparent;
  --header-title: #E6F1FB;
  --header-subtitle: #85B7EB;
  --text-primary: #FFFFFF;
  --text-secondary: #85B7EB;
  --text-body: #B5D4F4;
  --accent: #378ADD;
  --gust: #F0997B;
  --now: #5DCAA5;
  --grid: #0C447C;
  --axis-label: #85B7EB;
  --chip-bg: #0C447C;
  --chip-text: #B5D4F4;
  --coef-bg: #085041;
  --coef-text: #9FE1CB;
  --bms-none-bg: #173404;
  --bms-none-text: #C0DD97;
  --alert-bg: #EF9F27;            /* alert strip identical in both themes */
  --alert-text: #412402;
  --danger: #F09595;

  --hairline: #0C447C;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--page-bg);
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 14px;
  font-weight: 400;
  -webkit-text-size-adjust: 100%;
}
```

- [ ] **Step 2: Sanity-check the file loads (served)**

Run: `npm run serve` then in another shell:
`curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:5173/css/tokens.css`
Expected: `200 text/css; charset=utf-8`. Stop the server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add web/css/tokens.css
git commit -m "feat(css): marine-blue design tokens for light and dark themes"
```

---

## Task 6: HTML shell & layout CSS

**Files:**
- Create: `web/index.html`
- Create: `web/css/layout.css`

**Interfaces:**
- Consumes: `web/css/tokens.css` vars (Task 5); will load `web/js/app.js` (Task 8) as a module.
- Produces: DOM anchors that `app.js` targets by id:
  - `#header-place`, `#header-datetime`, `#btn-refresh`, `#btn-lang`, `#btn-settings`
  - `#alert-strip`
  - card mount points in order: `#card-forecast`, `#card-livewind`, `#card-tide`, `#card-bulletin`, `#card-isobar`
  - `#footer-credits`

- [ ] **Step 1: Create `web/index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Glénans · Briefing</title>
  <link rel="stylesheet" href="./css/tokens.css" />
  <link rel="stylesheet" href="./css/layout.css" />
</head>
<body>
  <header class="app-header">
    <div class="app-header__id">
      <span id="header-place" class="app-header__place"></span>
      <span id="header-datetime" class="app-header__datetime"></span>
    </div>
    <nav class="app-header__actions">
      <button id="btn-refresh" class="iconbtn" type="button" aria-label="Rafraîchir">⟳</button>
      <button id="btn-lang" class="textbtn" type="button">FR</button>
      <button id="btn-settings" class="iconbtn" type="button" aria-label="Réglages">⚙</button>
    </nav>
  </header>

  <div id="alert-strip" class="alert-strip" hidden></div>

  <main class="stack">
    <section id="card-forecast" class="card"></section>
    <section id="card-livewind" class="card"></section>
    <section id="card-tide" class="card"></section>
    <section id="card-bulletin" class="card"></section>
    <section id="card-isobar" class="card"></section>
  </main>

  <footer id="footer-credits" class="footer"></footer>

  <script type="module" src="./js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `web/css/layout.css`**

```css
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  background: var(--header-bg);
}
.app-header__place { font-size: 15px; font-weight: 500; color: var(--header-title); }
.app-header__datetime { display: block; font-size: 11px; color: var(--header-subtitle); }
.app-header__actions { display: flex; align-items: center; gap: 6px; }

.iconbtn, .textbtn {
  min-width: 40px; min-height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--header-subtitle); font-size: 18px; font-family: var(--font);
}
.textbtn { font-size: 13px; font-weight: 500; }

.alert-strip {
  background: var(--alert-bg); color: var(--alert-text);
  font-size: 12px; font-weight: 500; padding: 8px 14px;
}

.stack { display: flex; flex-direction: column; gap: 8px; padding: 10px; }

.card {
  background: var(--card-bg);
  border: 0.5px solid var(--card-border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
:root[data-theme="dark"] .card {
  border: none;
  border-top: 0.5px solid var(--hairline);
  border-radius: 0;
  padding: 8px 4px;
}

.card__title-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; }
.card__title { font-size: 12px; font-weight: 500; color: var(--text-secondary); }

/* skeletons: plain blocks, no spinner, no animation */
.skeleton { background: var(--grid); border-radius: 6px; }
.skeleton--line { height: 12px; margin: 6px 0; }
.skeleton--chart { height: 118px; margin: 4px 0; }

/* per-card failure message */
.card__error {
  font-size: 12px; color: var(--text-secondary);
}
.card__error a { color: var(--accent); text-decoration: none; }

/* subtle fade-in — the only motion allowed */
.fade-in { animation: fade 220ms ease-out; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fade-in { animation: none; } }

.footer { padding: 12px 14px; font-size: 11px; color: var(--text-secondary); }
.footer a { color: var(--accent); text-decoration: none; }
```

- [ ] **Step 3: Verify the shell serves and references resolve**

Run: `npm run serve` then:
`curl -s http://localhost:5173/ | grep -c "card-forecast"`
Expected: `1`. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/css/layout.css
git commit -m "feat(shell): index.html app-shell markup + layout CSS"
```

---

## Task 7: Card mount helper (state → HTML, pure) + DOM mounter

**Files:**
- Create: `web/js/card.js`
- Test: `web/test/card.test.js`

**Interfaces:**
- Consumes: `t` from `web/js/i18n.js` (Task 2).
- Produces:
  - `skeletonHTML(lines = 2, withChart = false)` → string (pure): title-less block of `<div class="skeleton skeleton--line">` rows, optionally preceded by a `skeleton--chart` block.
  - `errorHTML(lang, href)` → string (pure): the muted "Source indisponible — ouvrir sur le site ↗" message wrapping `href` in an anchor (target `_blank`, `rel="noopener"`).
  - `mountCard(id, html, { fade = false })` (DOM): sets `document.getElementById(id).innerHTML = html`; adds the `fade-in` class when `fade` is true.

- [ ] **Step 1: Write the failing test**

Create `web/test/card.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { skeletonHTML, errorHTML } from "../js/card.js";

test("skeletonHTML renders the requested number of lines", () => {
  const html = skeletonHTML(3);
  assert.equal((html.match(/skeleton--line/g) || []).length, 3);
  assert.ok(!html.includes("skeleton--chart"));
});

test("skeletonHTML can prepend a chart block", () => {
  const html = skeletonHTML(1, true);
  assert.ok(html.includes("skeleton--chart"));
});

test("errorHTML shows the French fallback and a source link", () => {
  const html = errorHTML("fr", "https://maree.info/94");
  assert.ok(html.includes("Source indisponible"));
  assert.ok(html.includes('href="https://maree.info/94"'));
  assert.ok(html.includes('rel="noopener"'));
});

test("errorHTML uses the English fallback for en", () => {
  const html = errorHTML("en", "https://example.com");
  assert.ok(html.includes("Source unavailable"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/test/card.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `web/js/card.js`:

```js
import { t } from "./i18n.js";

// Pure: skeleton markup (plain blocks, no spinner/animation).
export function skeletonHTML(lines = 2, withChart = false) {
  const chart = withChart ? '<div class="skeleton skeleton--chart"></div>' : "";
  const rows = Array.from({ length: lines },
    () => '<div class="skeleton skeleton--line"></div>').join("");
  return chart + rows;
}

// Pure: per-card failure message with a link back to the original source.
export function errorHTML(lang, href) {
  const label = t(lang, "source_down");
  return `<p class="card__error"><a href="${href}" target="_blank" rel="noopener">${label}</a></p>`;
}

// DOM: replace a card's contents; optional fade-in on data arrival.
export function mountCard(id, html, { fade = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  if (fade) {
    el.classList.remove("fade-in");
    void el.offsetWidth; // restart the animation
    el.classList.add("fade-in");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test web/test/card.test.js`
Expected: PASS — `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add web/js/card.js web/test/card.test.js
git commit -m "feat(card): pure skeleton/error builders + mountCard DOM helper"
```

---

## Task 8: App wiring (header, theme, toggles, skeleton cards, footer)

**Files:**
- Create: `web/js/app.js`

**Interfaces:**
- Consumes: `loadSettings, saveSetting` (Task 4); `initTheme, applyTheme, THEME_PREFS` (Task 3); `t` (Task 2); `skeletonHTML, mountCard` (Task 7).
- Produces: the running shell. No unit test — verified by running the app and observing behaviour (this is DOM wiring, not pure logic).

- [ ] **Step 1: Write `web/js/app.js`**

```js
import { loadSettings, saveSetting } from "./settings.js";
import { initTheme, applyTheme, THEME_PREFS } from "./theme.js";
import { t } from "./i18n.js";
import { skeletonHTML, mountCard } from "./card.js";

// Source links used by each card's title / footer credits and later fallbacks.
const SOURCES = {
  forecast: "https://open-meteo.com/",
  livewind: "https://www.windmorbihan.com/Drenec",
  tide: "https://maree.info/94",
  bulletin: "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04",
  isobar: "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure",
};

const state = { settings: loadSettings() };

function formatDateTime(lang, date = new Date()) {
  // e.g. "ven. 3 juil. · 07:12"
  const d = date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB",
    { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB",
    { hour: "2-digit", minute: "2-digit" });
  return `${d} · ${time}`;
}

function renderHeader() {
  const { lang, place } = state.settings;
  document.getElementById("header-place").textContent = place;
  document.getElementById("header-datetime").textContent = formatDateTime(lang);
  document.getElementById("btn-lang").textContent = lang.toUpperCase();
  document.getElementById("btn-refresh").setAttribute("aria-label", t(lang, "refresh"));
  document.getElementById("btn-settings").setAttribute("aria-label", t(lang, "settings"));
}

function cardTitleRow(lang, key, extra = "") {
  return `<div class="card__title-row"><span class="card__title">${t(lang, key)}</span>${extra}</div>`;
}

// Mount every card with a titled skeleton; later phases replace these bodies.
function renderSkeletons() {
  const { lang } = state.settings;
  mountCard("card-forecast", cardTitleRow(lang, "forecast_title") + skeletonHTML(1, true));
  mountCard("card-livewind", cardTitleRow(lang, "livewind_title") + skeletonHTML(2));
  mountCard("card-tide",     cardTitleRow(lang, "tide_title")     + skeletonHTML(1, true));
  mountCard("card-bulletin", cardTitleRow(lang, "bulletin_title") + skeletonHTML(3));
  mountCard("card-isobar",   cardTitleRow(lang, "isobar_title")   + skeletonHTML(1, true));
}

function renderFooter() {
  const { lang } = state.settings;
  const links = Object.entries(SOURCES)
    .map(([k, href]) => `<a href="${href}" target="_blank" rel="noopener">${t(lang, `${cardKeyToTitle(k)}`)}</a>`)
    .join(" · ");
  document.getElementById("footer-credits").innerHTML = links;
}

function cardKeyToTitle(k) {
  return {
    forecast: "forecast_title", livewind: "livewind_title", tide: "tide_title",
    bulletin: "bulletin_title", isobar: "isobar_title",
  }[k];
}

function renderAll() {
  renderHeader();
  renderSkeletons();
  renderFooter();
}

function wireEvents() {
  document.getElementById("btn-lang").addEventListener("click", () => {
    const next = state.settings.lang === "fr" ? "en" : "fr";
    state.settings = saveSetting("lang", next);
    document.documentElement.lang = next;
    renderAll();
  });

  // Cycle theme preference auto -> light -> dark -> auto (settings panel comes later).
  document.getElementById("btn-settings").addEventListener("click", () => {
    const i = THEME_PREFS.indexOf(state.settings.themePref);
    const next = THEME_PREFS[(i + 1) % THEME_PREFS.length];
    state.settings = saveSetting("themePref", next);
    document.documentElement.dataset.themePref = next;
    applyTheme(next);
  });

  // Manual refresh: for now just re-stamp the clock + re-mount skeletons.
  document.getElementById("btn-refresh").addEventListener("click", renderAll);
}

function start() {
  document.documentElement.lang = state.settings.lang;
  document.documentElement.dataset.themePref = state.settings.themePref;
  initTheme(state.settings.themePref);
  renderAll();
  wireEvents();
}

start();
```

- [ ] **Step 2: Run the full test suite (nothing regressed)**

Run: `npm test`
Expected: all suites pass (`i18n` 4, `theme` 5, `settings` 4, `card` 4, `smoke` 1). Exit 0.

- [ ] **Step 3: Run the app and verify the shell behaves**

Run: `npm run serve`, open `http://localhost:5173/`, and confirm:
1. Header shows "Penfret · Glénan" and a date/time like "ven. 3 juil. · 07:12".
2. Five cards appear **in order** forecast → live wind → tide → bulletin → isobars, each with its French title and grey skeleton blocks (no spinners).
3. Clicking **FR** flips to **EN**; every card title switches to English; button reads "EN".
4. Clicking **⚙** cycles the page through light → dark → auto styling (cards become hairline-separated sections on the deep-navy surface in dark).
5. With the OS in dark mode and pref on "auto", the page renders dark; toggling the OS theme flips it live.
6. Footer shows five source links that open the correct sites in a new tab.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "feat(app): wire header, theme cycle, FR/EN toggle, skeleton cards, footer"
```

---

## Self-review against the spec

**Spec coverage (Phase-1 scope only — later phases own the rest):**
- §2 no-build vanilla ESM + `config.js` `WORKER_URL` → Tasks 1, 6, 8. ✅
- §2/§6 CSS custom properties, light + `[data-theme="dark"]` override, no hardcoded hex → Task 5. ✅
- §4 card order forecast→live wind→tide→bulletin→isobars → Task 6 markup + Task 8 verify step. ✅
- §4 per-card independent skeleton (loading) + error fallback markup → Task 7 (`skeletonHTML`, `errorHTML`), used by later phases. ✅
- §6 theme auto/light/dark + persist + live system follow → Tasks 3, 4, 8. ✅
- §7 FR/EN dictionary, default French, persisted toggle → Tasks 2, 4, 8. ✅
- §4 header (place, date/time, refresh, FR/EN, settings) + §4 footer credits/links → Tasks 6, 8. ✅
- brief typography/shape: font stack, weights, radius 12px, ≥40px tap targets, no shadows/gradients, fade-in only motion → Tasks 5, 6. ✅
- **Deferred to later phases (correctly out of scope here):** real data adapters, the meteogram and tide SVG renderers, live-wind auto-refresh, the isobar stepper, the alert strip *activation* logic (markup exists; BMS wiring is Phase for the bulletin card), the settings *panel* (Task 8 ships a temporary theme-cycle button on ⚙), the Worker, and the PWA manifest/service worker.

**Placeholder scan:** No "TBD/TODO/handle edge cases" in steps; every code step shows complete code. The ⚙ theme-cycle is an intentional, documented interim behaviour, not a placeholder (the full settings panel is a later phase). ✅

**Type consistency:** `t(lang, key)` signature consistent across i18n/card/app. `resolveTheme(pref, prefersDark)`/`applyTheme(pref)`/`THEME_PREFS` consistent across theme/app. `mergeSettings/loadSettings/saveSetting` and the `DEFAULTS` keys (`lang, themePref, station, port, lat, lon, place`) consistent across settings/app. `skeletonHTML/errorHTML/mountCard` consistent across card/app. ✅

---

## Next phases (each its own plan, written after this one is executed & reviewed)
- **Phase 2 — Wind forecast card:** Open-Meteo adapter, meteogram SVG renderer (area+line+gusts+arrows+now+tooltip), model chip, "+ comparer", "7 j".
- **Phase 3 — Tide card:** Worker `/api/tide` + maree.info parser, cosine interpolation, tide-curve SVG, coefficient badge, now-dot.
- **Phase 4 — Isobar card:** Worker `/api/chart` + Met Office run resolver, image + stepper, pinch-zoom.
- **Phase 5 — Live wind + Bulletin:** Worker `/api/livewind` (windmorbihan feed) with auto-refresh; Worker `/api/bms` (Météo-France rwg + token fetch); alert-strip activation.
- **Phase 6 — PWA & docs:** manifest, service worker (app-shell cache + stale fallback), README, deploy.

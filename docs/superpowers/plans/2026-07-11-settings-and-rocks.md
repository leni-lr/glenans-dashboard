# Settings Page + Rocks Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real settings page (per-card on/off toggles + long-press drag-to-reorder, opened by ☰, closed by ←) and a local, per-user "Rocks" card that shows live pass/no-pass safety over named rocks with absolute clock times.

**Architecture:** Replace the five hardcoded `<section>` cards in `index.html` with a **card registry** driven by two new settings (`cardOrder`, `cardHidden`); `app.js` renders the ordered, visible cards into an empty `#card-stack`. The settings overlay mutates those two settings plus a personal `draft`. The Rocks card is a normal registry card (default hidden) that, per rock, fetches its tide port, reuses the existing cosine tide-curve interpolation to find the water level now and the next threshold crossing, and colours each rock blue (clear) / red (foul). Rock config lives in the card (＋ to add). No backend — everything persists in the existing `localStorage` settings blob; the data model is kept sharing-ready for a future Supabase catalog.

**Tech Stack:** Vanilla ES modules, no build step, no runtime deps (web); `node --test` for unit tests; throwaway `.mjs` smokes under `.superpowers/sdd/` for DOM wiring.

## Global Constraints

- No build step, no runtime dependencies, no framework in `web/` — vanilla ES modules only.
- No hardcoded hex colours outside `web/css/tokens.css`; components reference CSS custom properties.
- All user- or data-derived text inserted into the DOM must pass through `escapeHTML` from `web/js/util/html.js`.
- Only setting keys present in `DEFAULTS` (in `web/js/settings.js`) survive `mergeSettings`; every new persisted field MUST be added to `DEFAULTS`.
- Files use CRLF line endings; git will warn `LF will be replaced by CRLF` on new files — this is expected, not an error.
- Web unit tests run with `npm test` (which runs `node --test web/test/*.test.js`). Smokes run with `node .superpowers/sdd/smoke-<name>.mjs` and must print a line starting with a recognisable `... OK` on success.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- The card render contract is unchanged: each `mount<Card>Card(settings)` returns `{ state, refresh }`, where `state.settings` is reassignable and `refresh()` re-renders. `mountCard(id, html, opts)` fills the element whose id is `id` (it must already exist in the DOM).

---

### Task 1: Settings model + card registry + card-ordering

**Files:**
- Modify: `web/js/settings.js` (DEFAULTS + `mergeSettings`)
- Create: `web/js/cards/cardorder.js`
- Create: `web/js/cards/registry.js`
- Modify: `web/js/app.js` (render from registry into `#card-stack`)
- Modify: `web/index.html` (remove the five static `<section>`s; give `<main>` id `card-stack`)
- Create test: `web/test/cardorder.test.js`
- Modify test: `web/test/settings.test.js` (new default keys + array-clone test)
- Modify smoke: `.superpowers/sdd/smoke-app.mjs` (dynamic sections)

**Interfaces:**
- Consumes: existing `mount*Card(settings) -> { state, refresh }` from the five card modules; `loadSettings`, `saveSetting`, `mergeSettings`, `DEFAULTS` from `settings.js`.
- Produces:
  - `settings.js` `DEFAULTS` gains `cardOrder: string[]`, `cardHidden: string[]`, `rocks: object[]`, `draft: number`.
  - `cardorder.js`: `orderedKeys(order: string[], registryKeys: string[]) -> string[]`, `visibleKeys(order: string[], hidden: string[], registryKeys: string[]) -> string[]`, `reorder(list: any[], from: number, to: number) -> any[]`.
  - `registry.js`: `CARD_REGISTRY: { key, el, titleKey, mount }[]` and `REGISTRY_KEYS: string[]`. (Rocks is NOT registered here yet — added in Task 4.)

- [ ] **Step 1: Write the failing card-ordering test**

Create `web/test/cardorder.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { orderedKeys, visibleKeys, reorder } from "../js/cards/cardorder.js";

const KEYS = ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"];

test("orderedKeys keeps stored order, drops unknown, appends missing", () => {
  const out = orderedKeys(["tide", "forecast", "ghost"], KEYS);
  // stored known keys first (in stored order), then the rest in registry order
  assert.deepEqual(out, ["tide", "forecast", "livewind", "rocks", "bulletin", "isobar"]);
});

test("orderedKeys dedups repeated keys", () => {
  assert.deepEqual(orderedKeys(["tide", "tide"], ["tide", "forecast"]), ["tide", "forecast"]);
});

test("orderedKeys tolerates empty/undefined order", () => {
  assert.deepEqual(orderedKeys(undefined, KEYS), KEYS);
  assert.deepEqual(orderedKeys([], KEYS), KEYS);
});

test("visibleKeys removes hidden keys but preserves order", () => {
  assert.deepEqual(
    visibleKeys(["forecast", "tide", "rocks"], ["rocks"], KEYS),
    ["forecast", "tide", "livewind", "bulletin", "isobar"]
  );
});

test("reorder moves an item from one index to another", () => {
  assert.deepEqual(reorder(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reorder(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test web/test/cardorder.test.js`
Expected: FAIL — cannot find module `../js/cards/cardorder.js`.

- [ ] **Step 3: Implement the card-ordering module**

Create `web/js/cards/cardorder.js`:

```js
// Pure card-ordering helpers. No DOM, no imports — safe to unit-test directly.

// The full ordered list of every known card key (visible AND hidden): the stored
// order first (known keys only, de-duplicated), then any registered card missing
// from the stored order, in registry order. Forward-compatible: a card added to
// the registry later still appears even if the user's saved order predates it.
export function orderedKeys(order, registryKeys) {
  const known = new Set(registryKeys);
  const seen = new Set();
  const out = [];
  for (const k of order || []) {
    if (known.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  }
  for (const k of registryKeys) {
    if (!seen.has(k)) { out.push(k); seen.add(k); }
  }
  return out;
}

// The visible cards: orderedKeys minus the hidden set.
export function visibleKeys(order, hidden, registryKeys) {
  const hiddenSet = new Set(hidden || []);
  return orderedKeys(order, registryKeys).filter((k) => !hiddenSet.has(k));
}

// Immutably move list[from] to index `to`.
export function reorder(list, from, to) {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test web/test/cardorder.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Extend the settings model**

Edit `web/js/settings.js`. Replace the `DEFAULTS` object and `mergeSettings` function with:

```js
export const DEFAULTS = {
  lang: "fr",
  themePref: "auto",
  place: "Penfret · Glénan",
  lat: 47.716,
  lon: -3.950,
  stationNid: 6,
  stationLabel: "Drénec",
  port: "94",
  zone: "BMSCOTE-01-04",
  chartVariant: "bw",
  forecastModel: "arome_hd",
  cardOrder: ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"],
  cardHidden: ["rocks"],
  rocks: [],
  draft: 1.5,
};

// Pure: DEFAULTS overlaid with only the known keys from `stored`. Array-valued
// settings are cloned (never shared with DEFAULTS or across calls) so callers can
// mutate settings.rocks / settings.cardOrder without corrupting the defaults.
export function mergeSettings(stored) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = Array.isArray(DEFAULTS[key]) ? DEFAULTS[key].slice() : DEFAULTS[key];
  }
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && stored[key] !== undefined) {
        out[key] = Array.isArray(stored[key]) ? stored[key].slice() : stored[key];
      }
    }
  }
  return out;
}
```

(Leave `STORAGE_KEY`, `loadSettings`, and `saveSetting` unchanged.)

- [ ] **Step 6: Add the settings-model tests**

Append to `web/test/settings.test.js`:

```js
test("mergeSettings provides card + rocks + draft defaults", () => {
  const s = mergeSettings({});
  assert.deepEqual(s.cardOrder, ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"]);
  assert.deepEqual(s.cardHidden, ["rocks"]);
  assert.deepEqual(s.rocks, []);
  assert.equal(s.draft, 1.5);
});

test("mergeSettings clones array defaults (no shared reference)", () => {
  const a = mergeSettings({});
  a.rocks.push({ id: "x" });
  a.cardOrder.push("ghost");
  const b = mergeSettings({});
  assert.equal(b.rocks.length, 0);
  assert.equal(b.cardOrder.includes("ghost"), false);
});
```

- [ ] **Step 7: Run settings + cardorder tests**

Run: `node --test web/test/settings.test.js web/test/cardorder.test.js`
Expected: PASS (all).

- [ ] **Step 8: Create the card registry**

Create `web/js/cards/registry.js`:

```js
import { mountForecastCard } from "./forecast.js";
import { mountLiveWindCard } from "./livewind.js";
import { mountTideCard } from "./tide.js";
import { mountBulletinCard } from "./bulletin.js";
import { mountIsobarCard } from "./isobar.js";

// The single source of truth for which cards exist, their DOM section id, the i18n
// key for their display title (used by the settings page), and their mount fn.
// Order here is the fallback order for users whose saved cardOrder predates a card.
// (The Rocks card is registered in Task 4.)
export const CARD_REGISTRY = [
  { key: "forecast", el: "card-forecast", titleKey: "forecast_title", mount: mountForecastCard },
  { key: "livewind", el: "card-livewind", titleKey: "livewind_title", mount: mountLiveWindCard },
  { key: "tide",     el: "card-tide",     titleKey: "tide_title",     mount: mountTideCard },
  { key: "bulletin", el: "card-bulletin", titleKey: "bulletin_title", mount: mountBulletinCard },
  { key: "isobar",   el: "card-isobar",   titleKey: "isobar_title",   mount: mountIsobarCard },
];

export const REGISTRY_KEYS = CARD_REGISTRY.map((c) => c.key);
```

- [ ] **Step 9: Refactor index.html to a dynamic stack**

Edit `web/index.html`. Replace the `<main>` block (currently the five `<section>` cards) with a single empty stack:

```html
  <main class="stack" id="card-stack"></main>
```

Leave the `<header>`, `#alert-strip`, and `<footer>` unchanged.

- [ ] **Step 10: Refactor app.js to render from the registry**

Edit `web/js/app.js`. Replace the imports of the individual `mount*Card` functions and the five module-level `*Card` variables with the registry, and replace `renderAll` + the card-specific parts of `wireEvents`. Concretely:

Replace the top card imports (lines importing `mountForecastCard`…`mountBulletinCard`) with:

```js
import { CARD_REGISTRY, REGISTRY_KEYS } from "./cards/registry.js";
import { visibleKeys } from "./cards/cardorder.js";
```

Replace the five `let forecastCard = null;` … `let bulletinCard = null;` declarations with:

```js
const mounted = {}; // card key -> { state, refresh } handle
```

Replace the whole `renderAll` function with:

```js
function renderCards() {
  const keys = visibleKeys(state.settings.cardOrder, state.settings.cardHidden, REGISTRY_KEYS);
  const stack = document.getElementById("card-stack");
  const byKey = (k) => CARD_REGISTRY.find((c) => c.key === k);

  // Ensure a <section> exists for each visible card and appears in the right order.
  // appendChild on an already-attached node MOVES it, so this both creates and reorders.
  for (const key of keys) {
    const reg = byKey(key);
    let sec = document.getElementById(reg.el);
    if (!sec) {
      sec = document.createElement("section");
      sec.id = reg.el;
      sec.className = "card";
    }
    stack.appendChild(sec);
  }

  // Drop sections whose card is no longer visible, and forget their mount handle so
  // re-showing does a fresh mount (reloads data).
  const visibleEls = new Set(keys.map((k) => byKey(k).el));
  for (const sec of [...stack.children]) {
    if (!visibleEls.has(sec.id)) {
      const gone = CARD_REGISTRY.find((c) => c.el === sec.id);
      if (gone) delete mounted[gone.key];
      sec.remove();
    }
  }

  // Mount once, else refresh with the latest settings.
  for (const key of keys) {
    const reg = byKey(key);
    if (!mounted[key]) mounted[key] = reg.mount(state.settings);
    else { mounted[key].state.settings = state.settings; mounted[key].refresh(); }
  }
}

function renderAll() {
  renderHeader();
  renderCards();
  renderFooter();
}
```

Replace the manual refresh handler body (the `btn-refresh` click listener that calls each `*Card.refresh()`) with:

```js
  document.getElementById("btn-refresh").addEventListener("click", () => {
    renderHeader();
    for (const key of Object.keys(mounted)) mounted[key].refresh();
  });
```

Leave `renderHeader`, `updateThemeButton`, `renderFooter`, `cardKeyToTitle`, `SOURCES`, the lang/theme/location handlers, and `start()` unchanged.

- [ ] **Step 11: Update the app smoke for dynamic sections**

Overwrite `.superpowers/sdd/smoke-app.mjs` with:

```js
// Throwaway controller verification (NOT committed as a project test).
// Stubs a minimal DOM/window/localStorage, imports the real web/js/app.js, and
// exercises the interactive wiring. Cards are now created dynamically into
// #card-stack, so the DOM stub supports createElement + appendChild + id lookup.
import assert from "node:assert/strict";

const STATIC_IDS = [
  "header-place", "header-datetime", "btn-refresh", "btn-lang", "btn-settings",
  "footer-credits", "card-stack",
];

const allEls = [];
function makeEl() {
  const el = {
    id: "", textContent: "", innerHTML: "",
    dataset: {}, _attrs: {}, _click: null, className: "",
    children: [],
    get offsetWidth() { return 0; },
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] ?? null; },
    addEventListener(type, fn) { if (type === "click") this._click = fn; },
    click() { if (this._click) this._click(); },
    appendChild(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) this.children.splice(i, 1); // move semantics
      this.children.push(child);
      return child;
    },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  allEls.push(el);
  return el;
}

const staticEls = Object.fromEntries(STATIC_IDS.map((id) => {
  const el = makeEl(); el.id = id; return [id, el];
}));
const documentElement = { dataset: {}, lang: "" };

globalThis.document = {
  documentElement,
  getElementById: (id) => staticEls[id] ?? allEls.find((e) => e.id === id) ?? null,
  createElement: () => makeEl(),
};

let prefersDark = false;
globalThis.window = {
  matchMedia: (q) => ({ media: q, get matches() { return prefersDark; }, addEventListener() {} }),
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

await import("../../web/js/app.js");

const card = (elId) => staticEls["card-stack"].children.find((c) => c.id === elId);

// --- 1. Initial render: rocks hidden by default, other four cards present, in order ---
assert.equal(staticEls["header-place"].textContent, "Penfret · Glénan", "header place");
assert.ok(card("card-forecast").innerHTML.includes("Prévision vent · 24 h"), "forecast FR title");
assert.ok(card("card-livewind").innerHTML.includes("Vent actuel"), "livewind FR title");
assert.ok(card("card-tide").innerHTML.includes("Marée"), "tide FR title");
assert.ok(card("card-bulletin").innerHTML.includes("Situation générale"), "bulletin FR title");
assert.ok(card("card-isobar").innerHTML.includes("Isobares · Met Office"), "isobar FR title");
assert.equal(card("card-rocks"), undefined, "rocks hidden by default");
const order = staticEls["card-stack"].children.map((c) => c.id);
assert.deepEqual(order,
  ["card-forecast", "card-livewind", "card-tide", "card-bulletin", "card-isobar"],
  "cards render in default order");
assert.equal((staticEls["footer-credits"].innerHTML.match(/<a /g) || []).length, 5, "footer 5 links");
assert.equal(documentElement.dataset.theme, "light", "auto+lightOS -> light");

// --- 2. FR -> EN toggle ---
staticEls["btn-lang"].click();
assert.equal(staticEls["btn-lang"].textContent, "EN", "lang flips to EN");
assert.ok(card("card-forecast").innerHTML.includes("Wind forecast · 24 h"), "forecast EN title");

// --- 3. Theme cycle ---
staticEls["btn-settings"].click();
assert.equal(documentElement.dataset.theme, "dark", "theme -> dark");
staticEls["btn-settings"].click();
assert.equal(documentElement.dataset.theme, "light", "theme -> light");

console.log("SMOKE OK: dynamic registry render + order + FR/EN + theme cycle verified");
```

- [ ] **Step 12: Run the full web suite + app smoke**

Run: `npm test && node .superpowers/sdd/smoke-app.mjs`
Expected: all `node --test` files PASS; smoke prints `SMOKE OK: dynamic registry render + order + FR/EN + theme cycle verified`.

- [ ] **Step 13: Commit**

```bash
git add web/js/settings.js web/js/cards/cardorder.js web/js/cards/registry.js web/js/app.js web/index.html web/test/cardorder.test.js web/test/settings.test.js .superpowers/sdd/smoke-app.mjs
git commit -m "$(printf 'feat(cards): drive dashboard from a card registry\n\nReplace the five hardcoded card sections with a registry + cardOrder/\ncardHidden settings, rendered into an empty #card-stack. Adds rocks/draft\ndefaults (used by later tasks). No visible change yet.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Settings page (toggles, draft, long-press reorder)

**Files:**
- Create: `web/js/cards/settingspage.js`
- Create: `web/css/settings.css`
- Modify: `web/index.html` (add ☰ button + link settings.css)
- Modify: `web/js/app.js` (wire ☰ to open the page)
- Modify: `web/js/i18n.js` (settings strings)
- Create smoke: `.superpowers/sdd/smoke-settings.mjs`

**Interfaces:**
- Consumes: `CARD_REGISTRY`, `REGISTRY_KEYS` from `registry.js`; `orderedKeys`, `reorder` from `cardorder.js`; `saveSetting` from `settings.js`; `t` from `i18n.js`; `escapeHTML` from `util/html.js`.
- Produces: `openSettingsPage(settings, onClose) -> void`. It mutates `settings.cardHidden`, `settings.cardOrder`, and `settings.draft` in place AND persists each via `saveSetting`, then calls `onClose()` when the ← button (or backdrop) closes it.

- [ ] **Step 1: Write the failing settings smoke**

Create `.superpowers/sdd/smoke-settings.mjs`:

```js
// Throwaway: verifies the settings overlay builds a row per REGISTERED card, a
// draft field, and closes without throwing. The DOM stub returns usable elements
// from querySelector (so settingspage's .addEventListener wiring never hits null)
// and [] from querySelectorAll.
import assert from "node:assert/strict";

const created = [];
function makeEl() {
  const el = {
    id: "", className: "", innerHTML: "", value: "", checked: false, _attrs: {},
    dataset: {}, children: [], _listeners: {},
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] ?? null; },
    addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    closest() { return makeEl(); },
    getBoundingClientRect() { return { top: 0, height: 40 }; },
    // Non-null stubs: any querySelector returns a fresh element (so chained
    // .addEventListener works); querySelectorAll returns an empty list.
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
  };
  created.push(el);
  return el;
}

globalThis.document = {
  body: { appendChild() {} },
  createElement: () => makeEl(),
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { openSettingsPage } = await import("../../web/js/cards/settingspage.js");

const settings = {
  lang: "fr",
  cardOrder: ["forecast", "livewind", "tide", "bulletin", "isobar"],
  cardHidden: [],
  draft: 1.5,
};
let closed = false;
openSettingsPage(settings, () => { closed = true; });

const host = created.find((e) => e.className === "set-modal");
assert.ok(host, "overlay created");
assert.ok(host.innerHTML.includes("set-row"), "renders card rows");
// One row per REGISTERED card (5 in Task 2; rocks is registered in Task 4).
assert.equal((host.innerHTML.match(/class="set-row"/g) || []).length, 5, "a row per registered card");
assert.ok(host.innerHTML.includes("Prévision vent"), "shows a real card title");
assert.ok(host.innerHTML.includes("set-draft"), "draft field present");
assert.ok(host.innerHTML.includes('value="1.5"'), "draft prefilled from settings");

console.log("SETTINGS SMOKE OK: overlay builds a row per card + draft field, no throw");
```

> Note: the settings page builds its own DOM; a faithful headless smoke of toggle/drag geometry is brittle. Keep this smoke to "overlay + rows build without throwing"; the toggle/draft/reorder *logic* is covered by the `reorder` unit test (Task 1) and manual in-browser verification. Do not over-invest in simulating pointer geometry here. When Rocks is registered (Task 4), this smoke's row count becomes 6 — update the `5` above to `6` in that task if you re-run it.

- [ ] **Step 2: Run it to verify it fails**

Run: `node .superpowers/sdd/smoke-settings.mjs`
Expected: FAIL — cannot find module `../../web/js/cards/settingspage.js`.

- [ ] **Step 3: Add settings i18n strings**

Edit `web/js/i18n.js`. After the existing `settings:` line, add:

```js
  settings_cards:   { fr: "Cartes",                en: "Cards" },
  settings_draft:   { fr: "Mon tirant d'eau (m)",  en: "My draught (m)" },
  settings_back:    { fr: "Retour",                en: "Back" },
```

- [ ] **Step 4: Implement the settings page**

Create `web/js/cards/settingspage.js`:

```js
import { CARD_REGISTRY, REGISTRY_KEYS } from "./registry.js";
import { orderedKeys, reorder } from "./cardorder.js";
import { saveSetting } from "../settings.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

const LONG_PRESS_MS = 350;

// Full-screen settings overlay. ☰ opens it; ← (or backdrop) closes it and calls
// onClose(). Toggles persist cardHidden; long-press-drag on the handle persists
// cardOrder; the draft input persists draft. All three also mutate `settings` in
// place so the caller's live settings object stays current.
export function openSettingsPage(settings, onClose) {
  const { lang } = settings;
  const title = (key) => t(lang, CARD_REGISTRY.find((c) => c.key === key).titleKey);

  const host = document.createElement("div");
  host.className = "set-modal";

  const rowsHTML = () => orderedKeys(settings.cardOrder, REGISTRY_KEYS).map((key) => {
    const hidden = (settings.cardHidden || []).includes(key);
    return `<li class="set-row" data-key="${key}">` +
      `<span class="set-handle" data-act="handle" aria-hidden="true">⠿</span>` +
      `<span class="set-label">${escapeHTML(title(key))}</span>` +
      `<label class="set-switch"><input type="checkbox" data-act="toggle" ${hidden ? "" : "checked"} />` +
      `<span class="set-slider"></span></label>` +
      `</li>`;
  }).join("");

  host.innerHTML =
    `<div class="set-panel">` +
      `<div class="set-head">` +
        `<button class="iconbtn" data-act="close" aria-label="${t(lang, "settings_back")}">←</button>` +
        `<span class="set-title">${t(lang, "settings")}</span>` +
      `</div>` +
      `<h3 class="set-section">${t(lang, "settings_cards")}</h3>` +
      `<ul class="set-list">${rowsHTML()}</ul>` +
      `<label class="set-field">${t(lang, "settings_draft")}` +
        `<input class="set-draft" type="number" inputmode="decimal" step="0.1" min="0" value="${settings.draft}" />` +
      `</label>` +
    `</div>`;

  document.body.appendChild(host);

  const close = () => { host.remove(); onClose(); };
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  // Card on/off toggles.
  host.querySelectorAll('[data-act="toggle"]').forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.closest(".set-row").getAttribute("data-key");
      const hidden = new Set(settings.cardHidden || []);
      if (input.checked) hidden.delete(key); else hidden.add(key);
      settings.cardHidden = [...hidden];
      saveSetting("cardHidden", settings.cardHidden);
    });
  });

  // Draft.
  const draftInput = host.querySelector(".set-draft");
  draftInput.addEventListener("change", () => {
    const v = parseFloat(draftInput.value);
    if (Number.isFinite(v) && v >= 0) {
      settings.draft = v;
      saveSetting("draft", v);
    }
  });

  wireDragReorder(host, settings);
}

// Long-press a row's handle, then drag to reorder. Commits cardOrder on release.
function wireDragReorder(host, settings) {
  const list = host.querySelector(".set-list");
  let pressTimer = null, dragging = null, startY = 0;

  const rows = () => [...list.querySelectorAll(".set-row")];
  const currentOrder = () => rows().map((r) => r.getAttribute("data-key"));

  list.querySelectorAll('[data-act="handle"]').forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      const row = handle.closest(".set-row");
      startY = e.clientY;
      pressTimer = setTimeout(() => {
        dragging = row;
        row.classList.add("set-row--dragging");
      }, LONG_PRESS_MS);
    });
  });

  host.addEventListener("pointermove", (e) => {
    if (pressTimer && Math.abs(e.clientY - startY) > 8) { clearTimeout(pressTimer); pressTimer = null; }
    if (!dragging) return;
    const rs = rows();
    const from = rs.indexOf(dragging);
    // Find the row whose vertical midpoint the pointer is past.
    let to = from;
    rs.forEach((r, i) => {
      const box = r.getBoundingClientRect();
      if (e.clientY > box.top + box.height / 2) to = i;
    });
    if (to !== from) {
      const order = reorder(currentOrder(), from, to);
      // Re-append rows in the new order (moves existing nodes).
      order.forEach((key) => list.appendChild(rs.find((r) => r.getAttribute("data-key") === key)));
    }
  });

  const end = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (dragging) {
      dragging.classList.remove("set-row--dragging");
      dragging = null;
      settings.cardOrder = currentOrder();
      saveSetting("cardOrder", settings.cardOrder);
    }
  };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
}
```

- [ ] **Step 5: Add the settings CSS**

Create `web/css/settings.css`:

```css
.set-modal {
  position: fixed; inset: 0; z-index: 50;
  background: var(--page-bg);
  overflow-y: auto;
}
.set-panel { max-width: 640px; margin: 0 auto; padding: 12px 16px 40px; }
.set-head { display: flex; align-items: center; gap: 12px; padding: 8px 0 16px; }
.set-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.set-section {
  margin: 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.set-list { list-style: none; margin: 0; padding: 0; }
.set-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; margin-bottom: 8px;
  background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius);
  touch-action: none; /* let the handle own vertical gestures */
}
.set-row--dragging { opacity: 0.6; }
.set-handle { cursor: grab; color: var(--text-secondary); font-size: 18px; user-select: none; }
.set-label { flex: 1; color: var(--text-body); }
.set-switch { position: relative; display: inline-block; width: 44px; height: 26px; }
.set-switch input { opacity: 0; width: 0; height: 0; }
.set-slider {
  position: absolute; inset: 0; cursor: pointer;
  background: var(--chip-bg); border-radius: 26px; transition: background 0.15s;
}
.set-slider::before {
  content: ""; position: absolute; height: 20px; width: 20px; left: 3px; top: 3px;
  background: var(--card-bg); border-radius: 50%; transition: transform 0.15s;
}
.set-switch input:checked + .set-slider { background: var(--accent); }
.set-switch input:checked + .set-slider::before { transform: translateX(18px); }
.set-field {
  display: flex; flex-direction: column; gap: 6px; margin-top: 20px;
  color: var(--text-body); font-size: 14px;
}
.set-draft {
  padding: 10px 12px; font-size: 16px;
  background: var(--card-bg); color: var(--text-primary);
  border: 1px solid var(--card-border); border-radius: var(--radius);
}
```

- [ ] **Step 6: Link CSS + add the ☰ button in index.html**

Edit `web/index.html`. Add the stylesheet link after the `location.css` link:

```html
  <link rel="stylesheet" href="./css/settings.css" />
```

In the header `<nav class="app-header__actions">`, add a menu button as the last child (after `btn-settings`):

```html
      <button id="btn-menu" class="iconbtn" type="button" aria-label="Réglages">☰</button>
```

- [ ] **Step 7: Wire ☰ in app.js**

Edit `web/js/app.js`. Add the import near the other card imports:

```js
import { openSettingsPage } from "./cards/settingspage.js";
```

In `wireEvents`, after the `btn-settings` theme handler, add:

```js
  document.getElementById("btn-menu").addEventListener("click", () => {
    openSettingsPage(state.settings, () => renderAll());
  });
```

- [ ] **Step 8: Run tests + smokes**

Run: `npm test && node .superpowers/sdd/smoke-app.mjs && node .superpowers/sdd/smoke-settings.mjs`
Expected: unit tests PASS; app smoke still prints its OK line; settings smoke prints `SETTINGS SMOKE OK: ...`.

> If the app smoke fails because `btn-menu` is missing from `STATIC_IDS`, add `"btn-menu"` to the `STATIC_IDS` array in `.superpowers/sdd/smoke-app.mjs`.

- [ ] **Step 9: Commit**

```bash
git add web/js/cards/settingspage.js web/css/settings.css web/index.html web/js/app.js web/js/i18n.js .superpowers/sdd/smoke-settings.mjs .superpowers/sdd/smoke-app.mjs
git commit -m "$(printf 'feat(settings): ☰ settings page with card toggles, draft, drag-reorder\n\nFull-screen overlay: per-card on/off switches (persist cardHidden), a\nlong-press drag handle to reorder (persist cardOrder), and a personal\ndraught field. ← closes and re-renders the dashboard.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Tide model extraction + rock safety math

**Files:**
- Modify: `web/js/charts/tidecurve.js` (export `tideModel`)
- Modify: `web/js/cards/tide.js` (use the shared `tideModel`)
- Create: `web/js/rocks/rocksafety.js`
- Create test: `web/test/rocksafety.test.js`

**Interfaces:**
- Consumes: `tideHeightAt`, `hoursFromMidnight`, `withLeadingExtreme` from `tidecurve.js`.
- Produces:
  - `tidecurve.js`: `tideModel(data) -> { extremes: {th,h,type,time}[], nowTh: number, rising: boolean }` (data shape: `{ extremes: {iso,h,type,time}[], today: "YYYY-MM-DD", port, coef }`).
  - `rocksafety.js`: `rockThreshold(rock) -> number`, `nextCrossing(extremes, threshold, fromTh) -> number|null`, `rockStatusAt(extremes, rock, nowTh) -> { safe, level, threshold, crossingTh }`, `thToClock(th) -> "HhMM"`. A `rock` is `{ height: number, ... }`; `draft` is passed in via `rockStatusAt`'s rock argument as `rock.draft` — see below.

> Design note: `rockThreshold` needs both the rock's height above datum and the boat's draft. Since draft is a personal setting (not on the rock), callers build a combined object `{ height, draft }` before calling. Keep `rockStatusAt(extremes, { height, draft }, nowTh)`.

- [ ] **Step 1: Write the failing rock-safety test**

Create `web/test/rocksafety.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { rockThreshold, nextCrossing, rockStatusAt, thToClock } from "../js/rocks/rocksafety.js";

// A simple triangular tide: low 0 m at th=0, high 6 m at th=6, low 0 m at th=12.
const EXTREMES = [
  { th: 0, h: 0 },
  { th: 6, h: 6 },
  { th: 12, h: 0 },
];

test("rockThreshold is height + draft", () => {
  assert.equal(rockThreshold({ height: 1.2, draft: 1.5 }), 2.7);
});

test("rockStatusAt: foul near low water, clear near high water", () => {
  const rock = { height: 1.0, draft: 1.0 }; // threshold 2 m
  const low = rockStatusAt(EXTREMES, rock, 0.5);
  const high = rockStatusAt(EXTREMES, rock, 6);
  assert.equal(low.safe, false, "foul just after low water");
  assert.equal(high.safe, true, "clear at high water");
  assert.equal(high.threshold, 2);
});

test("nextCrossing finds the rising crossing time", () => {
  // threshold 3 m on the rising limb (0->6 over th 0..6): crosses at th=3.
  const th = nextCrossing(EXTREMES, 3, 0);
  assert.ok(th !== null, "a crossing exists");
  assert.ok(Math.abs(th - 3) < 0.1, `crossing near th=3, got ${th}`);
});

test("nextCrossing returns null when no crossing ahead", () => {
  // threshold 10 m is never reached (max 6 m) -> null
  assert.equal(nextCrossing(EXTREMES, 10, 0), null);
});

test("thToClock formats fractional hours as HhMM", () => {
  assert.equal(thToClock(14.4), "14h24");
  assert.equal(thToClock(6), "6h00");
  assert.equal(thToClock(25.5), "1h30"); // wraps past midnight
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test web/test/rocksafety.test.js`
Expected: FAIL — cannot find module `../js/rocks/rocksafety.js`.

- [ ] **Step 3: Implement the rock-safety module**

Create `web/js/rocks/rocksafety.js`:

```js
import { tideHeightAt } from "../charts/tidecurve.js";

// Water level (m above chart datum) at or above which the boat clears the rock:
// the rock's drying height plus the boat's draught.
export function rockThreshold(rock) {
  return rock.height + rock.draft;
}

// The first time (fractional hours) after `fromTh` at which the tide curve crosses
// `threshold`, scanning in 1-minute steps. null if it never crosses within the
// model's covered window.
export function nextCrossing(extremes, threshold, fromTh) {
  const end = extremes[extremes.length - 1].th;
  const step = 1 / 60;
  let prev = tideHeightAt(extremes, fromTh) - threshold;
  for (let th = fromTh + step; th <= end + 1e-9; th += step) {
    const cur = tideHeightAt(extremes, th) - threshold;
    if ((prev <= 0 && cur > 0) || (prev > 0 && cur <= 0)) return th;
    prev = cur;
  }
  return null;
}

// Live safety for a rock at time `nowTh`. safe === water level strictly above the
// threshold. crossingTh is when that status next flips (or null).
export function rockStatusAt(extremes, rock, nowTh) {
  const threshold = rockThreshold(rock);
  const level = tideHeightAt(extremes, nowTh);
  const safe = level > threshold;
  const crossingTh = nextCrossing(extremes, threshold, nowTh);
  return { safe, level, threshold, crossingTh };
}

// Fractional hours-from-midnight -> "14h24" clock label (wraps past 24 h).
export function thToClock(th) {
  const total = Math.round((((th % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test web/test/rocksafety.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Extract the shared tide model**

Edit `web/js/charts/tidecurve.js`. After `withLeadingExtreme` (before `tideCurve`), add:

```js
// Build the render/analysis model from raw tide data: extremes as {th,h,type,time}
// sorted with a synthetic leading extreme, plus the current time (nowTh) and whether
// the tide is currently rising. Shared by the tide card and the rocks card.
export function tideModel(data) {
  const pts = withLeadingExtreme(
    data.extremes
      .map((e) => ({ th: hoursFromMidnight(e.iso, data.today), h: e.h, type: e.type, time: e.time }))
      .sort((a, b) => a.th - b.th)
  );
  const now = new Date();
  const nowTh = now.getHours() + now.getMinutes() / 60;
  const rising = tideHeightAt(pts, nowTh + 0.05) >= tideHeightAt(pts, nowTh);
  return { extremes: pts, nowTh, rising };
}
```

- [ ] **Step 6: Use the shared model in the tide card**

Edit `web/js/cards/tide.js`. Change the import on line 2 to add `tideModel` and drop the now-unneeded helpers only if unused elsewhere — keep it minimal:

```js
import { tideModel } from "../charts/tidecurve.js";
```

Delete the local `toModel` function (lines 20–30) and change `renderTide` to call `tideModel`:

```js
    const data = await fetchTide(state.settings.port);
    const svg = tideCurve(tideModel(data), { lang });
```

(Remove the old `import { hoursFromMidnight, tideHeightAt, tideCurve, withLeadingExtreme } from ...` and replace with `import { tideCurve, tideModel } from "../charts/tidecurve.js";`.)

- [ ] **Step 7: Run the full suite (tide behaviour unchanged)**

Run: `npm test`
Expected: PASS, including any existing `tidecurve` / tide tests.

- [ ] **Step 8: Commit**

```bash
git add web/js/charts/tidecurve.js web/js/cards/tide.js web/js/rocks/rocksafety.js web/test/rocksafety.test.js
git commit -m "$(printf 'feat(rocks): rock safety math + shared tide model\n\nExtract tideModel() so both the tide card and rocks reuse the cosine\ninterpolation. Add pure rockThreshold/nextCrossing/rockStatusAt/thToClock:\nclear when water level > rock height + draught, with the next flip time.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: Rocks card (list + live status) + registry entry

**Files:**
- Create: `web/js/cards/rocks.js`
- Modify: `web/js/cards/registry.js` (register rocks)
- Create: `web/css/rocks.css`
- Modify: `web/css/tokens.css` (rock pill tokens)
- Modify: `web/index.html` (link rocks.css)
- Modify: `web/js/i18n.js` (rock strings)
- Create smoke: `.superpowers/sdd/smoke-rocks.mjs`

**Interfaces:**
- Consumes: `fetchTide` from `sources/tide.js`; `tideModel` from `charts/tidecurve.js`; `rockStatusAt`, `thToClock` from `rocks/rocksafety.js`; `mountCard`, `skeletonHTML`, `errorHTML` from `card.js`; `t`, `escapeHTML`; `settings.rocks`, `settings.draft`.
- Produces: `mountRocksCard(settings) -> { state, refresh }`; registry entry `{ key: "rocks", el: "card-rocks", titleKey: "rocks_title", mount: mountRocksCard }`. Emits a ＋ button `[data-act="add"]` and per-row `[data-act="del"]` with `data-id` — the click handlers are stubs here (real form wired in Task 5); deletion is wired in Task 5.

- [ ] **Step 1: Write the failing rocks smoke**

Create `.superpowers/sdd/smoke-rocks.mjs`:

```js
// Throwaway: mounts the rocks card with two rocks and asserts each renders a
// clear/foul status. Stubs fetchTide via a fixed tide payload.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = new URL("../../web/config.js", import.meta.url);
const ORIGINAL = readFileSync(CONFIG, "utf8");
writeFileSync(CONFIG, 'export const WORKER_URL = "https://test.worker";\n');

try {
  const nodes = {};
  function el() {
    const n = {
      id: "", innerHTML: "", className: "", style: {}, _attrs: {},
      classList: { add() {}, remove() {} }, get offsetWidth() { return 0; },
      setAttribute(k, v) { this._attrs[k] = v; }, getAttribute(k) { return this._attrs[k] ?? null; },
      addEventListener() {}, appendChild() {}, remove() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
    return n;
  }
  nodes["card-rocks"] = el();
  globalThis.document = {
    getElementById: (id) => nodes[id] ?? null,
    createElement: () => el(),
  };

  const today = new Date().toISOString().slice(0, 10);
  // High water now-ish so a low rock is clear; extremes around the day.
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      port: "Penfret", coef: ["95"], today,
      extremes: [
        { iso: `${today}T00:30`, h: 0.8, type: "low",  time: "00:30" },
        { iso: `${today}T06:45`, h: 5.4, type: "high", time: "06:45" },
        { iso: `${today}T13:00`, h: 0.9, type: "low",  time: "13:00" },
        { iso: `${today}T19:15`, h: 5.6, type: "high", time: "19:15" },
      ],
    }),
  });

  const { mountRocksCard } = await import("../../web/js/cards/rocks.js");
  const settings = {
    lang: "fr", lat: 47.716, lon: -3.95, draft: 1.2,
    rocks: [
      { id: "a", name: "Basse Jaune", lat: 47.72, lon: -3.94, height: 0.5, port: "94", zone: "BMSCOTE-01-04" },
      { id: "b", name: "Roche Haute", lat: 47.70, lon: -3.96, height: 5.0, port: "94", zone: "BMSCOTE-01-04" },
    ],
  };
  const card = mountRocksCard(settings);
  await new Promise((r) => setTimeout(r, 30));

  const html = nodes["card-rocks"].innerHTML;
  assert.ok(html.includes("Basse Jaune") && html.includes("Roche Haute"), "both rocks listed");
  assert.ok(html.includes("rock-pill"), "status pills rendered");
  assert.ok(html.includes('data-act="add"'), "add (+) button present");

  console.log("ROCKS SMOKE OK: list + per-rock status pills + add button");
} finally { writeFileSync(CONFIG, ORIGINAL); }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node .superpowers/sdd/smoke-rocks.mjs`
Expected: FAIL — cannot find module `../../web/js/cards/rocks.js`.

- [ ] **Step 3: Add rock i18n strings**

Edit `web/js/i18n.js`. Add near the other card titles:

```js
  rocks_title:      { fr: "Cailloux",              en: "Rocks" },
  rocks_none:       { fr: "Aucun caillou enregistré. Touchez + pour en ajouter.",
                      en: "No rocks yet. Tap + to add one." },
  rocks_clear:      { fr: "praticable",            en: "clear" },
  rocks_foul:       { fr: "découvre",              en: "foul" },
  rocks_until:      { fr: "jusqu'à",               en: "until" },
  rocks_clear_from: { fr: "praticable à",          en: "clear from" },
```

- [ ] **Step 4: Add rock pill tokens**

Edit `web/css/tokens.css`. In the LIGHT `:root` block (after `--danger: #A32D2D;`) add:

```css
  --rock-clear-bg: #E6F1FB; --rock-clear-text: #0C447C;
  --rock-foul-bg: #F7DCDC;  --rock-foul-text: #A32D2D;
```

In the `:root[data-theme="dark"]` block (after `--danger: #F09595;`) add:

```css
  --rock-clear-bg: #0C447C; --rock-clear-text: #B5D4F4;
  --rock-foul-bg: #5A1E1E;  --rock-foul-text: #F09595;
```

- [ ] **Step 5: Add the rocks CSS**

Create `web/css/rocks.css`:

```css
.rocks-list { list-style: none; margin: 0; padding: 0; }
.rock-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--hairline);
}
.rock-row:last-child { border-bottom: 0; }
.rock-main { flex: 1; min-width: 0; }
.rock-name { color: var(--text-primary); font-weight: 600; }
.rock-status { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }
.rock-pill {
  flex-shrink: 0; padding: 3px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
}
.rock-pill--clear { background: var(--rock-clear-bg); color: var(--rock-clear-text); }
.rock-pill--foul  { background: var(--rock-foul-bg);  color: var(--rock-foul-text); }
.rock-del {
  flex-shrink: 0; background: none; border: 0; cursor: pointer;
  color: var(--text-secondary); font-size: 16px; padding: 4px;
}
.rocks-none { color: var(--text-secondary); font-size: 13px; padding: 6px 0; }
.rock-add { background: none; border: 0; cursor: pointer; color: var(--accent); font-size: 20px; line-height: 1; padding: 0 4px; }
```

- [ ] **Step 6: Implement the rocks card**

Create `web/js/cards/rocks.js`:

```js
import { fetchTide } from "../sources/tide.js";
import { tideModel } from "../charts/tidecurve.js";
import { rockStatusAt, thToClock } from "../rocks/rocksafety.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-rocks";
const SOURCE = "https://maree.info/";

function titleRow(lang) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "rocks_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="rock-add" data-act="add" type="button" aria-label="+">＋</button>` +
    `</span></div>`;
}

function statusLine(lang, st) {
  const clock = st.crossingTh != null ? thToClock(st.crossingTh) : null;
  if (st.safe) {
    return clock ? `${t(lang, "rocks_clear")} · ${t(lang, "rocks_until")} ${clock}` : t(lang, "rocks_clear");
  }
  return clock ? `${t(lang, "rocks_foul")} · ${t(lang, "rocks_clear_from")} ${clock}` : t(lang, "rocks_foul");
}

function rowHTML(lang, rock, st) {
  const pill = st.safe
    ? `<span class="rock-pill rock-pill--clear">${t(lang, "rocks_clear")}</span>`
    : `<span class="rock-pill rock-pill--foul">${t(lang, "rocks_foul")}</span>`;
  return `<li class="rock-row" data-id="${escapeHTML(rock.id)}">` +
    `<div class="rock-main">` +
      `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
      `<div class="rock-status">${statusLine(lang, st)}</div>` +
    `</div>` +
    pill +
    `<button class="rock-del" data-act="del" data-id="${escapeHTML(rock.id)}" type="button" aria-label="✕">✕</button>` +
    `</li>`;
}

// Fetch each distinct rock port once, compute status per rock. A rock whose port
// fetch fails is skipped from the status computation (shown with a foul-unknown
// fallback is overkill — just omit its status line gracefully).
async function computeRows(lang, rocks, draft) {
  const ports = [...new Set(rocks.map((r) => r.port).filter(Boolean))];
  const models = new Map();
  await Promise.all(ports.map(async (port) => {
    try { models.set(port, tideModel(await fetchTide(port))); } catch { /* leave unset */ }
  }));
  return rocks.map((rock) => {
    const model = models.get(rock.port);
    if (!model) return { rock, st: null };
    const st = rockStatusAt(model.extremes, { height: rock.height, draft }, model.nowTh);
    return { rock, st };
  });
}

export async function renderRocks(state) {
  const { lang } = state.settings;
  const rocks = state.settings.rocks || [];
  if (!rocks.length) {
    mountCard(CARD_ID, titleRow(lang) + `<p class="rocks-none">${t(lang, "rocks_none")}</p>`);
    bindRocks(state);
    return;
  }
  mountCard(CARD_ID, titleRow(lang) + skeletonHTML(2, false));
  try {
    const rows = await computeRows(lang, rocks, state.settings.draft);
    const body = rows.map(({ rock, st }) =>
      st ? rowHTML(lang, rock, st)
         : `<li class="rock-row" data-id="${escapeHTML(rock.id)}"><div class="rock-main">` +
           `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
           `<div class="rock-status">—</div></div>` +
           `<button class="rock-del" data-act="del" data-id="${escapeHTML(rock.id)}" type="button" aria-label="✕">✕</button></li>`
    ).join("");
    mountCard(CARD_ID, titleRow(lang) + `<ul class="rocks-list">${body}</ul>`, { fade: true });
    bindRocks(state);
  } catch {
    mountCard(CARD_ID, titleRow(lang) + errorHTML(lang, SOURCE));
    bindRocks(state);
  }
}

// Click wiring. The add-form and delete are fully wired in Task 5; here the add
// button is a no-op placeholder and delete is unhandled.
function bindRocks(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  // (Task 5 attaches add/del handlers here.)
}

export function mountRocksCard(settings) {
  const state = { settings };
  renderRocks(state);
  return { state, refresh: () => renderRocks(state) };
}
```

- [ ] **Step 7: Register the rocks card**

Edit `web/js/cards/registry.js`. Add the import and the registry entry (placed after `tide`, matching the default `cardOrder`):

```js
import { mountRocksCard } from "./rocks.js";
```

```js
  { key: "tide",     el: "card-tide",     titleKey: "tide_title",     mount: mountTideCard },
  { key: "rocks",    el: "card-rocks",    titleKey: "rocks_title",    mount: mountRocksCard },
  { key: "bulletin", el: "card-bulletin", titleKey: "bulletin_title", mount: mountBulletinCard },
```

- [ ] **Step 8: Link rocks.css in index.html**

Edit `web/index.html`. Add after the `settings.css` link:

```html
  <link rel="stylesheet" href="./css/rocks.css" />
```

- [ ] **Step 9: Run tests + smokes**

Run: `npm test && node .superpowers/sdd/smoke-rocks.mjs && node .superpowers/sdd/smoke-app.mjs`
Expected: unit tests PASS; rocks smoke prints `ROCKS SMOKE OK: ...`; app smoke still OK (rocks stays hidden by default, so its section is absent — unchanged assertion holds).

- [ ] **Step 10: Commit**

```bash
git add web/js/cards/rocks.js web/js/cards/registry.js web/css/rocks.css web/css/tokens.css web/index.html web/js/i18n.js .superpowers/sdd/smoke-rocks.mjs
git commit -m "$(printf 'feat(rocks): rocks card with live clear/foul status\n\nRegistry card (default hidden). Per rock, fetches its tide port and shows\na blue clear / red foul pill plus the next flip time as a clock (praticable\njusqu'\\''à 14h24 / découvre · praticable à 15h10). Add/delete wired next.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: Add / delete rock form

**Files:**
- Create: `web/js/cards/rockform.js`
- Modify: `web/js/cards/rocks.js` (wire ＋ open + ✕ delete)
- Modify: `web/css/rocks.css` (form modal styles)
- Modify: `web/js/i18n.js` (form strings)
- Create test: `web/test/rockform.test.js`
- Modify smoke: `.superpowers/sdd/smoke-rocks.mjs` (assert add form opens)

**Interfaces:**
- Consumes: `PORTS` from `data/ports.js`; `nearest` from `util/geo.js`; `resolveLocation` from `location.js`; `t`, `escapeHTML`.
- Produces:
  - `rockform.js`: `newRockId() -> string`; `deriveRock({ name, lat, lon, height, port }) -> rock` where the returned rock fills `id`, `zone` (via `resolveLocation`), and defaults `port` to the nearest port when omitted; `openRockForm(settings, onSave) -> void` (modal; calls `onSave(rock)`).
  - `rocks.js` `bindRocks` now opens the form on ＋ and deletes on ✕, persisting `settings.rocks` via `saveSetting`.

- [ ] **Step 1: Write the failing rockform test**

Create `web/test/rockform.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { newRockId, deriveRock } from "../js/cards/rockform.js";

test("newRockId returns a non-empty unique-ish string", () => {
  const a = newRockId(), b = newRockId();
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("deriveRock fills id + zone and derives nearest port when omitted", () => {
  const rock = deriveRock({ name: "Basse Jaune", lat: 47.72, lon: -3.94, height: 0.6 });
  assert.equal(rock.name, "Basse Jaune");
  assert.equal(rock.height, 0.6);
  assert.ok(rock.id, "has an id");
  assert.ok(rock.zone, "has a zone code");
  assert.equal(rock.port, "94", "nearest port to the Glénan is Penfret (94)");
});

test("deriveRock keeps an explicit port override", () => {
  const rock = deriveRock({ name: "x", lat: 47.6, lon: -2.8, height: 1, port: "107" });
  assert.equal(rock.port, "107", "override wins over nearest");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test web/test/rockform.test.js`
Expected: FAIL — cannot find module `../js/cards/rockform.js`.

- [ ] **Step 3: Add form i18n strings**

Edit `web/js/i18n.js`. Add after the rock strings:

```js
  rocks_add_title:  { fr: "Ajouter un caillou",    en: "Add a rock" },
  rocks_name:       { fr: "Nom",                   en: "Name" },
  rocks_lat:        { fr: "Latitude",              en: "Latitude" },
  rocks_lon:        { fr: "Longitude",             en: "Longitude" },
  rocks_height:     { fr: "Hauteur au-dessus du zéro (m)", en: "Height above datum (m)" },
  rocks_port:       { fr: "Port de marée",         en: "Tide port" },
  rocks_port_auto:  { fr: "Automatique (le plus proche)", en: "Automatic (nearest)" },
  rocks_save:       { fr: "Ajouter",               en: "Add" },
```

- [ ] **Step 4: Implement the rock form**

Create `web/js/cards/rockform.js`:

```js
import { PORTS } from "../data/ports.js";
import { nearest } from "../util/geo.js";
import { resolveLocation } from "../location.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

export function newRockId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Build a complete rock record from raw form values: assign an id, derive the tide
// zone from the coordinate, and default the tide port to the nearest one unless the
// caller passed an explicit override.
export function deriveRock({ name, lat, lon, height, port }) {
  const derived = resolveLocation({ lat, lon });
  const chosenPort = port || nearest(lat, lon, PORTS).item.id;
  return {
    id: newRockId(),
    name: name.trim(),
    lat, lon,
    height,
    port: chosenPort,
    zone: derived.zone,
  };
}

// Modal to add a rock. Coordinate + port are prefilled from the current dashboard
// location; the port select defaults to "auto" (nearest) but can be overridden.
export function openRockForm(settings, onSave) {
  const { lang, lat, lon } = settings;
  const host = document.createElement("div");
  host.className = "rf-modal";

  const portOpts = [`<option value="">${t(lang, "rocks_port_auto")}</option>`]
    .concat(PORTS.map((p) => `<option value="${p.id}">${escapeHTML(p.label)}</option>`))
    .join("");

  host.innerHTML =
    `<div class="rf-panel">` +
      `<div class="rf-head"><span class="rf-title">${t(lang, "rocks_add_title")}</span>` +
        `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
      `<label class="rf-field">${t(lang, "rocks_name")}<input class="rf-name" type="text" /></label>` +
      `<div class="rf-row">` +
        `<label class="rf-field">${t(lang, "rocks_lat")}<input class="rf-lat" type="number" step="0.0001" value="${lat}" /></label>` +
        `<label class="rf-field">${t(lang, "rocks_lon")}<input class="rf-lon" type="number" step="0.0001" value="${lon}" /></label>` +
      `</div>` +
      `<label class="rf-field">${t(lang, "rocks_height")}<input class="rf-height" type="number" step="0.1" min="0" /></label>` +
      `<label class="rf-field">${t(lang, "rocks_port")}<select class="rf-port">${portOpts}</select></label>` +
      `<button class="rf-save" data-act="save" type="button">${t(lang, "rocks_save")}</button>` +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  host.querySelector('[data-act="save"]').addEventListener("click", () => {
    const name = host.querySelector(".rf-name").value.trim();
    const lat2 = parseFloat(host.querySelector(".rf-lat").value);
    const lon2 = parseFloat(host.querySelector(".rf-lon").value);
    const height = parseFloat(host.querySelector(".rf-height").value);
    const port = host.querySelector(".rf-port").value || "";
    if (!name || !Number.isFinite(lat2) || !Number.isFinite(lon2) || !Number.isFinite(height)) return;
    close();
    onSave(deriveRock({ name, lat: lat2, lon: lon2, height, port }));
  });
}
```

- [ ] **Step 5: Run the rockform test**

Run: `node --test web/test/rockform.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire ＋ and ✕ in the rocks card**

Edit `web/js/cards/rocks.js`. Add imports at the top:

```js
import { openRockForm } from "./rockform.js";
import { saveSetting } from "../settings.js";
```

Replace the placeholder `bindRocks` with:

```js
function bindRocks(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "add") {
        openRockForm(state.settings, (rock) => {
          state.settings.rocks = [...(state.settings.rocks || []), rock];
          saveSetting("rocks", state.settings.rocks);
          renderRocks(state);
        });
      } else if (act === "del") {
        const id = btn.getAttribute("data-id");
        state.settings.rocks = (state.settings.rocks || []).filter((r) => r.id !== id);
        saveSetting("rocks", state.settings.rocks);
        renderRocks(state);
      }
    });
  });
}
```

- [ ] **Step 7: Add the form modal CSS**

Append to `web/css/rocks.css`:

```css
.rf-modal { position: fixed; inset: 0; z-index: 60; background: rgba(4, 44, 83, 0.55);
  display: flex; align-items: flex-end; justify-content: center; }
.rf-panel { width: 100%; max-width: 480px; background: var(--card-bg);
  border-radius: var(--radius) var(--radius) 0 0; padding: 16px; }
.rf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rf-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.rf-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;
  color: var(--text-body); font-size: 13px; }
.rf-row { display: flex; gap: 12px; }
.rf-row .rf-field { flex: 1; }
.rf-name, .rf-lat, .rf-lon, .rf-height, .rf-port {
  padding: 10px 12px; font-size: 16px; background: var(--page-bg); color: var(--text-primary);
  border: 1px solid var(--card-border); border-radius: 8px; }
.rf-save { width: 100%; padding: 12px; margin-top: 4px; border: 0; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
```

> The `#fff` here is on an accent-filled button; if the reviewer flags the hardcoded hex, add `--on-accent: #FFFFFF;` to both token blocks in `tokens.css` and reference `var(--on-accent)`. Prefer the token.

- [ ] **Step 8: Extend the rocks smoke to open the form**

In `.superpowers/sdd/smoke-rocks.mjs`, before the final `console.log`, add a check that the card exposes the add handler by re-rendering with an empty list and confirming the empty hint + add button:

```js
  // empty-state: no rocks -> hint + add button still present
  card.state.settings = { ...settings, rocks: [] };
  await card.refresh();
  await new Promise((r) => setTimeout(r, 10));
  const empty = nodes["card-rocks"].innerHTML;
  assert.ok(empty.includes("Aucun caillou"), "empty-state hint shown");
  assert.ok(empty.includes('data-act="add"'), "add button in empty state");
```

- [ ] **Step 9: Run the whole suite + all smokes**

Run: `npm test && node .superpowers/sdd/smoke-rocks.mjs && node .superpowers/sdd/smoke-settings.mjs && node .superpowers/sdd/smoke-app.mjs`
Expected: all unit tests PASS; every smoke prints its OK line.

- [ ] **Step 10: Commit**

```bash
git add web/js/cards/rockform.js web/js/cards/rocks.js web/css/rocks.css web/js/i18n.js web/test/rockform.test.js .superpowers/sdd/smoke-rocks.mjs
git commit -m "$(printf 'feat(rocks): add/delete rock form\n\n＋ opens a modal (name + coordinate prefilled from the current location +\nheight, with an optional tide-port override); zone and nearest port are\nderived. ✕ removes a rock. Both persist settings.rocks.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Post-plan verification

After Task 5, manually verify in a browser (no automated coverage for pointer geometry / real tide data):
1. ☰ opens settings; toggling Rocks ON makes the card appear; ← closes and the dashboard reflects the change.
2. Long-press a drag handle and reorder; reopen settings and the order persisted.
3. Add a rock at a known drying height; confirm the pill colour and the "praticable jusqu'à HHhMM" time track the real tide.
4. The "change my tirant d'eau" field changes every rock's status consistently.

## Notes for a future sharing plan (out of scope here)

The rock record already carries `{ id, name, lat, lon, height, port, zone }` — everything a future Supabase catalog needs. Draft is deliberately NOT on the rock (it is `settings.draft`), so the same shared rock can be evaluated against different boats. A sharing plan would add: an anonymous `userId` setting, a "share this rock" action posting to Supabase, and a "popular rocks in this zone" browser reading counts back. No reshaping of the local model required.

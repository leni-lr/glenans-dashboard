# Comparator Toggles, Colour Fix, Isobar Swipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the measured-wind curve and ICON-EU rendering in the same colour, let models be switched off in the comparator, and allow swiping between isobar charts in the enlarged view.

**Architecture:** The colour fix is two token values. The toggles hinge on making a line's colour a property of the model (`ci`) rather than its position in the rendered array, so hiding one model cannot recolour the rest; filtering then happens once in `compareview` and the overlay, legend, grid, and tooltip statistics all follow from it. The isobar swipe extracts three pure helpers (`chartURL`, `stepIdx`, `swipeAction`) and rebuilds the enlarged view around them, sharing `state.idx` with the card.

**Tech Stack:** Vanilla ES modules, no build step, no runtime dependencies. `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-27-compare-toggles-isobar-swipe-design.md`

## Global Constraints

- Vanilla ES modules, no build step, no runtime dependencies. Do not add anything to `package.json`.
- No hardcoded hex outside `web/css/tokens.css`.
- All external/user text through `escapeHTML` (`web/js/util/html.js`). UI strings from `t(lang, key)` are trusted and are not escaped — follow the surrounding code.
- Only setting keys present in `DEFAULTS` (`web/js/settings.js`) survive `mergeSettings`.
- Chart builders emit geometry + CSS class names only. Colour never appears in JS.
- A failing data source degrades that one element and never blanks a card.
- Web tests: `npm test`. Worker tests: `node --test worker/test/*.test.js`.
- **Baseline before starting: 115 web tests passing, 34 worker tests passing.**
- Commit after every task, conventional-commit prefixes.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `web/js/cards/modeltoggles.js` | Sheet of on/off switches for the comparison models. |
| `web/test/isobar.test.js` | Tests for the three isobar pure helpers. |
| `web/test/tokens.test.js` | Guards the palette against colour collisions. |

**Modify:**

| File | Change |
|---|---|
| `web/css/tokens.css` | `--cmp-2` off green, both themes. |
| `web/js/sources/compare.js` | `ci` on each series; new `visibleModels`. |
| `web/js/charts/compare.js` | `overlayChart` honours `ser.ci` and `opts.times`. |
| `web/js/settings.js` | `compareHidden: []` in `DEFAULTS`. |
| `web/js/cards/compareview.js` | Models button, filtering, empty state, `ci` in legend. |
| `web/js/cards/isobar.js` | `chartURL` / `stepIdx` / `swipeAction`; rebuilt enlarged view. |
| `web/css/compare.css` | `.set-modal--over` z-index escape. |
| `web/css/isobar.css` | Enlarged-view head bar. |
| `web/js/i18n.js` | `compare_models`, `compare_no_models`. |
| `web/test/compare.test.js` | `visibleModels`, `ci`, `opts.times`. |
| `web/test/settings.test.js` | `compareHidden` default + cloning. |

**Deviation from the spec, deliberate:** spec §C.5 says swiping calls `onChange()` on every swipe. This plan calls it **once, on close**. Re-rendering the card underneath a fullscreen overlay on every swipe is wasted work and risks layout jank; `state.idx` is mutated on each swipe either way, so the observable outcome — the card showing the chart you swiped to — is identical.

---

### Task 1: Colour fix + a palette guard

**Files:**
- Modify: `web/css/tokens.css` (line 46 light block, line 87 dark block)
- Create: `web/test/tokens.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. `--cmp-2` becomes amber.

- [ ] **Step 1: Write the failing test**

This guards the whole palette, not just the one collision — it is the test that would have caught this bug when the measured curve was first added.

Create `web/test/tokens.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");

// The declarations inside one selector's { ... } block.
function block(selector) {
  const i = css.indexOf(selector);
  assert.ok(i > -1, `${selector} block found`);
  const start = css.indexOf("{", i);
  return css.slice(start, css.indexOf("}", start));
}

function token(blk, name) {
  const m = blk.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`));
  assert.ok(m, `--${name} defined`);
  return m[1].toLowerCase();
}

const THEMES = [[":root {", "light"], [':root[data-theme="dark"]', "dark"]];

test("no comparison-model colour collides with the measured-wind green", () => {
  for (const [sel, name] of THEMES) {
    const blk = block(sel);
    const now = token(blk, "now");
    for (let i = 0; i < 6; i++) {
      assert.notEqual(token(blk, `cmp-${i}`), now,
        `${name}: --cmp-${i} must differ from --now (the measured curve reuses --now)`);
    }
  }
});

test("the six comparison-model colours are all distinct", () => {
  for (const [sel, name] of THEMES) {
    const blk = block(sel);
    const vals = Array.from({ length: 6 }, (_, i) => token(blk, `cmp-${i}`));
    assert.equal(new Set(vals).size, 6, `${name}: cmp-0..5 all distinct, got ${vals.join(" ")}`);
  }
});
```

- [ ] **Step 2: Run it and confirm the collision test fails**

Run: `node --test web/test/tokens.test.js`
Expected: FAIL on the first test — `light: --cmp-2 must differ from --now`. The second test passes already.

- [ ] **Step 3: Move `--cmp-2` off green**

In `web/css/tokens.css`, in the light `:root` block, change the model-colour line so `--cmp-2` reads `#9C6B10`:

```css
  --cmp-0: #0C447C; --cmp-1: #378ADD; --cmp-2: #9C6B10; --cmp-3: #D85A30; --cmp-4: #7F77DD; --cmp-5: #C0388E;
```

And in the `:root[data-theme="dark"]` block, so `--cmp-2` reads `#E0A83C`:

```css
  --cmp-0: #85B7EB; --cmp-1: #378ADD; --cmp-2: #E0A83C; --cmp-3: #F0997B; --cmp-4: #9D96F0; --cmp-5: #E88BC8;
```

Light takes the darker amber against the white card, dark the lighter against the navy panel — the convention every other token in this file follows.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 117 tests (115 baseline + 2).

- [ ] **Step 5: Commit**

```bash
git add web/css/tokens.css web/test/tokens.test.js
git commit -m "fix(tokens): ICON-EU shared the measured curve's green"
```

---

### Task 2: Stable colours + `visibleModels` + explicit axis domain

**Files:**
- Modify: `web/js/sources/compare.js` (`fetchAllModels`; new export)
- Modify: `web/js/charts/compare.js` (`overlayChart`, the `labelTimes` line and the `active.forEach` colour line)
- Modify: `web/test/compare.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `visibleModels(series, hidden) -> series[]` — order-preserving filter by `key`. Used by Task 3.
  - Each element of `fetchAllModels`'s result gains `ci: number` (its index in `COMPARE_MODELS`).
  - `overlayChart(series, opts)` honours `ser.ci` for the colour class and `opts.times` for the axis + observed domain. Used by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `web/test/compare.test.js` (add `visibleModels` to the existing `sources/compare.js` import so the line reads
`import { COMPARE_MODELS, visibleModels } from "../js/sources/compare.js";`):

```js
test("visibleModels drops hidden keys and preserves order", () => {
  const series = [{ key: "a" }, { key: "b" }, { key: "c" }];
  assert.deepEqual(visibleModels(series, ["b"]).map((s) => s.key), ["a", "c"]);
  assert.deepEqual(visibleModels(series, ["a", "c"]).map((s) => s.key), ["b"]);
  assert.deepEqual(visibleModels(series, ["a", "b", "c"]), []);
});

test("visibleModels returns everything when nothing is hidden", () => {
  const series = [{ key: "a" }, { key: "b" }];
  assert.equal(visibleModels(series, []), series);
  assert.equal(visibleModels(series, null), series);
  assert.equal(visibleModels(series, undefined), series);
});

test("overlayChart colours by ser.ci, so hiding a model cannot recolour its neighbours", () => {
  // ICON-EU is colour 2. Alone in the list its array index is 0 — without ci it
  // would render as cmp-line--0 (navy) the moment the models above it are hidden.
  const svg = overlayChart(
    [{ key: "icon", label: "ICON-EU", ci: 2, times: HOURS, speed: HOURS.map(() => 12) }]);
  assert.match(svg, /cmp-line--2/);
  assert.ok(!svg.includes("cmp-line--0"));
});

test("overlayChart without ci still colours by array position", () => {
  const svg = overlayChart([
    { key: "a", label: "A", times: HOURS, speed: HOURS.map(() => 5) },
    { key: "b", label: "B", times: HOURS, speed: HOURS.map(() => 8) },
  ]);
  assert.match(svg, /cmp-line--0/);
  assert.match(svg, /cmp-line--1/);
});

test("overlayChart with zero series still draws the measured curve from opts.times", () => {
  const svg = overlayChart([], {
    times: HOURS,
    observed: [
      { ms: at("2026-07-26T06:00"), mean: 9 },
      { ms: at("2026-07-26T18:00"), mean: 14 },
    ],
  });
  assert.match(svg, /class="mg-observed"/, "the day's real wind is still worth showing alone");
  assert.match(svg, /12h<\/text>/, "hour labels come from opts.times");
});

test("overlayChart spreads the hour labels across the plot with zero series", () => {
  // Guards a real trap: with no series the x-scale falls back to a single
  // point, which silently stacks every label on the left edge.
  const svg = overlayChart([], { times: HOURS });
  const xs = [...svg.matchAll(/<text class="mg-axis" x="([\d.]+)"[^>]*>\d+h<\/text>/g)]
    .map((m) => Number(m[1]));
  assert.ok(xs.length >= 4, `expected 0h/6h/12h/18h labels, got ${xs.length}`);
  assert.equal(new Set(xs).size, xs.length, `labels stacked at the same x: ${xs.join(",")}`);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 200, "labels span the plot width");
});

test("overlayChart with zero series and no observed data draws no line at all", () => {
  const svg = overlayChart([], { times: HOURS });
  assert.ok(!svg.includes("mg-observed"));
  assert.ok(!svg.includes("cmp-line--"));
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/compare.test.js`
Expected: FAIL — `visibleModels` is not exported, `ci` is ignored (renders `cmp-line--0`), and the zero-series chart draws no observed curve.

- [ ] **Step 3: Add `ci` and `visibleModels`**

In `web/js/sources/compare.js`, replace `fetchAllModels` and add the filter below it:

```js
// Fetch all comparison models in parallel; a failed model resolves to data:null
// so one bad model never blanks the view. `ci` is the model's fixed colour slot
// — carried on the series so filtering the list cannot recolour what remains.
export async function fetchAllModels({ lat, lon, days = 7 }) {
  return Promise.all(
    COMPARE_MODELS.map(async (m, ci) => {
      try {
        const data = await fetchForecast({ lat, lon, model: m.model, days });
        return { key: m.key, label: m.label, ci, data };
      } catch {
        return { key: m.key, label: m.label, ci, data: null };
      }
    })
  );
}

// Pure: drop the models switched off in settings.compareHidden, preserving order.
export function visibleModels(series, hidden) {
  if (!Array.isArray(hidden) || !hidden.length) return series;
  return series.filter((s) => !hidden.includes(s.key));
}
```

- [ ] **Step 4: Teach `overlayChart` about `ci` and `opts.times`**

In `web/js/charts/compare.js`, inside `overlayChart`, replace these two lines:

```js
  const maxLen = Math.max(1, ...active.map((s) => s.times.length));
  const labelTimes = (active.find((s) => s.times.length === maxLen) || {}).times || [];
```

with:

```js
  // opts.times pins the axis explicitly. Without it the domain is derived from
  // the longest series — which does not exist when every model is switched off,
  // leaving the measured curve with nothing to map against.
  const activeMax = Math.max(1, ...active.map((s) => s.times.length));
  const labelTimes = opts.times
    ?? ((active.find((s) => s.times.length === activeMax) || {}).times || []);
  // The x-scale must span the axis too: with no series activeMax is 1, which
  // would collapse every hour label onto the left edge.
  const maxLen = Math.max(activeMax, labelTimes.length);
```

`maxLen` keeps its old value whenever series are present and `opts.times` matches their length, which is always the case in `compareview` — both come from the same slice.

And in the `active.forEach` block, replace:

```js
    const idx = series.indexOf(ser);
```

with:

```js
    // Colour is the model's own slot, not its position here: a hidden model
    // above it must not shift it down the palette.
    const idx = ser.ci ?? series.indexOf(ser);
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 124 tests (117 + 7). The pre-existing `overlayChart` tests pass series without `ci` and must still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/js/sources/compare.js web/js/charts/compare.js web/test/compare.test.js
git commit -m "feat(compare): model colour keyed to the model, plus visibleModels"
```

---

### Task 3: Model toggles in the comparator

**Files:**
- Modify: `web/js/settings.js` (`DEFAULTS`)
- Create: `web/js/cards/modeltoggles.js`
- Modify: `web/js/cards/compareview.js` (imports; `legend`; `renderBody`; `openCompareView`)
- Modify: `web/css/compare.css`
- Modify: `web/js/i18n.js`
- Modify: `web/test/settings.test.js`

**Interfaces:**
- Consumes: `visibleModels`, `ci`, `opts.times` (Task 2).
- Produces:
  - `settings.compareHidden: string[]` — `COMPARE_MODELS` keys switched off.
  - `openModelToggles(settings, onChange) -> void`

- [ ] **Step 1: Write the failing test**

Append to `web/test/settings.test.js`:

```js
test("compareHidden defaults to every model shown", () => {
  assert.deepEqual(mergeSettings({}).compareHidden, []);
});

test("compareHidden round-trips through mergeSettings", () => {
  assert.deepEqual(mergeSettings({ compareHidden: ["icon", "gfs"] }).compareHidden, ["icon", "gfs"]);
});

test("compareHidden is cloned, never shared with DEFAULTS", () => {
  const a = mergeSettings({});
  a.compareHidden.push("icon");
  assert.deepEqual(mergeSettings({}).compareHidden, [], "one settings object cannot corrupt another");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test web/test/settings.test.js`
Expected: FAIL — `compareHidden` is `undefined`, so `deepEqual` against `[]` fails.

- [ ] **Step 3: Add the setting**

In `web/js/settings.js`, add to `DEFAULTS` after `cardHidden`:

```js
  compareHidden: [],
```

`mergeSettings` already clones any array-valued default, so the cloning test passes with no further change.

- [ ] **Step 4: Add the i18n keys**

In `web/js/i18n.js`, next to the other `compare_*` keys:

```js
  compare_models:    { fr: "modèles",                 en: "models" },
  compare_no_models: { fr: "aucun modèle sélectionné", en: "no models selected" },
```

- [ ] **Step 5: Build the toggle sheet**

Create `web/js/cards/modeltoggles.js`:

```js
import { COMPARE_MODELS } from "../sources/compare.js";
import { saveSetting } from "../settings.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

// Sheet of on/off switches for the comparison models, reusing the settings
// page's set-* styles. Switching one off removes it from the overlay, the
// legend, the grid, and the tooltip's mean/median. Every toggle takes effect
// immediately through onChange(), so there is nothing to confirm on close.
export function openModelToggles(settings, onChange) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.className = "set-modal set-modal--over";

  const rows = COMPARE_MODELS.map((m) => {
    const on = !(settings.compareHidden || []).includes(m.key);
    return `<li class="set-row" data-key="${m.key}">` +
      `<span class="set-label">${escapeHTML(m.label)}</span>` +
      `<label class="set-switch"><input type="checkbox" data-act="toggle" ${on ? "checked" : ""} />` +
      `<span class="set-slider"></span></label>` +
      `</li>`;
  }).join("");

  host.innerHTML =
    `<div class="set-panel">` +
      `<div class="set-head">` +
        `<button class="iconbtn" data-act="close" aria-label="${t(lang, "settings_back")}">←</button>` +
        `<span class="set-title">${t(lang, "compare_models")}</span>` +
      `</div>` +
      `<ul class="set-list">${rows}</ul>` +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  host.querySelectorAll('[data-act="toggle"]').forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.closest(".set-row").getAttribute("data-key");
      const hidden = new Set(settings.compareHidden || []);
      if (input.checked) hidden.delete(key); else hidden.add(key);
      settings.compareHidden = [...hidden];
      saveSetting("compareHidden", settings.compareHidden);
      onChange();
    });
  });
}
```

- [ ] **Step 6: Let the sheet sit above the comparator**

`.set-modal` and `.cmp-modal` are both `z-index: 50`, so the sheet would be at the mercy of DOM order. In `web/css/compare.css`, append:

```css
/* the toggle sheet opens from inside the comparator (z-index 50) and must
   clear it, and the enlarged isobar chart (70) */
.set-modal--over { z-index: 80; }
```

- [ ] **Step 7: Wire the comparator**

In `web/js/cards/compareview.js`, extend the imports:

```js
import { fetchAllModels, visibleModels, COMPARE_MODELS } from "../sources/compare.js";
import { openModelToggles } from "./modeltoggles.js";
```

Replace `legend` so the swatch follows the model's colour slot:

```js
function legend(series, lang, observed) {
  const models = series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${s.ci ?? i}"></span>${escapeHTML(s.label)}</span>`
  ).join("");
  const real = observed
    ? `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--obs"></span>${t(lang, "legend_observed")}</span>`
    : "";
  return `<div class="cmp-legend">${models}${real}</div>`;
}
```

Add the button's label helper above `renderBody`:

```js
// "modèles" normally; "modèles · 4/6" once something is switched off, so a
// model disabled days ago cannot be silently forgotten.
function modelsLabel(lang, hidden) {
  const off = (hidden || []).length;
  const total = COMPARE_MODELS.length;
  return off ? `${t(lang, "compare_models")} · ${total - off}/${total}` : t(lang, "compare_models");
}
```

Replace `renderBody` entirely:

```js
// Render overlay + legend + grid for one range (no refetch — slices in memory).
// The measured curve belongs to today only: on demain / 7 j it is dropped.
function renderBody(host, loaded, rangeKey, lang, allObserved, hidden) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[0];
  const body = host.querySelector(".cmp-body");
  if (!body) return;
  const observed = rangeKey === "today" ? allObserved : [];
  const shown = visibleModels(loaded, hidden);
  // The axis domain comes from any loaded model — including a hidden one — so
  // the overlay still has a time scale when every model is switched off.
  const withData = loaded.find((s) => s.data);
  const times = withData ? sliceData(withData.data, r.start, r.end).times : [];
  const lines = shown.filter((s) => s.data).map((s) => {
    const w = sliceData(s.data, r.start, r.end);
    return { key: s.key, label: s.label, ci: s.ci, times: w.times, speed: w.speed };
  });

  const overlay = (lines.length || observed.length)
    ? `<div class="cmp-overlay"><div class="mg-wrap">${overlayChart(lines, { lang, range: r.key, observed, times })}</div></div>${legend(shown, lang, observed.length > 0)}`
    : "";
  // "all switched off" and "all failed to load" look alike on screen but mean
  // opposite things — never collapse them into one message.
  const note = shown.length === 0
    ? `<p class="cmp-miss">${t(lang, "compare_no_models")}</p>`
    : (lines.length ? "" : `<p class="cmp-miss">${t(lang, "source_down")}</p>`);
  body.innerHTML = overlay + note + grid(shown, lang, r, observed);

  // slide tooltip on the overlay: mean + median across the SHOWN models
  const ov = body.querySelector(".cmp-overlay .mg-wrap");
  if (ov && lines.length) bindOverlayTooltip(ov, lines, lang);

  // slide tooltip on each per-model chart (cells with data, in series order)
  const wraps = body.querySelectorAll(".cmp-cell .mg-wrap");
  shown.filter((s) => s.data).forEach((s, i) => {
    if (wraps[i]) bindMeteogramTooltip(wraps[i], trimTrailingNulls(sliceData(s.data, r.start, r.end)));
  });
}
```

In `openCompareView`, add the button to the header markup:

```js
  host.innerHTML = `<div class="cmp-panel">` +
    `<div class="cmp-head"><span class="cmp-title">${t(lang, "compare_title")}</span>` +
    `<span class="cmp-head-actions">` +
      `<button class="linkbtn" data-act="models" type="button">${modelsLabel(lang, settings.compareHidden)}</button> ` +
      `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button>` +
    `</span></div>` +
    tabs(lang, range) +
    `<div class="cmp-body">${t(lang, "loading")}</div></div>`;
```

Then, after the existing close wiring, add the models button and a shared re-render:

```js
  const modelsBtn = host.querySelector('[data-act="models"]');
  const rerender = () => {
    modelsBtn.textContent = modelsLabel(lang, settings.compareHidden);
    if (loaded) renderBody(host, loaded, range, lang, observed, settings.compareHidden);
  };
  modelsBtn.addEventListener("click", () => openModelToggles(settings, rerender));
```

Update the two remaining `renderBody` call sites to pass `settings.compareHidden` — the one in the tab click handler:

```js
    if (loaded) renderBody(host, loaded, range, lang, observed, settings.compareHidden);
```

and the one in the `try` block:

```js
    renderBody(host, loaded, range, lang, observed, settings.compareHidden);
```

- [ ] **Step 8: Style the header actions**

In `web/css/compare.css`, after the `.cmp-title` rule:

```css
.cmp-head-actions { display: flex; align-items: center; gap: 4px; }
```

- [ ] **Step 9: Run the tests and syntax-check**

```bash
npm test
node --check web/js/cards/compareview.js
node --check web/js/cards/modeltoggles.js
```

Expected: PASS, 127 tests (124 + 3), and both files parse.

- [ ] **Step 10: Commit**

```bash
git add web/js/settings.js web/js/cards/modeltoggles.js web/js/cards/compareview.js web/css/compare.css web/js/i18n.js web/test/settings.test.js
git commit -m "feat(compare): switch models off, excluded from overlay and stats"
```

---

### Task 4: Isobar pure helpers

**Files:**
- Modify: `web/js/cards/isobar.js` (new exports; `bodyHTML` uses `chartURL`; `renderBody`'s prev/next uses `stepIdx`)
- Create: `web/test/isobar.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces, all used by Task 5:
  - `chartURL(state, step) -> string`
  - `stepIdx(idx, n, dir) -> number`
  - `swipeAction(dx, dy, zoomed) -> "next" | "prev" | null`

- [ ] **Step 1: Write the failing tests**

Create `web/test/isobar.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { chartURL, stepIdx, swipeAction } from "../js/cards/isobar.js";
import { WORKER_URL } from "../config.js";

test("chartURL pins step, variant and run", () => {
  const state = { variant: "bw", run: "2026-07-27T0000" };
  assert.equal(chartURL(state, 24),
    `${WORKER_URL}/api/chart?step=24&variant=bw&run=2026-07-27T0000`);
});

test("stepIdx wraps at both ends", () => {
  assert.equal(stepIdx(0, 8, 1), 1);
  assert.equal(stepIdx(7, 8, 1), 0, "past the last step wraps to the first");
  assert.equal(stepIdx(0, 8, -1), 7, "before the first wraps to the last");
  assert.equal(stepIdx(3, 8, -1), 2);
});

test("swipeAction reads a decisive horizontal drag", () => {
  assert.equal(swipeAction(-120, 10, false), "next", "swipe left advances");
  assert.equal(swipeAction(120, -10, false), "prev");
});

test("swipeAction ignores everything while zoomed — drags pan instead", () => {
  assert.equal(swipeAction(-200, 0, true), null);
  assert.equal(swipeAction(200, 0, true), null);
});

test("swipeAction ignores a tap or a nudge below the threshold", () => {
  assert.equal(swipeAction(0, 0, false), null);
  assert.equal(swipeAction(-49, 0, false), null);
  assert.equal(swipeAction(-50, 0, false), null, "strictly greater than the threshold");
  assert.equal(swipeAction(-51, 0, false), "next");
});

test("swipeAction ignores a drag that is mostly vertical", () => {
  assert.equal(swipeAction(-60, 60, false), null, "a scroll, not a swipe");
  assert.equal(swipeAction(-60, 200, false), null);
  assert.equal(swipeAction(-120, 40, false), "next", "clearly horizontal");
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test web/test/isobar.test.js`
Expected: FAIL — `does not provide an export named 'chartURL'`.

- [ ] **Step 3: Add the helpers**

In `web/js/cards/isobar.js`, add below the `SOURCE` constant:

```js
// Pure: the image URL for one step of the current run/variant. Shared by the
// card, the enlarged view, and the preloader so the three cannot drift apart.
export function chartURL(state, step) {
  return `${WORKER_URL}/api/chart?step=${step}&variant=${state.variant}&run=${state.run}`;
}

// Pure: move an index by dir over n steps, wrapping at both ends.
export function stepIdx(idx, n, dir) {
  return (idx + dir + n) % n;
}

// Pure: what a drag in the enlarged view means. Null unless it is a decisive
// horizontal swipe on an unzoomed chart — while zoomed, drags pan the image,
// and one gesture must never mean two things.
export function swipeAction(dx, dy, zoomed) {
  if (zoomed) return null;
  if (Math.abs(dx) <= 50) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}
```

- [ ] **Step 4: Use them in the card**

In `bodyHTML`, replace the inline URL:

```js
  const img = `<img class="isobar-img" src="${chartURL(state, step)}" alt="${t(lang, "isobar_title")}" />`;
```

In `renderBody`, replace the prev/next index arithmetic so both controls wrap identically:

```js
      const dir = btn.getAttribute("data-act") === "next" ? 1 : -1;
      state.idx = stepIdx(state.idx, state.steps.length, dir);
      renderBody(state);
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, 133 tests (127 + 6).

- [ ] **Step 6: Commit**

```bash
git add web/js/cards/isobar.js web/test/isobar.test.js
git commit -m "refactor(isobar): extract chartURL, stepIdx and swipeAction"
```

---

### Task 5: Swipe in the enlarged isobar view

**Files:**
- Modify: `web/js/cards/isobar.js` (`openIsobarZoom` rewritten; its call site in `renderBody`)
- Modify: `web/css/isobar.css`

**Interfaces:**
- Consumes: `chartURL`, `stepIdx`, `swipeAction` (Task 4); `chartStepLabel` from `web/js/charts/chart.js` (already imported).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Rewrite the enlarged view**

In `web/js/cards/isobar.js`, replace `openIsobarZoom` entirely:

```js
// Fullscreen enlarged chart. Pinch-zoom stays the browser's; a horizontal
// swipe steps to the previous/next chart, but only while unzoomed. state.idx
// is shared with the card, and onChange() on close leaves the card showing
// whatever you swiped to.
function openIsobarZoom(state, onChange) {
  const { lang } = state.settings;
  const n = state.steps.length;

  const host = document.createElement("div");
  host.className = "isobar-zoom";
  host.innerHTML =
    `<div class="isobar-zoom-head">` +
      `<span class="isobar-zoom-label"></span>` +
      `<button class="isobar-zoom-close" type="button" aria-label="${t(lang, "close")}">✕</button>` +
    `</div>` +
    `<div class="isobar-zoom-body"></div>`;

  const body = host.querySelector(".isobar-zoom-body");
  const label = host.querySelector(".isobar-zoom-label");
  const img = document.createElement("img");
  img.className = "isobar-zoom-img";
  img.alt = t(lang, "isobar_title");
  body.appendChild(img);
  document.body.appendChild(host);

  const paint = () => {
    const step = state.steps[state.idx];
    img.src = chartURL(state, step);
    label.textContent = chartStepLabel(state.run, step, lang);
    // Warm both neighbours so a swipe never lands on a blank frame.
    for (const d of [-1, 1]) new Image().src = chartURL(state, state.steps[stepIdx(state.idx, n, d)]);
  };
  paint();

  const close = () => { host.remove(); onChange(); };
  host.querySelector(".isobar-zoom-close").addEventListener("click", close);

  // Pinch-zoom on iOS is visual-viewport zoom and leaves scrollWidth untouched,
  // so the viewport scale is the check that works there; the scrollWidth
  // comparison covers an image overflowing its container.
  const isZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01
    || body.scrollWidth > body.clientWidth + 1;

  let sx = 0, sy = 0, down = false, moved = false;
  body.addEventListener("pointerdown", (e) => {
    down = true; moved = false; sx = e.clientX; sy = e.clientY;
  });
  body.addEventListener("pointermove", (e) => {
    if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
  });
  body.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = false;
    const act = swipeAction(e.clientX - sx, e.clientY - sy, isZoomed());
    if (!act) return;
    state.idx = stepIdx(state.idx, n, act === "next" ? 1 : -1);
    paint();
  });
  body.addEventListener("pointercancel", () => { down = false; });

  // Tap-on-backdrop still closes, but a swipe must not: a drag fires a click
  // too, and without the `moved` guard every swipe would dismiss the view.
  host.addEventListener("click", (e) => {
    if (moved) { moved = false; return; }
    if (e.target === host || e.target === body) close();
  });
}
```

- [ ] **Step 2: Update the call site**

In `renderBody`, replace the image click binding:

```js
  const img = card.querySelector(".isobar-img");
  if (img) img.addEventListener("click", () => openIsobarZoom(state, () => renderBody(state)));
```

- [ ] **Step 3: Style the head bar**

In `web/css/isobar.css`, replace the `.isobar-zoom-close` rule with a head row plus the button:

```css
.isobar-zoom-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 10px;
}
.isobar-zoom-label { color: var(--header-title); font-size: 13px; }
.isobar-zoom-close {
  flex-shrink: 0; min-width: 44px; min-height: 44px;
  background: transparent; border: none; color: var(--header-title); font-size: 22px; cursor: pointer;
}
```

- [ ] **Step 4: Run the tests and syntax-check**

```bash
npm test
node --check web/js/cards/isobar.js
```

Expected: PASS, 133 tests (unchanged — this task is DOM wiring over helpers already tested in Task 4), and the file parses.

- [ ] **Step 5: Commit**

```bash
git add web/js/cards/isobar.js web/css/isobar.css
git commit -m "feat(isobar): swipe between charts in the enlarged view"
```

---

### Task 6: Full verification

**Files:** none modified.

- [ ] **Step 1: Run both suites**

```bash
npm test
node --test worker/test/*.test.js
```

Expected: 133 web, 34 worker, zero failures. A count below the 115 / 34 baseline means a test was deleted rather than updated — investigate before continuing.

- [ ] **Step 2: Check the rendered output headlessly**

The comparator's filtering and the palette are both checkable without a browser:

```bash
node --input-type=module -e '
import { overlayChart } from "./web/js/charts/compare.js";
import { visibleModels, COMPARE_MODELS } from "./web/js/sources/compare.js";
const HOURS = Array.from({length:25},(_,i)=>`2026-07-26T${String(i%24).padStart(2,"0")}:00`);
const all = COMPARE_MODELS.map((m,ci)=>({key:m.key,label:m.label,ci,times:HOURS,speed:HOURS.map(()=>10+ci)}));
const shown = visibleModels(all, ["arome_hd","arome25"]);
const svg = overlayChart(shown, { times: HOURS });
const classes = [...svg.matchAll(/cmp-line--(\d)/g)].map(m=>m[1]);
console.log("hid arome_hd(0) + arome25(1); remaining colour slots:", classes.join(","));
console.log("expected 2,3,4,5 — anything else means colours shifted");
const empty = overlayChart([], { times: HOURS, observed: [{ms:new Date("2026-07-26T06:00").getTime(),mean:9},{ms:new Date("2026-07-26T18:00").getTime(),mean:14}] });
console.log("zero models still draws the measured curve:", empty.includes("mg-observed"));
'
```

Expected: `remaining colour slots: 2,3,4,5` and `zero models still draws the measured curve: true`.

- [ ] **Step 3: Browser walkthrough**

Run `npm run serve`, open http://localhost:5173.

| Check | Expected |
|---|---|
| Comparator, *aujourd'hui* | ICON-EU is amber, clearly distinct from the green measured curve |
| Dark mode | amber and green both legible on the navy panel |
| `modèles` button | opens a Réglages-style sheet with six switches, all on |
| Switch off ICON-EU | vanishes from overlay, legend and grid; remaining models keep their colours |
| Overlay tooltip | mean/median shift after hiding a model |
| Switch all six off | green curve alone + `aucun modèle sélectionné`; button reads `modèles · 0/6` |
| Reopen the comparator | the toggles persisted |
| Isobar, tap chart | enlarged view shows the step label |
| Swipe left / right | next / previous chart, label follows, wraps at both ends |
| Pinch in, then drag | pans the image; no chart change |
| Close after swiping | card shows the chart you swiped to |

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/compare-toggles-isobar-swipe
gh pr create --title "Comparator model toggles, colour fix, isobar swipe" --body "$(cat <<'EOF'
**Colour fix.** `--cmp-2` (ICON-EU) was byte-identical to `--now`, which the
measured-wind curve reuses — the two lines rendered in the same colour. ICON-EU
moves to amber. A new `tokens.test.js` asserts no model colour equals `--now`
and that all six stay distinct, so this cannot recur.

**Model toggles.** A `modèles` button in the comparator opens a Réglages-style
sheet of switches, persisted as `compareHidden`. A hidden model leaves the
overlay, the legend, the grid, and the tooltip's mean/median. Colour is now a
property of the model (`ci`) rather than its position in the rendered array —
without that, hiding one model recoloured all the others. Switching every model
off is allowed and leaves the measured curve on its own.

**Isobar swipe.** Horizontal swipe in the enlarged view steps between charts,
with the step label shown and neighbours preloaded. Suppressed while
pinch-zoomed, so a drag still pans. `state.idx` is shared with the card.

Tests: 133 web (was 115), 34 worker (unchanged).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| A.1 / A.2 colour collision + fix | 1 |
| B.1 `compareHidden` setting | 3 |
| B.2 colour stability via `ci` | 2 |
| B.3 `visibleModels` + filtering + mean/median | 2 (helper), 3 (wiring) |
| B.4 toggle sheet | 3 |
| B.5 button + count label | 3 |
| B.6 zero models, `opts.times`, `compare_no_models` | 2 (`opts.times`), 3 (message) |
| C.1 `openIsobarZoom(state, onChange)` + `chartURL` | 4 (`chartURL`), 5 (signature) |
| C.2 step label | 5 |
| C.3 `swipeAction` | 4 |
| C.4 zoom guard | 5 |
| C.5 `stepIdx` + shared state | 4 (`stepIdx`), 5 (sharing) |
| C.6 preloading | 5 |
| Testing section | 1–5; manual matrix in 6 |

No gaps.

**Placeholder scan:** every code step carries complete code; every command carries expected output. Two things the spec's test list could not cover mechanically — the toggle sheet's DOM wiring and the enlarged view's gestures — are covered by the explicit browser matrix in Task 6 Step 3 and the headless render check in Step 2, not waved through.

**Type consistency:** `ci` is attached in Task 2 (`fetchAllModels`) and read as `ser.ci` / `s.ci` in Tasks 2 and 3. `visibleModels(series, hidden)` is defined in Task 2 and called with `(loaded, hidden)` in Task 3. `opts.times` is added in Task 2 and passed as `times` in Task 3. `chartURL(state, step)`, `stepIdx(idx, n, dir)` and `swipeAction(dx, dy, zoomed)` are defined in Task 4 and called with exactly those signatures in Tasks 4 and 5. `openModelToggles(settings, onChange)` is defined in Task 3 Step 5 and called in Step 7. `openIsobarZoom(state, onChange)` is defined in Task 5 Step 1 and called in Step 2.

**One deliberate spec deviation**, recorded above the tasks: `onChange()` fires on close rather than on every swipe.

**One test-boundary note:** `swipeAction` treats the 50 px threshold as exclusive (`<= 50` returns null), and the test asserts both sides of that boundary so the intent is pinned rather than left to a future reader's guess.

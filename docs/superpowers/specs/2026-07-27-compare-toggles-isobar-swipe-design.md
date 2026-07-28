# Comparator model toggles, colour fix, isobar swipe — Design

**Status:** design, pending implementation
**Context:** follow-up to `2026-07-26-qol-realwind-tomorrow-rocks-design.md`. Shipping the measured-wind curve exposed a colour collision with one of the comparison models; this spec fixes it and adds the two changes that came out of using the feature.

## Goals

1. **Fix the green collision.** The measured-wind curve and the ICON-EU model line are currently the *same colour* — not similar, identical.
2. **Model toggles in the comparator.** Let a model that is behaving oddly be switched off so it stops distorting the overlay and the mean/median.
3. **Swipe between isobar charts** in the enlarged view, instead of closing and using the card's ◀ ▶.

## Non-goals

- No change to the dashboard's single-model picker (`forecastModel`). That chooses which model the dashboard *shows*; `compareHidden` chooses which models the comparator *compares*. Separate concerns, separate settings.
- No reordering or recolouring of models by the user. The palette stays fixed.
- No change to which models exist in `COMPARE_MODELS`.
- No pinch-zoom rework in the isobar view — the existing browser-native pinch behaviour is kept as-is and merely guarded against.
- No new chart type, no per-model opacity, no "solo this model" mode.

## Constraints (carried from the project)

- Vanilla ES modules, no build step, no runtime dependencies.
- No hardcoded hex outside `web/css/tokens.css`.
- All external/user text through `escapeHTML` before the DOM.
- Only setting keys in `DEFAULTS` persist through `mergeSettings`.
- Chart builders emit geometry + CSS classes only.
- A failing data source degrades that one element; it never blanks a card.

---

## Part A — The colour collision

### A.1 The bug

`web/css/tokens.css` defines both, byte-identical, in both themes:

| Token | Light | Dark |
|---|---|---|
| `--now` | `#1D9E75` | `#5DCAA5` |
| `--cmp-2` | `#1D9E75` | `#5DCAA5` |

`--now` styles the "maintenant" bar and, since the previous batch, `.mg-observed` — the measured-wind curve. `--cmp-2` styles `.cmp-line--2`, which is **ICON-EU** (index 2 in `COMPARE_MODELS`). On the comparator's *aujourd'hui* overlay the measured curve and ICON-EU are indistinguishable.

### A.2 The fix

Move `--cmp-2` off green. The measured curve keeps `--now`: its green is semantically load-bearing (it matches the now-bar it terminates against), whereas `--cmp-2` is an arbitrary palette slot.

```css
/* light */  --cmp-2: #9C6B10;
/* dark  */  --cmp-2: #E0A83C;
```

Following the palette's existing convention — the light theme takes the darker value against the white card, the dark theme the lighter value against the navy panel. Contrast against their backgrounds is roughly 4.5:1 (light) and 5.3:1 (dark), adequate for a 1.6 px line.

This is the only change in Part A. No JS, no new token, no class rename. `--cmp-3` (orange `#D85A30`) becomes the nearest neighbour in hue; the two are separated by lightness and saturation rather than hue alone, which is acceptable at this stroke width and is the accepted cost of keeping green for the measurement.

---

## Part B — Model toggles in the comparator

### B.1 Setting

Add to `DEFAULTS` in `web/js/settings.js`:

```js
compareHidden: [],
```

An array of `COMPARE_MODELS` keys that are switched **off**. Empty means all six are shown, so "everything on" is the default with no special case. This mirrors the existing `cardHidden` exactly, including being an array that `mergeSettings` clones.

### B.2 Colour stability — the part that must not be got wrong

`overlayChart` currently derives a line's colour from its position in the array it is handed:

```js
active.forEach((ser) => {
  const idx = series.indexOf(ser);
  ...`<path class="cmp-line--${idx}" ...>`
});
```

and `legend` does the same with its `map((s, i) => ...)` index. If `compareview` filters hidden models out before rendering, **every surviving model shifts colour** — hide AROME HD and ICON-EU turns navy.

Fix: colour becomes a property of the model, assigned once at the source. `fetchAllModels` in `web/js/sources/compare.js` already maps over `COMPARE_MODELS`, so it attaches the index:

```js
COMPARE_MODELS.map(async (m, ci) => { ... return { key: m.key, label: m.label, ci, data }; })
```

`overlayChart` then uses `ser.ci ?? series.indexOf(ser)` and `legend` uses `s.ci ?? i`. The `??` fallback keeps every existing call site and test working unchanged — they pass series without `ci` and keep their current behaviour.

### B.3 Filtering

A pure helper in `web/js/sources/compare.js`, exported and tested:

```js
visibleModels(series, hidden) -> series.filter((s) => !hidden.includes(s.key))
```

`hidden` being null/undefined yields the full list.

`compareview.js` computes `shown = visibleModels(loaded, settings.compareHidden)` once per render and feeds it to the overlay lines, `legend`, and `grid`. Three consequences fall out without further code:

- the model's line leaves the overlay,
- its key leaves the legend,
- its cell leaves the grid,
- and because `bindOverlayTooltip` is handed the same filtered `lines`, it leaves the **mean and median** too.

Nothing is refetched. All six models are already in memory from the single `fetchAllModels` call, so toggling is instant, exactly like the existing tab switches.

### B.4 The toggle sheet

New file `web/js/cards/modeltoggles.js`:

```js
openModelToggles(settings, onChange) -> void
```

A sheet reusing the settings page's `set-modal` / `set-panel` / `set-head` / `set-list` / `set-row` / `set-label` / `set-switch` / `set-slider` classes, so it looks like Réglages. One row per entry in `COMPARE_MODELS`, labelled with `m.label`, switch checked when the key is **not** in `compareHidden`. No drag handles — order is fixed.

Each change mutates `settings.compareHidden` in place, persists via `saveSetting("compareHidden", ...)`, and calls `onChange()` so the comparator re-renders live behind the sheet. Closing is by the ← button in `set-head` or a click on the backdrop — the two the settings page already wires — and needs no confirmation, since every toggle has already taken effect.

### B.5 The button

In the comparator header (`cmp-head`), left of ✕:

```html
<button class="linkbtn" data-act="models" type="button">modèles</button>
```

When some models are hidden the label carries a count — `modèles · 4/6` — so a model switched off days ago cannot be silently forgotten. The count is `${COMPARE_MODELS.length - hidden.length}/${COMPARE_MODELS.length}`, appended only when `hidden.length > 0`. New i18n key `compare_models` → `{ fr: "modèles", en: "models" }`; the count is positional and needs no separate key.

### B.6 Zero models selected

Allowed, and useful: the overlay still shows the day's measured wind on its own.

This needs one change to `overlayChart`. It currently derives its time axis from the longest active series, so with no series there is no domain and the observed curve would be silently dropped by the domain filter. It gains an explicit override:

```js
const labelTimes = opts.times ?? (active.find((s) => s.times.length === maxLen) || {}).times || [];
```

`compareview` always passes `opts.times` — the range slice's time array, taken from any loaded model regardless of whether it is visible — so the axis and the observed domain are correct no matter how many models are shown.

The render becomes: draw the overlay when `lines.length || observed.length`, and when `shown` is empty append a `<p class="cmp-miss">` reading `aucun modèle sélectionné`. New i18n key `compare_no_models` → `{ fr: "aucun modèle sélectionné", en: "no models selected" }`.

The existing `source_down` message stays for its own case — every model *failed to load* — which is a different condition from every model being switched off, and must not be conflated.

---

## Part C — Isobar swipe

### C.1 Signature change

`openIsobarZoom(src, alt)` cannot navigate: it receives a finished URL and knows nothing about the run, the steps, or the index. It becomes:

```js
openIsobarZoom(state, onChange) -> void
```

building its own `src` from `state.run` / `state.steps[state.idx]` / `state.variant`.

`bodyHTML` currently inlines that URL. It is extracted so the card and the enlarged view cannot drift apart:

```js
chartURL(state, step) ->
  `${WORKER_URL}/api/chart?step=${step}&variant=${state.variant}&run=${state.run}`
```

`bodyHTML` and `openIsobarZoom` both call it, as does the preloader in C.6.

### C.2 Step label

The enlarged view gains a label showing `chartStepLabel(state.run, step, lang)` — e.g. `analyse T+0 · dim 14h`. Without it, two swipes leave you with no idea which chart you are looking at. It sits in the top bar next to ✕ and updates on every swipe.

### C.3 Gesture

Pointer down records `(x, y)`; pointer up computes `dx, dy`. A pure helper in `web/js/cards/isobar.js`, exported and tested:

```js
swipeAction(dx, dy, zoomed) -> "next" | "prev" | null
```

- `zoomed` → always `null`.
- `|dx| < 50` → `null` (a tap or a nudge).
- `|dx| <= |dy| * 1.5` → `null` (a vertical scroll).
- otherwise `dx < 0` → `"next"`, `dx > 0` → `"prev"`.

Swiping left advances, matching how a stack of pages moves.

### C.4 Zoom guard

`.isobar-zoom-body` sets `touch-action: pinch-zoom` and `overflow: auto`, so a zoomed chart is already pannable and a swipe would fight it.

```js
const isZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
```

The viewport scale is the *only* reliable signal here. `.isobar-zoom-img` is `width: auto; max-width: none` and the charts are ~891px wide, deliberately not shrunk to fit — so `body.scrollWidth > body.clientWidth` is true in this view whether or not the user has pinch-zoomed. A `scrollWidth` comparison, which an earlier version of this guard included, would therefore suppress every swipe unconditionally, not just while zoomed. On iOS, pinch-zoom is *visual viewport* zoom, which leaves `scrollWidth` untouched anyway, so the viewport scale is the check that actually works there too.

`window.visualViewport` is optional-chained: where it is absent, the guard simply never reports zoomed (a swipe is then treated as a page-step, matching browsers where visual-viewport zoom isn't observable).

*(This corrects the original design, which paired the scale check with a `scrollWidth` clause — see the deviation note in the implementation plan.)*

### C.5 Wrapping and shared state

A pure helper, exported and tested:

```js
stepIdx(idx, n, dir) -> (idx + dir + n) % n
```

This is the arithmetic the card's ◀ ▶ buttons already do inline; extracting it means both paths wrap identically and the wrap is covered by a test. The card's handler is updated to call it.

Swiping mutates `state.idx` and calls `onChange()`, which re-renders the card. Closing the enlarged view therefore leaves the card on the chart you navigated to — the same object the card's own stepper mutates, so the two controls cannot disagree.

### C.6 Preloading

After each render of the enlarged view, the neighbouring two steps are warmed:

```js
for (const d of [-1, 1]) new Image().src = chartURL(state, stepIdx(state.idx, n, d));
```

Without this the first frame after a swipe is blank while the GIF is fetched, which makes the gesture feel broken. The images are already cached by the Worker and the service worker, so this costs at most two requests per view and usually zero.

---

## Testing

New pure functions, tested in the existing style (`node:test`, `assert/strict`):

**`web/test/compare.test.js`** (extended):

- `visibleModels` drops hidden keys, keeps order, and returns everything for `null` / `undefined` / `[]` hidden.
- `overlayChart` uses `ser.ci` for the colour class: a series list where `ci` does not match array position renders the `ci` class, proving a hidden neighbour cannot shift a model's colour.
- `overlayChart` without `ci` still colours by array position (the existing call sites keep working).
- `overlayChart` with **zero** series but `opts.times` and `opts.observed` still draws `mg-observed`, and still draws the hour labels.
- `opts.times` overrides the derived axis when series are present.

**`web/test/isobar.test.js`** (new):

- `swipeAction` returns `"next"` for a decisive leftward drag, `"prev"` for rightward.
- returns `null` when zoomed, whatever the drag.
- returns `null` below the 50 px threshold.
- returns `null` when vertical movement dominates (a scroll).
- `stepIdx` wraps forward off the end to 0 and backward off the start to `n-1`.

**`web/test/settings.test.js`** (extended):

- `compareHidden` defaults to `[]` and survives `mergeSettings`.
- it is cloned, not shared with `DEFAULTS` — the same guarantee the existing array settings have, so mutating one settings object cannot corrupt another.

**`web/test/i18n.test.js`** already asserts both languages exist for every key, covering `compare_models` and `compare_no_models`.

**Manual checks** (not reachable by these tests): ICON-EU renders amber and is clearly distinct from the measured curve in both themes; toggling a model off removes it from overlay, legend, grid, and shifts the tooltip's mean/median; the remaining models keep their colours; toggling all six off leaves the green curve and the empty-state line; swiping the enlarged isobar changes chart and the label follows; pinching then dragging pans instead of swiping; closing returns the card to the swiped-to step.

# QoL batch — observed wind curve, Demain, rocks polish — Design

**Status:** design, pending implementation
**Context:** three independent quality-of-life changes to the existing dashboard. They share no state and can be implemented in any order, but they land as one batch.

## Goals

1. **Observed wind curve.** Draw the day's *actual measured* wind, from the nearest anemometer, as a green line on top of the forecast — so a forecast can be checked against what really happened.
2. **Demain replaces 7 j on the dashboard.** The 7-day view is the least useful thing on the main screen; tomorrow is the most useful. 7 j stays available in the comparator.
3. **Rocks polish.** Correct the French wording, remove a redundant duplicated line, and move the draught setting out of Réglages and into the Cailloux card where it is actually used.

## Non-goals

- No new observation network, no station picker UI — the nearest-station resolution in `web/js/location.js` already exists and is reused as-is.
- No observed *gust* curve and no observed direction arrows. Mean wind only (decided: four lines on a 300×118 chart is too busy).
- No resampling of the observation series to hourly. It is drawn at its native ~10-minute resolution.
- No history beyond the current day, no persistence of observations, no offline cache of them.
- No change to the comparator's tab set, the model list, or the tide/BMS/isobar cards.

## Constraints (carried from the project)

- Vanilla ES modules, no build step, no runtime dependencies.
- No hardcoded hex outside `web/css/tokens.css`.
- All external/user text through `escapeHTML` before the DOM.
- Only setting keys in `DEFAULTS` persist through `mergeSettings`.
- Chart builders emit geometry + CSS classes only; colour lives in CSS.
- A failing data source degrades that one element; it never blanks a card.

---

## Part A — Observed wind curve

### A.1 Upstream source

windmorbihan's `chart.json` accepts a `time_frame` parameter that is an **enum, not a duration**. The site's own UI uses exactly four values, discovered in `windfrance_site.*.js`:

| `time_frame` | window | sampling |
|---|---|---|
| `60` | 2 h | ~2 min |
| `36` | 6 h | ~10 min |
| `144` | **24 h** | ~10 min |
| `1152` | 8 days | ~10 min |

Any other value silently falls back to a useless ~8-point default. We use **`144`**.

Verified live: sensor 6 (Drénec) → 131 points over 23.1 h; sensor 29058003 (Beg Meil) → 238 points over 23.8 h. Payload shape is identical to the existing 1-reading feed the live-wind card already consumes — `{ ts, ws: {moy, max}, wd: {moy}, … }`, oldest→newest, with `""` for channels a sensor lacks.

### A.2 Worker — `worker/src/windhistory.js` (new)

```
windHistoryURL(nid) -> "https://backend.windmorbihan.com/observations/chart.json?sensor=<nid>&time_frame=144"

parseWindHistory(jsonText) -> { samples: [ { ts, mean, gust, dir }, … ] }
```

- Needs the same empty-channel guard as `parseLiveWind`: `""` / absent / non-finite → `null`. **Duplicate the four-line `num()` helper locally** rather than extracting a shared module — the worker's source modules are deliberately standalone, and `livewind.js` is not to be touched by this change.
- A sample with no `ts` or no `ws.moy` is **dropped** (not nulled) — the curve is time-mapped, so gaps simply become longer straight segments rather than breaks.
- `gust` falls back to `mean` when absent, matching `parseLiveWind`.
- `dir` may be `null`; it is carried through but unused by the curve (kept for a future tooltip).
- Throws when the payload is not an array, or when **zero** valid samples survive.

New route in `worker/src/index.js`, following the shape of `handleLiveWind` exactly:

```
GET /api/windhistory?nid=<digits>   ->  { nid, samples: [...] }
```

- `nid` sanitised with the same `.replace(/[^0-9]/g, "")` guard, default `"6"`.
- Cache key `https://windhistory.cache/<nid>`, `Cache-Control: public, max-age=300`. Five minutes is well under the 10-minute sampling interval, so the curve is never more than one sample stale.
- Errors → `502` with `{ error }`, same as the neighbouring handlers.

### A.3 Client source — `web/js/sources/windhistory.js` (new)

Mirrors `web/js/sources/livewind.js` one-for-one:

```
fetchWindHistory(nid) -> Promise<{ nid, samples: [ { ts, mean, gust, dir } ] }>
```

Throws when `WORKER_URL` is unset, when `nid == null`, on HTTP error, or on an `error` field in the body.

### A.4 Normalising for the chart — `observedSeries`

A pure helper (in `web/js/charts/meteogram.js`, exported and unit-tested) converts a raw sample list into what the SVG builder needs:

```
observedSeries(samples) -> [ { ms, mean }, … ]     // ms = ts * 1000, ascending
```

Sorted ascending by `ms` defensively (the feed is already ordered), and stripped of non-finite means.

### A.5 Rendering — `meteogram(data, opts)` gains `opts.observed`

`opts.observed` is an `observedSeries` array. The builder maps each point onto x by **timestamp**, against the chart's own time domain — the same arithmetic `opts.nowTime` already uses:

```
t0 = Date.parse(times[0]), tN = Date.parse(times[N-1])
x_obs(ms) = L + ((ms - t0) / (tN - t0)) * plotW
```

Index-based mapping (as `opts.compare` uses) is wrong here: observations are irregular ~10-minute samples while the forecast is hourly, so the two arrays have neither the same length nor the same cadence.

- Points with `ms < t0` or `ms > tN` are **clipped** — dropped, not clamped, so the curve never draws a false flat segment against the chart edge.
- Fewer than 2 surviving points → nothing is drawn.
- Emitted as `<path class="mg-observed" d="…"/>`, after `mg-gust` and before `mg-now`, so the now-line stays on top.
- Drawn as a plain polyline; no smoothing.

`computeYMax` gains an optional second argument for observed means:

```
computeYMax(gusts, observedMeans = []) -> number
```

Same rule as today (baseline 35; above 32 kn round up to the next multiple of 10 at/above max+3), but `max` is taken across **both** arrays. Without this, a day that blew harder than forecast would draw the green curve off the top of the plot. `overlayChart` in `web/js/charts/compare.js` takes the same treatment so the comparator's overlay scales to the observation too.

### A.6 Styling

`web/css/meteogram.css`:

```
.mg-observed { fill: none; stroke: var(--now); stroke-width: 1.8; }
.mg-legend .leg-obs { color: var(--now); }
```

Reuses `--now` (`#1D9E75` light / `#5DCAA5` dark) deliberately — the curve ends exactly where the now-bar stands, so the shared green reads as "green = what happened, blue = what is forecast". Accepted consequence: the legend carries two green entries (`━ réel` and `│ maintenant`). No new token.

### A.7 Where the curve appears

| View | Curve |
|---|---|
| Dashboard forecast, 24 h | **yes** |
| Dashboard forecast, Demain | no |
| Comparator, *aujourd'hui* — overlay chart | **yes** |
| Comparator, *aujourd'hui* — each of the 6 per-model cells | **yes** |
| Comparator, *demain* | no |
| Comparator, *7 j* | no |

### A.8 Wiring

**Dashboard** (`web/js/cards/forecast.js`): alongside the forecast fetch, when `settings.stationNid != null` and `state.range === "24h"`, fetch the history and stash it on `state.observed`. `.catch(() => null)` — the curve is strictly additive and a failure must not touch the forecast render path. Passed through to `meteogram()` as `opts.observed`.

**Comparator** (`web/js/cards/compareview.js`): fetched **once**, in parallel with `fetchAllModels`, and held alongside `loaded`. `renderBody` passes it to `overlayChart` and to each per-model `meteogram()` only when `rangeKey === "today"`. Switching tabs re-slices in memory as it does today — no refetch.

`overlayChart(lines, opts)` gains the same `opts.observed`, drawn with the same class and the same timestamp mapping, against the domain of the longest line's `times`.

### A.9 Legend

- Dashboard `legendHTML`: appends `<span class="leg-obs">━</span> réel` — **only when a curve was actually drawn**, so it never promises data that isn't there.
- Comparator `legend()`: appends a green `réel` key after the six model swatches, under the same condition.
- New i18n keys: `legend_observed` → `{ fr: "réel", en: "real" }`.

### A.10 Degradation

Every one of these produces a chart identical to today's, with no error surfaced:

- `settings.stationNid == null` (location outside the 45 km `STATION_COVERAGE_KM` — i.e. anywhere but south Brittany).
- `WORKER_URL` unset.
- Worker or upstream returns an error, or the station reports nothing.
- Every sample falls outside the chart's time domain.

---

## Part B — Demain replaces 7 j on the dashboard

### B.1 Behaviour

`state.range` toggles `"24h"` ↔ `"tomorrow"` (was `"24h"` ↔ `"7d"`).

- **24 h**: `forecast_days: 1` → today 00:00–23:00 local (`timezone: Europe/Paris`), unchanged.
- **Demain**: `forecast_days: 2`, then `sliceData(data, 24, 48)` — the helper already exported from `web/js/charts/compare.js`.

Verified: AROME HD at `forecast_days=2` returns 48 hourly values, **zero nulls**, covering today 00:00 → tomorrow 23:00.

### B.2 Simplification

The `LONG_RANGE` set and the `use7dEcmwf` branch in `renderForecast` are **deleted**. They existed only because AROME has no data past ~2.5 days and the 7 j view had to silently swap to ECMWF. Every model in `COMPARE_MODELS` reaches 48 h, so the chip now always shows the model actually picked. The existing "model errored or returned no data → fall back to ECMWF" guard stays; it is about source failure, not horizon.

The `days` passed to `fetchForecast` becomes `is24h ? 1 : 2`.

### B.3 Labels

- Button text: `seven_days` → new key `tomorrow_range` → `{ fr: "demain", en: "tomorrow" }`. `aria-pressed` reflects `state.range === "tomorrow"`, as it does today.
- Card title switches with the range: `forecast_title` (`Prévision vent · 24 h`) for 24 h, new key `forecast_title_tomorrow` → `{ fr: "Prévision vent · demain", en: "Wind forecast · tomorrow" }` for Demain.
- The `seven_days` key is **kept** — the comparator's 7 j tab still uses it.

### B.4 Meteogram axis

`opts.range` for the Demain view is `"24h"` (hour ticks every 6 h), not `"7d"` (weekday ticks) — Demain is a 24-hour window. The `nowTime` marker naturally falls outside tomorrow's domain and is skipped by the existing `frac >= 0 && frac <= 1` guard.

---

## Part C — Cailloux

### C.1 Wording

`rocks_dry`: `{ fr: "découvert", en: "drying" }` → `{ fr: "passe pas", en: "no-go" }`.

"Découvert" describes the rock; what the sailor needs to know is whether *their* boat gets through, which is a function of the rock's drying height **and** their own draught. "Passe pas" says that.

### C.2 The duplicated line goes

Today each row shows the phrase twice: a `.rock-status` line reading `passe jusqu'à 12h24`, and a coloured `.rock-pill` reading `passe`. The pill now carries the whole phrase and the status line is deleted.

- `statusLine()` is removed from `web/js/cards/rocks.js`; its text-building logic moves into the pill builder. The `.rock-status` element disappears from the **normal** row (the one Part C is about); it survives only in the port-fetch-failed row described below, so the `.rock-status` CSS rule stays.
- Pill text: `passe jusqu'à 12h24` / `passe pas jusqu'à 14h37`, or bare `passe` / `passe pas` when `st.crossingTh == null` (state holds all day).
- Colours unchanged: `.rock-pill--clear` (blue) when `st.safe`, `.rock-pill--foul` (red) otherwise.
- Row becomes `name … pill … ✎`.
- The port-fetch-failed row keeps its `—`, rendered as a neutral status line with no pill (no colour claim can be made without tide data).

`web/css/rocks.css`:

- Drop `text-transform: uppercase` and `letter-spacing` from `.rock-pill` — shouty and wide at ~24 characters.
- `.rock-name` gets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` so a long name truncates rather than squeezing the pill.
- `.rock-pill` keeps `flex-shrink: 0` and gains `white-space: nowrap`.

### C.3 Draught moves into the card

A chip in the Cailloux title row, left of the ＋, styled exactly like the AROME model chip on the forecast card:

```html
<button class="chip chip--btn" data-act="draft" type="button">1,5 m</button>
```

- Label formatted with a French decimal comma in `fr` (`1,5 m`) and a point in `en` (`1.5 m`).
- Tap opens `openDraftPicker(settings, onPick)` — a new small modal in `web/js/cards/draftpicker.js`, reusing the `rf-*` classes from `web/css/rocks.css` so it inherits the rock form's sheet look: title, ✕, one `type="number" inputmode="decimal" step="0.1" min="0"` field, one full-width Enregistrer.
- Save validates `Number.isFinite(v) && v >= 0` (the same guard the settings page uses today), persists via `saveSetting("draft", v)`, mutates `settings.draft` in place, and re-renders the rock list so every status recomputes against the new draught.
- Invalid input: the modal stays open and nothing is saved.

The draught field is **removed** from `web/js/cards/settingspage.js` (the `.set-field` / `.set-draft` block and its `change` listener). The `settings_draft` i18n key is reused as the picker's modal title, so no key is orphaned. `DEFAULTS.draft` is unchanged.

---

## Testing

All new pure functions get unit tests in the existing style (`node:test`, one file per module).

**Worker** — `worker/test/windhistory.test.js`, with a trimmed real-capture fixture at `worker/test/fixtures/windhistory-144.json`:

- Parses a normal payload into ascending `{ts, mean, gust, dir}`.
- Drops samples with `""` mean or `""` ts; keeps their neighbours.
- `gust: ""` falls back to `mean`.
- `dir: ""` becomes `null`.
- Throws on non-array, on `[]`, and on an array where every sample is unusable.

**Charts** — extending `web/test/meteogram.test.js`:

- `observedSeries` sorts, converts to ms, and strips non-finite means.
- The observed path maps by timestamp, not index: a sample at the domain midpoint lands at plot-x midpoint regardless of how many forecast hours there are.
- Samples outside `[t0, tN]` are clipped, and a series entirely outside draws no path.
- Fewer than 2 in-domain points draws no path.
- `computeYMax(gusts, observed)` scales to whichever array is higher; the existing single-argument calls still return the same values.

**Forecast card** — extending `web/test/openmeteo.test.js` or a small new test for the pure parts:

- The Demain slice takes hours 24–48 of a 48-hour series.
- `forecastTitleRow` renders the `demain` label and `aria-pressed` per range.
- `legendHTML` includes the `réel` key only when an observed series was drawn.

**Rocks** — extending `web/test/rocksafety.test.js` / a rocks-card test for the pure pill builder:

- Pill text is `passe jusqu'à HHhMM` when safe with a crossing, `passe pas jusqu'à HHhMM` when not, and bare `passe` / `passe pas` when `crossingTh` is null.
- Pill class follows `st.safe`.
- The draught label formats `1,5 m` in `fr` and `1.5 m` in `en`.

**i18n** — `web/test/i18n.test.js` already asserts every key has both languages; the new keys are covered by that.

**Manual check** (things tests can't reach): the green curve renders and stops at the now-line on the dashboard; it appears on the comparator's overlay and all six cells under *aujourd'hui* and vanishes on *demain* / *7 j*; the draught chip updates rock statuses immediately; and a location outside the 45 km station coverage shows a clean chart with no legend key.

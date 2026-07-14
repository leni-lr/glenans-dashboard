# Map-pick Coordinate Picker — Design (sub-project A)

**Status:** design, pending implementation
**Context:** first of two sub-projects toward shared rocks. This one adds an optional geographic coordinate to a rock via a tap/drag map picker. The second (separate spec) is the Cloudflare D1 sharing backend, which consumes the coordinate this one produces.

## Goal

Let the user set an optional latitude/longitude on a rock by panning a map under a fixed centre crosshair, using OpenStreetMap raster tiles and a hand-rolled slippy map (no map library, consistent with the app's no-build / no-dependency / vanilla-ES-modules constraints). The coordinate is **optional**: a rock still works without one (its tide comes from its port). The coordinate exists so that, later, a rock can be shared and de-duplicated by proximity.

## Non-goals (explicitly out of scope here)

- Any backend, persistence beyond the existing `localStorage` settings, or the D1 catalog.
- Sharing, "popular rocks", proximity-merge, anonymous user id — all in sub-project B.
- Geolocation ("use my location"), place-name search inside the picker — YAGNI for v1; the port coordinate is a good enough default centre.
- Offline tiles / tile caching in the service worker — tiles simply blank when offline.

## Constraints (carried from the project)

- Vanilla ES modules, no build step, no runtime dependencies.
- No hardcoded hex outside `web/css/tokens.css`.
- All external/user text through `escapeHTML` before the DOM.
- Only setting keys in `DEFAULTS` persist through `mergeSettings`.
- OpenStreetMap tile usage policy: show "© OpenStreetMap contributors" attribution; keep volume low (a handful of tiles per picker open, zoom capped) — fine for personal use.

## Architecture

Three new units under `web/js/map/`, split by responsibility:

### 1. `web/js/map/mercator.js` — pure Web-Mercator projection

Standard 256-px-tile spherical Mercator. No DOM.

```
const TILE = 256;
const MAX_LAT = 85.05112878; // Web-Mercator latitude limit

clampLat(lat) -> lat clamped to ±MAX_LAT
project(lat, lon, z) -> { x, y }      // world pixel coords at integer zoom z
unproject(x, y, z)   -> { lat, lon }  // inverse
```

- `project`: `x = (lon + 180) / 360 * TILE * 2^z`; `y` from the standard Mercator latitude formula, at scale `TILE * 2^z`.
- `unproject`: the exact inverse.
- Round-trips: `unproject(project(lat, lon, z), z) ≈ {lat, lon}` within floating-point tolerance for |lat| ≤ MAX_LAT.

### 2. `web/js/map/tiles.js` — pure tile-grid layout

Given the map centre, zoom, and viewport size, decide which tiles are visible and where each sits (top-left pixel offset within the viewport). No DOM, no network.

```
tileURL(x, y, z) -> "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
tileGrid(centerLat, centerLon, z, viewW, viewH) -> {
  tiles: [ { x, y, z, left, top } ],  // left/top = px position of tile's top-left in the viewport
  centerPx: { x, y },                 // world-pixel coords of the centre (for pan math)
}
```

- Compute the centre world-pixel via `project`; the viewport's top-left world-pixel is `centerPx - {viewW/2, viewH/2}`.
- Emit every tile (x,y at zoom z) that overlaps the viewport, wrapping x modulo `2^z`, clamping y to `[0, 2^z-1]`. Each tile's `left/top` = `tileWorldPx - viewportTopLeftPx`.

### 3. `web/js/map/mappicker.js` — the picker modal (DOM)

```
openMapPicker(settings, { lat, lon, zoom = 13 }, onPick) -> void
```

- Renders a full-screen modal (`.map-modal`) matching the app's modal pattern: a square-ish viewport (`.map-view`) holding an absolutely-positioned tile layer of `<img>`s, a fixed centre crosshair (`.map-crosshair`), `+`/`−` zoom buttons, an "© OpenStreetMap" attribution, and Confirmer / Annuler buttons.
- State: `{ lat, lon, zoom }` for the current centre. On any change, re-lay the tile layer from `tileGrid(...)`; reuse `<img>` nodes by a `z/x/y` key so panning doesn't reload unchanged tiles.
- **Pan:** pointer drag on the viewport translates the centre. Convert the pixel delta to a world-pixel delta, apply to `centerPx`, then `unproject` back to `{lat, lon}`. `touch-action: none` + `preventDefault` so the page never scrolls (same lesson as the settings drag-reorder).
- **Zoom:** `+`/`−` buttons (±1, clamped 5–17), double-tap (+1 toward the tapped point), and two-finger **pinch** (track two pointers; scale ratio maps to zoom levels, keeping the pinch midpoint stationary).
- **Confirm:** the crosshair is always the viewport centre, so `onPick({ lat: state.lat, lon: state.lon })`. Annuler / backdrop / ✕ close without calling `onPick`.
- Tile `<img>` `onerror` → hidden (blank), never blocks; the picker never throws.

## Rock model & form integration

- A rock gains **optional** `lat` and `lon` (numbers). Absent on rocks created before this feature and on rocks the user never places — both are valid.
- `web/js/cards/rockform.js` gains a **Position** row: a button that shows either the current coordinate (formatted, e.g. `47.7160, -3.9500`) or "non définie", and opens the map picker. The picker centres on, in order: the rock's existing `lat/lon`; else the **selected tide port's** coordinate (looked up in `PORTS` by the chosen port id); else `settings.lat/lon`.
- `deriveRock({ name, height, port, lat, lon })` carries `lat`/`lon` through when present; the record stays `{ id, name, height, port }` plus optional `lat, lon`.
- The rocks card itself is unchanged (the coordinate is metadata for later; nothing new to display on the dashboard).

## Data flow

1. User opens the rock add/edit form, taps **Position**.
2. `openMapPicker` opens centred on the port coordinate (or existing coord).
3. User pans/zooms; crosshair stays centred. **Confirmer** → `onPick({lat, lon})`.
4. The form stores the coordinate in its working state and shows it on the Position row.
5. On save, `deriveRock` includes `lat/lon`; `saveSetting("rocks", …)` persists as today.

## Error handling

- Tiles that 404/timeout render blank; the map stays usable and Confirm still returns a coordinate.
- Fully offline: tiles blank, Annuler works, no throw.
- No coordinate is ever required to save a rock.

## Testing

- `web/test/mercator.test.js` — `project`/`unproject` round-trip within tolerance; `project(0,0,z)` lands at world centre `2^z * TILE / 2`; a known coordinate (e.g. Penfret 47.716,-3.95) maps to the expected tile at a fixed zoom; `clampLat` clamps.
- `web/test/tiles.test.js` — `tileGrid` covers the viewport (expected tile count for a given size/zoom), wraps x modulo `2^z`, and positions the centre tile so `centerPx` is inside it; `tileURL` formats correctly.
- Throwaway `.superpowers/sdd/smoke-mappicker.mjs` — open the picker, simulate a pan (pointerdown→move→up shifts the centre), Confirmer calls `onPick` with a coordinate different from the start; and a rock-form smoke path confirming the chosen coordinate lands on the saved rock.

## Files

- Create: `web/js/map/mercator.js`, `web/js/map/tiles.js`, `web/js/map/mappicker.js`, `web/css/map.css`
- Modify: `web/js/cards/rockform.js` (Position row + picker wiring), `web/js/i18n.js` (picker + position strings), `web/index.html` (link `map.css`)
- Tests: `web/test/mercator.test.js`, `web/test/tiles.test.js`; smoke `smoke-mappicker.mjs`

## Service worker / CSP

No changes needed: `sw.js` only intercepts same-origin and `/api/` GETs, so cross-origin OSM tile requests pass straight through to the browser; `index.html` sets no CSP, so cross-origin `<img>` tiles load freely.

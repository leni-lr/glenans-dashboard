import { tileGrid, tileURL } from "./tiles.js";
import { project, unproject } from "./mercator.js";
import { t } from "../i18n.js";

const MIN_Z = 5, MAX_Z = 17;

// Full-screen OSM map picker. A fixed centre crosshair marks the chosen point; the
// map pans under it. Confirmer returns the centre lat/lon via onPick.
export function openMapPicker(settings, { lat, lon, zoom = 13 }, onPick) {
  const { lang } = settings;
  const state = { lat, lon, zoom: Math.max(MIN_Z, Math.min(MAX_Z, zoom)) };

  const host = document.createElement("div");
  host.className = "map-modal";
  host.innerHTML =
    `<div class="map-panel">` +
      `<div class="map-head">` +
        `<button class="linkbtn" data-act="cancel" aria-label="${t(lang, "map_cancel")}">✕</button>` +
        `<span class="map-title">${t(lang, "map_title")}</span>` +
      `</div>` +
      `<div class="map-view">` +
        `<div class="map-layer"></div>` +
        `<div class="map-crosshair" aria-hidden="true"></div>` +
        `<div class="map-zoom">` +
          `<button class="map-zbtn" data-act="zin" type="button" aria-label="+">+</button>` +
          `<button class="map-zbtn" data-act="zout" type="button" aria-label="−">−</button>` +
        `</div>` +
        `<div class="map-attr">© OpenStreetMap</div>` +
      `</div>` +
      `<button class="map-confirm" data-act="confirm" type="button">${t(lang, "map_confirm")}</button>` +
    `</div>`;
  document.body.appendChild(host);

  const view = host.querySelector(".map-view");
  const layer = host.querySelector(".map-layer");
  const imgs = new Map(); // "z/x/y" -> img

  function render() {
    const w = view.clientWidth || 320, h = view.clientHeight || 320;
    const { tiles } = tileGrid(state.lat, state.lon, state.zoom, w, h);
    const seen = new Set();
    for (const tl of tiles) {
      const key = `${tl.z}/${tl.x}/${tl.y}`;
      seen.add(key);
      let img = imgs.get(key);
      if (!img) {
        img = document.createElement("img");
        img.className = "map-tile";
        img.src = tileURL(tl.x, tl.y, tl.z);
        img.onerror = () => { img.style.visibility = "hidden"; };
        imgs.set(key, img);
        layer.appendChild(img);
      }
      img.style.left = `${tl.left}px`;
      img.style.top = `${tl.top}px`;
    }
    for (const [key, img] of imgs) {
      if (!seen.has(key)) { img.remove(); imgs.delete(key); }
    }
  }

  // --- pan + pinch ---
  const pointers = new Map();
  let dragging = false, lastX = 0, lastY = 0, pinchDist = 0, lastTap = 0;

  const twoDist = () => {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
  const panByPixels = (dx, dy) => {
    const c = project(state.lat, state.lon, state.zoom);
    const nl = unproject(c.x - dx, c.y - dy, state.zoom);
    state.lat = nl.lat; state.lon = nl.lon;
    render();
  };
  const setZoom = (z) => {
    const nz = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (nz === state.zoom) return;
    state.zoom = nz;
    render();
  };

  view.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".map-zoom")) return; // zoom buttons handle their own taps
    view.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = Date.now();
    if (pointers.size === 1) {
      if (now - lastTap < 300) setZoom(state.zoom + 1); // double-tap zoom
      lastTap = now;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    } else if (pointers.size === 2) {
      dragging = false; pinchDist = twoDist();
    }
  });

  view.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const d = twoDist();
      if (pinchDist > 0 && Math.abs(d - pinchDist) > 40) {
        setZoom(state.zoom + (d > pinchDist ? 1 : -1));
        pinchDist = d;
      }
      return;
    }
    if (!dragging) return;
    e.preventDefault();
    panByPixels(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 1) { // pinch dropped to one finger → resume dragging from it
      const p = [...pointers.values()][0];
      dragging = true; lastX = p.x; lastY = p.y;
    }
    if (pointers.size === 0) dragging = false;
  };
  view.addEventListener("pointerup", endPointer);
  view.addEventListener("pointercancel", endPointer);

  host.querySelector('[data-act="zin"]').addEventListener("click", () => setZoom(state.zoom + 1));
  host.querySelector('[data-act="zout"]').addEventListener("click", () => setZoom(state.zoom - 1));

  const close = () => host.remove();
  host.querySelector('[data-act="cancel"]').addEventListener("click", close);
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="confirm"]').addEventListener("click", () => {
    close();
    onPick({ lat: state.lat, lon: state.lon });
  });

  render();
}

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

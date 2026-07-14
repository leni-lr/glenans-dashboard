import { PORTS } from "../data/ports.js";
import { openMapPicker } from "../map/mappicker.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

export function newRockId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Build a rock record from raw form values. name/height/port are required; lat/lon
// ride along only when both are finite (optional coordinate for later sharing).
export function deriveRock({ name, height, port, lat, lon }) {
  const rock = { id: newRockId(), name: name.trim(), height, port };
  if (Number.isFinite(lat) && Number.isFinite(lon)) { rock.lat = lat; rock.lon = lon; }
  return rock;
}

function coordLabel(lang, coord) {
  return coord ? `${coord.lat.toFixed(4)}, ${coord.lon.toFixed(4)}` : t(lang, "rocks_position_none");
}

// Modal to add or edit a rock: name + height + tide port + optional map position.
// When `existing` is given the fields are pre-filled, the same id is preserved on
// save, and a Delete button appears next to Save.
export function openRockForm(settings, { existing = null, onSave, onDelete } = {}) {
  const { lang } = settings;
  const defaultPort = (existing && existing.port) || settings.port || "";
  let coord = existing && Number.isFinite(existing.lat) && Number.isFinite(existing.lon)
    ? { lat: existing.lat, lon: existing.lon } : null;

  const host = document.createElement("div");
  host.className = "rf-modal";

  const portOpts = PORTS.map((p) =>
    `<option value="${p.id}"${p.id === defaultPort ? " selected" : ""}>${escapeHTML(p.label)}</option>`
  ).join("");
  const nameVal = existing ? escapeHTML(existing.name) : "";
  const heightVal = existing && Number.isFinite(existing.height) ? existing.height : "";

  const actions = existing
    ? `<div class="rf-actions">` +
        `<button class="rf-delete" data-act="delete" type="button">${t(lang, "rocks_delete")}</button>` +
        `<button class="rf-save" data-act="save" type="button">${t(lang, "rocks_update")}</button>` +
      `</div>`
    : `<button class="rf-save" data-act="save" type="button">${t(lang, "rocks_save")}</button>`;

  host.innerHTML =
    `<div class="rf-panel">` +
      `<div class="rf-head"><span class="rf-title">${t(lang, existing ? "rocks_edit_title" : "rocks_add_title")}</span>` +
        `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
      `<label class="rf-field">${t(lang, "rocks_name")}<input class="rf-name" type="text" value="${nameVal}" /></label>` +
      `<label class="rf-field">${t(lang, "rocks_height")}<input class="rf-height" type="number" step="0.1" min="0" value="${heightVal}" /></label>` +
      `<label class="rf-field">${t(lang, "rocks_port")}<select class="rf-port">${portOpts}</select></label>` +
      `<div class="rf-field"><span>${t(lang, "rocks_position")}</span>` +
        `<button class="rf-pos" data-act="pos" type="button">${coordLabel(lang, coord)}</button></div>` +
      actions +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  const posBtn = host.querySelector('[data-act="pos"]');
  posBtn.addEventListener("click", () => {
    const portId = host.querySelector(".rf-port").value;
    const port = PORTS.find((p) => p.id === portId);
    const center = coord
      || (port ? { lat: port.lat, lon: port.lon } : { lat: settings.lat, lon: settings.lon });
    openMapPicker(settings, center, (c) => {
      coord = c;
      posBtn.textContent = coordLabel(lang, coord);
    });
  });

  host.querySelector('[data-act="save"]').addEventListener("click", () => {
    const name = host.querySelector(".rf-name").value.trim();
    const height = parseFloat(host.querySelector(".rf-height").value);
    const port = host.querySelector(".rf-port").value;
    if (!name || !Number.isFinite(height) || !port) return;
    close();
    const rec = deriveRock({ name, height, port, lat: coord?.lat, lon: coord?.lon });
    onSave(existing ? { ...rec, id: existing.id } : rec);
  });

  const delBtn = host.querySelector('[data-act="delete"]');
  if (delBtn && onDelete) delBtn.addEventListener("click", () => { close(); onDelete(); });
}

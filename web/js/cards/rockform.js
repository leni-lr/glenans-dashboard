import { PORTS } from "../data/ports.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

export function newRockId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Build a rock record from raw form values. Personal rocks only need a name, a
// drying height (above chart datum), and the tide port whose predictions drive
// the safety calc — no coordinate.
export function deriveRock({ name, height, port }) {
  return { id: newRockId(), name: name.trim(), height, port };
}

// Modal to add or edit a rock: name + height + tide port. When `existing` is given
// the fields are pre-filled and the same id is preserved on save; otherwise the
// port select defaults to the dashboard's current tide port.
export function openRockForm(settings, onSave, existing = null) {
  const { lang } = settings;
  const defaultPort = (existing && existing.port) || settings.port || "";
  const host = document.createElement("div");
  host.className = "rf-modal";

  const portOpts = PORTS.map((p) =>
    `<option value="${p.id}"${p.id === defaultPort ? " selected" : ""}>${escapeHTML(p.label)}</option>`
  ).join("");
  const nameVal = existing ? escapeHTML(existing.name) : "";
  const heightVal = existing && Number.isFinite(existing.height) ? existing.height : "";

  host.innerHTML =
    `<div class="rf-panel">` +
      `<div class="rf-head"><span class="rf-title">${t(lang, existing ? "rocks_edit_title" : "rocks_add_title")}</span>` +
        `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
      `<label class="rf-field">${t(lang, "rocks_name")}<input class="rf-name" type="text" value="${nameVal}" /></label>` +
      `<label class="rf-field">${t(lang, "rocks_height")}<input class="rf-height" type="number" step="0.1" min="0" value="${heightVal}" /></label>` +
      `<label class="rf-field">${t(lang, "rocks_port")}<select class="rf-port">${portOpts}</select></label>` +
      `<button class="rf-save" data-act="save" type="button">${t(lang, existing ? "rocks_update" : "rocks_save")}</button>` +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  host.querySelector('[data-act="save"]').addEventListener("click", () => {
    const name = host.querySelector(".rf-name").value.trim();
    const height = parseFloat(host.querySelector(".rf-height").value);
    const port = host.querySelector(".rf-port").value;
    if (!name || !Number.isFinite(height) || !port) return;
    close();
    const rec = deriveRock({ name, height, port });
    onSave(existing ? { ...rec, id: existing.id } : rec);
  });
}

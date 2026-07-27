import { t } from "../i18n.js";

// Small sheet to set the boat's draught, opened from the chip in the Cailloux
// title row. Reuses the rock form's rf-* styles so the two sheets match.
// onPick(metres) fires only for a valid, non-negative number; anything else
// leaves the sheet open and saves nothing.
export function openDraftPicker(settings, onPick) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.className = "rf-modal";
  host.innerHTML =
    `<div class="rf-panel">` +
      `<div class="rf-head"><span class="rf-title">${t(lang, "settings_draft")}</span>` +
        `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
      `<label class="rf-field">` +
        `<input class="rf-draft" type="number" inputmode="decimal" step="0.1" min="0" value="${settings.draft}" />` +
      `</label>` +
      `<button class="rf-save" data-act="save" type="button">${t(lang, "rocks_update")}</button>` +
    `</div>`;

  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);
  host.querySelector('[data-act="save"]').addEventListener("click", () => {
    const v = parseFloat(host.querySelector(".rf-draft").value);
    if (!Number.isFinite(v) || v < 0) return;
    close();
    onPick(v);
  });
}

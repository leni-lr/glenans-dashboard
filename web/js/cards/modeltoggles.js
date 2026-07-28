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

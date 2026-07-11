import { COMPARE_MODELS } from "../sources/compare.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

// Small modal to choose the dashboard forecast model. onPick(key) with "auto"
// or a COMPARE_MODELS key.
export function openModelPicker(settings, onPick) {
  const { lang } = settings;
  const current = settings.forecastModel || "auto";
  const opts = [{ key: "auto", label: t(lang, "model_auto") },
    ...COMPARE_MODELS.map((m) => ({ key: m.key, label: m.label }))];

  const host = document.createElement("div");
  host.className = "mp-modal";
  host.innerHTML = `<div class="mp-panel">` +
    `<div class="mp-head"><span class="mp-title">${t(lang, "model_pick")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<ul class="mp-list">` + opts.map((o, i) =>
      `<li><button class="mp-item${o.key === current ? " mp-item--on" : ""}" data-i="${i}">${escapeHTML(o.label)}</button></li>`
    ).join("") + `</ul></div>`;
  document.body.appendChild(host);

  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);
  host.querySelectorAll(".mp-item").forEach((b) => b.addEventListener("click", () => {
    close();
    onPick(opts[Number(b.getAttribute("data-i"))].key);
  }));
}

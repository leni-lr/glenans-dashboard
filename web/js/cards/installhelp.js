import { t } from "../i18n.js";

// A small dismissible modal explaining how to add the PWA to a phone's home
// screen (iOS Safari + Android Chrome). Text is localised via i18n.
export function openInstallHelp(lang) {
  const host = document.createElement("div");
  host.className = "ih-modal";
  host.innerHTML = `<div class="ih-panel">` +
    `<div class="ih-head"><span class="ih-title">${t(lang, "install_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<p class="ih-line"><b>iPhone</b> — ${t(lang, "install_ios")}</p>` +
    `<p class="ih-line"><b>Android</b> — ${t(lang, "install_android")}</p>` +
    `<p class="ih-note">${t(lang, "install_note")}</p>` +
    `</div>`;
  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);
}

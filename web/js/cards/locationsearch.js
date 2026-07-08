import { searchPlaces } from "../sources/geocode.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

// Location search modal. Calls onPick({lat,lon,place}) when a result is chosen.
export function openLocationSearch(settings, onPick) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.className = "loc-modal";
  host.innerHTML = `<div class="loc-panel">` +
    `<div class="loc-head"><span class="loc-title">${t(lang, "location_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<input class="loc-input" type="search" autocomplete="off" placeholder="${t(lang, "location_search")}" />` +
    `<ul class="loc-results"></ul></div>`;
  document.body.appendChild(host);

  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  const input = host.querySelector(".loc-input");
  const list = host.querySelector(".loc-results");
  let seq = 0;
  const run = async (q) => {
    const mine = ++seq;
    const results = await searchPlaces(q);
    if (mine !== seq) return; // a newer keystroke won
    list.innerHTML = results.length
      ? results.map((r, i) =>
          `<li><button class="loc-item" data-i="${i}">${escapeHTML(r.label)}</button></li>`).join("")
      : `<li class="loc-empty">${t(lang, "location_none")}</li>`;
    list.querySelectorAll(".loc-item").forEach((b) => b.addEventListener("click", () => {
      const r = results[Number(b.getAttribute("data-i"))];
      close();
      onPick({ lat: r.lat, lon: r.lon, place: r.label });
    }));
  };

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 250);
  });
  input.focus();
}

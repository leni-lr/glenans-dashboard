import { searchPlaces } from "../sources/geocode.js";
import { PORTS } from "../data/ports.js";
import { LOCAL_SPOTS } from "../data/spots.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Location search modal. Calls onPick({lat,lon,place}) when a result is chosen.
// A typed query matches maree.info PORTS and the local gazetteer (for exact tides)
// plus Open-Meteo geocoding (towns/wind spots), de-duplicated by name. Picking a
// port uses its exact coords → that port's tide; picking a town snaps to the
// nearest port. Either way wind/bulletin derive from the chosen coordinates.
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

  const render = (items, empty = false) => {
    list.innerHTML = items.length
      ? items.map((r, i) =>
          `<li><button class="loc-item" data-i="${i}">${escapeHTML(r.label)}</button></li>`).join("")
      : (empty ? "" : `<li class="loc-empty">${t(lang, "location_none")}</li>`);
    list.querySelectorAll(".loc-item").forEach((b) => b.addEventListener("click", () => {
      const r = items[Number(b.getAttribute("data-i"))];
      close();
      onPick({ lat: r.lat, lon: r.lon, place: r.label });
    }));
  };

  let seq = 0;
  const run = async (q) => {
    const query = q.trim();
    if (query.length < 2) { render([], true); return; }
    const nq = norm(query);
    const local = LOCAL_SPOTS.filter((s) => norm(s.label).includes(nq));
    const ports = PORTS.filter((p) => norm(p.label).includes(nq)).slice(0, 8)
      .map((p) => ({ label: p.label, lat: p.lat, lon: p.lon }));
    const named = [...local, ...ports].map((x) => norm(x.label));
    const mine = ++seq;
    const geo = await searchPlaces(query);
    if (mine !== seq) return; // a newer keystroke won
    // drop a geocoding result if a port/local entry already covers that name
    const geoDedup = geo.filter((g) => !named.some((n) => n.includes(norm(g.name))));
    render([...local, ...ports, ...geoDedup]);
  };

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 250);
  });
  input.focus();
}

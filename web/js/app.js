import { loadSettings, saveSetting } from "./settings.js";
import { initTheme, applyTheme } from "./theme.js";
import { t } from "./i18n.js";
import { CARD_REGISTRY, REGISTRY_KEYS } from "./cards/registry.js";
import { visibleKeys } from "./cards/cardorder.js";
import { openInstallHelp } from "./cards/installhelp.js";
import { openLocationSearch } from "./cards/locationsearch.js";
import { resolveLocation } from "./location.js";

// Source links used by each card's title / footer credits and later fallbacks.
const SOURCES = {
  forecast: "https://open-meteo.com/",
  livewind: "https://www.windmorbihan.com/Drenec",
  tide: "https://maree.info/94",
  bulletin: "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04",
  isobar: "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure",
};

const state = { settings: loadSettings() };
const mounted = {}; // card key -> { state, refresh } handle

function formatDateTime(lang, date = new Date()) {
  // e.g. "ven. 3 juil. · 07:12"
  const d = date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB",
    { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB",
    { hour: "2-digit", minute: "2-digit" });
  return `${d} · ${time}`;
}

function renderHeader() {
  const { lang, place } = state.settings;
  document.getElementById("header-place").textContent = place;
  document.getElementById("header-datetime").textContent = formatDateTime(lang);
  document.getElementById("btn-lang").textContent = lang.toUpperCase();
  document.getElementById("btn-refresh").setAttribute("aria-label", t(lang, "refresh"));
  updateThemeButton();
}

// Theme button shows a sun (light) / moon (dark) icon for the current theme.
function updateThemeButton() {
  const btn = document.getElementById("btn-settings");
  if (!btn) return;
  const dark = document.documentElement.dataset.theme === "dark";
  btn.textContent = dark ? "☾" : "☀";
  btn.setAttribute("aria-label", t(state.settings.lang, "theme"));
}

function renderFooter() {
  const { lang } = state.settings;
  const links = Object.entries(SOURCES)
    .map(([k, href]) => `<a href="${href}" target="_blank" rel="noopener">${t(lang, `${cardKeyToTitle(k)}`)}</a>`)
    .join(" · ");
  document.getElementById("footer-credits").innerHTML = links;
  const ih = document.getElementById("btn-install-help");
  if (ih) ih.textContent = t(lang, "install_link");
}

function cardKeyToTitle(k) {
  return {
    forecast: "forecast_title", livewind: "livewind_title", tide: "tide_title",
    bulletin: "bulletin_title", isobar: "isobar_title",
  }[k];
}

function renderCards() {
  const keys = visibleKeys(state.settings.cardOrder, state.settings.cardHidden, REGISTRY_KEYS);
  const stack = document.getElementById("card-stack");
  const byKey = (k) => CARD_REGISTRY.find((c) => c.key === k);

  // Ensure a <section> exists for each visible card and appears in the right order.
  // appendChild on an already-attached node MOVES it, so this both creates and reorders.
  for (const key of keys) {
    const reg = byKey(key);
    let sec = document.getElementById(reg.el);
    if (!sec) {
      sec = document.createElement("section");
      sec.id = reg.el;
      sec.className = "card";
    }
    stack.appendChild(sec);
  }

  // Drop sections whose card is no longer visible, and forget their mount handle so
  // re-showing does a fresh mount (reloads data).
  const visibleEls = new Set(keys.map((k) => byKey(k).el));
  for (const sec of [...stack.children]) {
    if (!visibleEls.has(sec.id)) {
      const gone = CARD_REGISTRY.find((c) => c.el === sec.id);
      if (gone) delete mounted[gone.key];
      sec.remove();
    }
  }

  // Mount once, else refresh with the latest settings.
  for (const key of keys) {
    const reg = byKey(key);
    if (!mounted[key]) mounted[key] = reg.mount(state.settings);
    else { mounted[key].state.settings = state.settings; mounted[key].refresh(); }
  }
}

function renderAll() {
  renderHeader();
  renderCards();
  renderFooter();
}

function wireEvents() {
  document.getElementById("btn-lang").addEventListener("click", () => {
    const next = state.settings.lang === "fr" ? "en" : "fr";
    state.settings = saveSetting("lang", next);
    document.documentElement.lang = next;
    renderAll();
  });

  // One click flips light <-> dark, based on the currently-resolved theme.
  document.getElementById("btn-settings").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    state.settings = saveSetting("themePref", next);
    document.documentElement.dataset.themePref = next;
    applyTheme(next);
    updateThemeButton();
  });

  const ih = document.getElementById("btn-install-help");
  if (ih) ih.addEventListener("click", () => openInstallHelp(state.settings.lang));

  // Tap the header location → search a place → resolve nearest station/port/zone.
  const place = document.getElementById("header-place");
  if (place) place.addEventListener("click", () => openLocationSearch(state.settings, (loc) => {
    const derived = resolveLocation(loc);
    saveSetting("place", loc.place);
    saveSetting("lat", loc.lat);
    saveSetting("lon", loc.lon);
    saveSetting("stationNid", derived.stationNid);
    saveSetting("stationLabel", derived.stationLabel);
    saveSetting("port", derived.port);
    state.settings = saveSetting("zone", derived.zone);
    renderAll();
  }));

  // Manual refresh: re-stamp the header and refresh card data.
  document.getElementById("btn-refresh").addEventListener("click", () => {
    renderHeader();
    for (const key of Object.keys(mounted)) mounted[key].refresh();
  });
}

function start() {
  document.documentElement.lang = state.settings.lang;
  document.documentElement.dataset.themePref = state.settings.themePref;
  initTheme(state.settings.themePref);
  renderAll();
  wireEvents();
}

start();

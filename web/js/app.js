import { loadSettings, saveSetting } from "./settings.js";
import { initTheme, applyTheme, THEME_PREFS } from "./theme.js";
import { t } from "./i18n.js";
import { skeletonHTML, mountCard } from "./card.js";

// Source links used by each card's title / footer credits and later fallbacks.
const SOURCES = {
  forecast: "https://open-meteo.com/",
  livewind: "https://www.windmorbihan.com/Drenec",
  tide: "https://maree.info/94",
  bulletin: "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04",
  isobar: "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure",
};

const state = { settings: loadSettings() };

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
  document.getElementById("btn-settings").setAttribute("aria-label", t(lang, "settings"));
}

function cardTitleRow(lang, key, extra = "") {
  return `<div class="card__title-row"><span class="card__title">${t(lang, key)}</span>${extra}</div>`;
}

// Mount every card with a titled skeleton; later phases replace these bodies.
function renderSkeletons() {
  const { lang } = state.settings;
  mountCard("card-forecast", cardTitleRow(lang, "forecast_title") + skeletonHTML(1, true));
  mountCard("card-livewind", cardTitleRow(lang, "livewind_title") + skeletonHTML(2));
  mountCard("card-tide",     cardTitleRow(lang, "tide_title")     + skeletonHTML(1, true));
  mountCard("card-bulletin", cardTitleRow(lang, "bulletin_title") + skeletonHTML(3));
  mountCard("card-isobar",   cardTitleRow(lang, "isobar_title")   + skeletonHTML(1, true));
}

function renderFooter() {
  const { lang } = state.settings;
  const links = Object.entries(SOURCES)
    .map(([k, href]) => `<a href="${href}" target="_blank" rel="noopener">${t(lang, `${cardKeyToTitle(k)}`)}</a>`)
    .join(" · ");
  document.getElementById("footer-credits").innerHTML = links;
}

function cardKeyToTitle(k) {
  return {
    forecast: "forecast_title", livewind: "livewind_title", tide: "tide_title",
    bulletin: "bulletin_title", isobar: "isobar_title",
  }[k];
}

function renderAll() {
  renderHeader();
  renderSkeletons();
  renderFooter();
}

function wireEvents() {
  document.getElementById("btn-lang").addEventListener("click", () => {
    const next = state.settings.lang === "fr" ? "en" : "fr";
    state.settings = saveSetting("lang", next);
    document.documentElement.lang = next;
    renderAll();
  });

  // Cycle theme preference auto -> light -> dark -> auto (settings panel comes later).
  document.getElementById("btn-settings").addEventListener("click", () => {
    const i = THEME_PREFS.indexOf(state.settings.themePref);
    const next = THEME_PREFS[(i + 1) % THEME_PREFS.length];
    state.settings = saveSetting("themePref", next);
    document.documentElement.dataset.themePref = next;
    applyTheme(next);
  });

  // Manual refresh: for now just re-stamp the clock + re-mount skeletons.
  document.getElementById("btn-refresh").addEventListener("click", renderAll);
}

function start() {
  document.documentElement.lang = state.settings.lang;
  document.documentElement.dataset.themePref = state.settings.themePref;
  initTheme(state.settings.themePref);
  renderAll();
  wireEvents();
}

start();

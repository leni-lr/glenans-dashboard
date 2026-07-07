import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { meteogram, bindMeteogramTooltip } from "../charts/meteogram.js";
import { openCompareView } from "./compareview.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-forecast";
const SOURCE = "https://open-meteo.com/";

// 24 h uses AROME HD (high-res, short range); 7 j uses ECMWF (AROME has no data
// past ~2.5 days, which is why 7 j went blank on AROME).
function modelFor(range) {
  return range === "7d" ? MODELS.ecmwf : MODELS.arome;
}
function chipFor(range) {
  return range === "7d" ? "ECMWF" : "AROME 1.3";
}

// Pure: the title row with model chip + control buttons.
export function forecastTitleRow(lang, { range }) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<span class="chip">${chipFor(range)}</span> ` +
      `<button class="linkbtn" data-act="compare">${t(lang, "compare")}</button> ` +
      `<button class="linkbtn" data-act="range" aria-pressed="${range === "7d"}">${t(lang, "seven_days")}</button>` +
    `</span></div>`;
}

// Pure: the legend line under the chart.
export function legendHTML(lang) {
  return `<div class="mg-legend">` +
    `<span class="leg-mean">━</span> ${t(lang, "legend_mean") ?? "vent"}` +
    `&nbsp;&nbsp;<span class="leg-gust">┄</span> ${t(lang, "legend_gust") ?? "rafales"}` +
    `&nbsp;&nbsp;<span class="leg-now">│</span> ${t(lang, "legend_now") ?? "maintenant"}</div>`;
}

function bodyHTML(lang, state, svg) {
  return forecastTitleRow(lang, state) +
    `<div class="mg-wrap">${svg}</div>` +
    legendHTML(lang);
}

// DOM: fetch + render (or error). Never throws out of the card.
export async function renderForecast(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    const days = state.range === "7d" ? 7 : 1;
    state.data = await fetchForecast({
      lat: state.settings.lat, lon: state.settings.lon, model: modelFor(state.range), days,
    });
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: state.range,
      lang,
    });
    mountCard(CARD_ID, bodyHTML(lang, state, svg), { fade: true });
    bindInteractions(state);
  } catch {
    mountCard(CARD_ID, forecastTitleRow(lang, state) + errorHTML(lang, SOURCE));
    bindInteractions(state);
  }
}

// DOM: wire the control buttons (compare opens the full-screen view; range
// toggles 24 h / 7 j) and the tap tooltip.
function bindInteractions(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;

  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "compare") { openCompareView(state.settings); return; }
      if (act === "range") { state.range = state.range === "7d" ? "24h" : "7d"; renderForecast(state); }
    });
  });

  // tap/slide tooltip over the chart
  bindMeteogramTooltip(card.querySelector(".mg-wrap"), state.data);
}

// DOM: create state, render once, return handle for app + interactions.
export function mountForecastCard(settings) {
  const state = { settings, range: "24h", data: null };
  renderForecast(state);
  return { state, refresh: () => renderForecast(state) };
}

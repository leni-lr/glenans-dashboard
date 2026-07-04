import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { meteogram } from "../charts/meteogram.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-forecast";
const SOURCE = "https://open-meteo.com/";

// Pure: the title row with chip + control buttons.
export function forecastTitleRow(lang, { range, comparing }) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<span class="chip">AROME 1.3</span> ` +
      `<button class="linkbtn" data-act="compare" aria-pressed="${comparing}">${t(lang, "compare")}</button> ` +
      `<button class="linkbtn" data-act="range" aria-pressed="${range === "7d"}">${t(lang, "seven_days")}</button>` +
    `</span></div>`;
}

// Pure: the legend line under the chart.
export function legendHTML(lang, comparing) {
  const cmp = comparing ? `&nbsp;&nbsp;<span class="leg-cmp">━ ARPEGE</span>` : "";
  return `<div class="mg-legend">` +
    `<span class="leg-mean">━</span> ${t(lang, "legend_mean") ?? "vent"}` +
    `&nbsp;&nbsp;<span class="leg-gust">┄</span> ${t(lang, "legend_gust") ?? "rafales"}` +
    `&nbsp;&nbsp;<span class="leg-now">│</span> ${t(lang, "legend_now") ?? "maintenant"}${cmp}</div>`;
}

function bodyHTML(lang, state, svg) {
  return forecastTitleRow(lang, state) +
    `<div class="mg-wrap">${svg}</div>` +
    legendHTML(lang, state.comparing);
}

// DOM: fetch + render (or error). Never throws out of the card.
export async function renderForecast(state) {
  const { lang } = state.settings;
  // loading: keep the title + a chart skeleton
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    const days = state.range === "7d" ? 7 : 1;
    state.data = await fetchForecast({
      lat: state.settings.lat, lon: state.settings.lon, model: MODELS.arome, days,
    });
    state.compareData = null;
    if (state.comparing) {
      state.compareData = await fetchForecast({
        lat: state.settings.lat, lon: state.settings.lon, model: state.compareModel, days,
      });
    }
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: state.range,
      lang,
      compare: state.compareData
        ? { times: state.compareData.times, speed: state.compareData.speed }
        : undefined,
    });
    mountCard(CARD_ID, bodyHTML(lang, state, svg), { fade: true });
  } catch {
    mountCard(CARD_ID, forecastTitleRow(lang, state) + errorHTML(lang, SOURCE));
  }
}

// DOM: create state, render once, return handle for app + interactions.
export function mountForecastCard(settings) {
  const state = {
    settings,
    range: "24h",
    comparing: false,
    compareModel: MODELS.arpege,
    data: null,
    compareData: null,
  };
  renderForecast(state);
  return { state, refresh: () => renderForecast(state) };
}

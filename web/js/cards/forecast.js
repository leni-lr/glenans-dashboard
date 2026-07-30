import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { COMPARE_MODELS } from "../sources/compare.js";
import { sliceData } from "../charts/compare.js";
import { meteogram, bindMeteogramTooltip, observedSeries } from "../charts/meteogram.js";
import { fetchWindHistory } from "../sources/windhistory.js";
import { openCompareView } from "./compareview.js";
import { openModelPicker } from "./modelpicker.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-forecast";
const SOURCE = "https://open-meteo.com/";

// 24 h and demain both use the picked model: every model in COMPARE_MODELS
// reaches 48 h, so there is no horizon fallback here. A model that errors or
// returns no data still falls back to ECMWF — that is about source failure.
const hasData = (d) => Array.isArray(d.speed) && d.speed.some((v) => Number.isFinite(v));

// Pure: the title row with model chip + control buttons. `chip` reflects the
// model actually used (set on the state by renderForecast).
export function forecastTitleRow(lang, { chip, range }) {
  const tomorrow = range === "tomorrow";
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, tomorrow ? "forecast_title_tomorrow" : "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="chip chip--btn" data-act="model" type="button">${chip ?? "AROME 1.3"}</button> ` +
      `<button class="linkbtn" data-act="compare">${t(lang, "compare")}</button> ` +
      `<button class="linkbtn" data-act="range" aria-pressed="${tomorrow}">${t(lang, "tomorrow_range")}</button>` +
    `</span></div>`;
}

// Pure: the legend line under the chart. The `observé` key appears only when the
// measured curve was actually drawn.
export function legendHTML(lang, { observed = false } = {}) {
  return `<div class="mg-legend">` +
    `<span class="leg-mean">━</span> ${t(lang, "legend_mean") ?? "vent"}` +
    `&nbsp;&nbsp;<span class="leg-gust">┄</span> ${t(lang, "legend_gust") ?? "rafales"}` +
    (observed ? `&nbsp;&nbsp;<span class="leg-obs">━</span> ${t(lang, "legend_observed")}` : "") +
    `&nbsp;&nbsp;<span class="leg-now">│</span> ${t(lang, "legend_now") ?? "maintenant"}</div>`;
}

function bodyHTML(lang, state, svg, observed) {
  return forecastTitleRow(lang, state) +
    `<div class="mg-wrap">${svg}</div>` +
    legendHTML(lang, { observed });
}

// The measured curve is strictly additive: no station, no Worker, or a dead
// upstream all yield an empty series and a chart identical to before.
async function loadObserved(state) {
  const { stationNid } = state.settings;
  if (stationNid == null || state.range !== "24h") return [];
  try {
    const { samples } = await fetchWindHistory(stationNid);
    return observedSeries(samples);
  } catch {
    return [];
  }
}

// DOM: fetch + render (or error). Never throws out of the card.
export async function renderForecast(state) {
  const { lang } = state.settings;
  const { lat, lon } = state.settings;
  const tomorrow = state.range === "tomorrow";
  const chosen = state.settings.forecastModel || "arome_hd";
  const picked = COMPARE_MODELS.find((m) => m.key === chosen) || COMPARE_MODELS[0];
  state.chip = picked.label;
  const observedP = loadObserved(state);
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    // Demain fetches two days and keeps hours 24–48; AROME HD covers the full
    // 48 h with no gaps, so the picked model is always the one shown.
    const days = tomorrow ? 2 : 1;
    let data = await fetchForecast({ lat, lon, model: picked.model, days }).catch(() => null);
    if ((!data || !hasData(data)) && picked.model !== MODELS.ecmwf) {
      state.chip = "ECMWF";
      data = await fetchForecast({ lat, lon, model: MODELS.ecmwf, days });
    }
    if (!data) throw new Error("no forecast");
    if (tomorrow) data = sliceData(data, 24, 48);
    state.data = data;
    const observed = await observedP;
    const svg = meteogram(state.data, {
      nowTime: new Date().toISOString(),
      range: "24h",
      lang,
      observed,
    });
    mountCard(CARD_ID, bodyHTML(lang, state, svg, observed.length > 0), { fade: true });
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
      if (act === "model") {
        openModelPicker(state.settings, (key) => {
          state.settings.forecastModel = key;
          saveSetting("forecastModel", key);
          renderForecast(state);
        });
        return;
      }
      if (act === "range") {
        state.range = state.range === "tomorrow" ? "24h" : "tomorrow";
        renderForecast(state);
      }
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

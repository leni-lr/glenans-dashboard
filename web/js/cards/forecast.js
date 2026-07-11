import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { COMPARE_MODELS } from "../sources/compare.js";
import { meteogram, bindMeteogramTooltip } from "../charts/meteogram.js";
import { openCompareView } from "./compareview.js";
import { openModelPicker } from "./modelpicker.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-forecast";
const SOURCE = "https://open-meteo.com/";

// 24 h uses AROME HD (high-res, France-only, short range); 7 j uses ECMWF (global,
// and AROME has no data past ~2.5 days). Outside AROME's domain the 24 h view
// falls back to ECMWF too — see renderForecast.
const hasData = (d) => Array.isArray(d.speed) && d.speed.some((v) => Number.isFinite(v));
// models whose horizon reaches 7 days (short-range ones use ECMWF for the 7 j view)
const LONG_RANGE = new Set(["ecmwf", "gfs", "icon"]);

// Pure: the title row with model chip + control buttons. `chip` reflects the
// model actually used (set on the state by renderForecast).
export function forecastTitleRow(lang, { chip, range }) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "forecast_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="chip chip--btn" data-act="model" type="button">${chip ?? "AROME 1.3"}</button> ` +
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
  const { lat, lon } = state.settings;
  const is7d = state.range === "7d";
  const chosen = state.settings.forecastModel || "arome_hd";
  const picked = COMPARE_MODELS.find((m) => m.key === chosen) || COMPARE_MODELS[0];
  // Short-range models can't cover 7 days → use ECMWF for the 7 j view.
  const use7dEcmwf = is7d && !LONG_RANGE.has(picked.key);
  state.chip = use7dEcmwf ? "ECMWF" : picked.label;
  mountCard(CARD_ID, forecastTitleRow(lang, state) + skeletonHTML(0, true));
  try {
    const days = is7d ? 7 : 1;
    // The picked model is used as-is (ECMWF for 7 j on short-range models). Any
    // model that errors or returns no data here falls back to ECMWF.
    const primary = use7dEcmwf ? MODELS.ecmwf : picked.model;
    let data = await fetchForecast({ lat, lon, model: primary, days }).catch(() => null);
    if ((!data || !hasData(data)) && primary !== MODELS.ecmwf) {
      state.chip = "ECMWF";
      data = await fetchForecast({ lat, lon, model: MODELS.ecmwf, days });
    }
    if (!data) throw new Error("no forecast");
    state.data = data;
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
      if (act === "model") {
        openModelPicker(state.settings, (key) => {
          state.settings.forecastModel = key;
          saveSetting("forecastModel", key);
          renderForecast(state);
        });
        return;
      }
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

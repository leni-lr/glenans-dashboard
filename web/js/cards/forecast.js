import { fetchForecast, MODELS } from "../sources/openmeteo.js";
import { meteogram, tooltipAt } from "../charts/meteogram.js";
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
      try {
        state.compareData = await fetchForecast({
          lat: state.settings.lat, lon: state.settings.lon, model: state.compareModel, days,
        });
      } catch {
        state.compareData = null; // overlay unavailable; still render the base meteogram
      }
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
    bindInteractions(state);
  } catch {
    mountCard(CARD_ID, forecastTitleRow(lang, state) + errorHTML(lang, SOURCE));
    bindInteractions(state);
  }
}

// DOM: wire the control buttons (compare / range) and the tap tooltip.
function bindInteractions(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;

  // control buttons (compare / range) — event delegation
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "range") state.range = state.range === "7d" ? "24h" : "7d";
      if (act === "compare") state.comparing = !state.comparing;
      renderForecast(state);
    });
  });

  // tap tooltip over the chart
  const wrap = card.querySelector(".mg-wrap");
  if (!wrap || !state.data) return;
  const tip = document.createElement("div");
  tip.className = "mg-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  const show = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(frac * (state.data.times.length - 1));
    const p = tooltipAt(state.data, i);
    const hh = p.time.slice(11, 16);
    tip.textContent = `${hh} · ${p.mean} kn · raf. ${p.gust} · ${p.cardinal} ${p.dir}°`;
    tip.style.left = `${frac * 100}%`;
    tip.style.top = "6px";
    tip.hidden = false;
  };
  wrap.addEventListener("pointerdown", (e) => show(e.clientX));
  wrap.addEventListener("pointermove", (e) => { if (e.pressure > 0 || e.buttons) show(e.clientX); });
  wrap.addEventListener("pointerleave", () => { tip.hidden = true; });
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

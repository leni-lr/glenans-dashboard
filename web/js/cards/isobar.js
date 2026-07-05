import { WORKER_URL } from "../../config.js";
import { fetchChartManifest } from "../sources/chart.js";
import { chartStepLabel } from "../charts/chart.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-isobar";
const SOURCE = "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure";

function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "isobar_title")}</span></div>`;
}

function bodyHTML(state) {
  const { lang } = state.settings;
  const step = state.steps[state.idx];
  const img = `<img class="isobar-img" src="${WORKER_URL}/api/chart?step=${step}" alt="${t(lang, "isobar_title")}" />`;
  const stepper = `<div class="isobar-step">` +
    `<button class="linkbtn" data-act="prev" type="button">◀</button> ` +
    `<span class="isobar-step__label">${chartStepLabel(state.run, step, lang)}</span> ` +
    `<button class="linkbtn" data-act="next" type="button">▶</button>` +
    `</div>`;
  return plainTitle(lang) + img + stepper;
}

// DOM: re-render the img + stepper from state (no refetch) and bind steppers.
function renderBody(state) {
  mountCard(CARD_ID, bodyHTML(state), { fade: true });
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.getAttribute("data-act") === "next" ? 1 : -1;
      const n = state.steps.length;
      state.idx = (state.idx + dir + n) % n;
      renderBody(state);
    });
  });
}

export async function renderIsobar(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(0, true));
  try {
    const { run, steps } = await fetchChartManifest();
    state.run = run;
    state.steps = steps;
    if (state.idx >= steps.length) state.idx = 0;
    renderBody(state);
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
  }
}

export function mountIsobarCard(settings) {
  const state = { settings, idx: 0, run: null, steps: [] };
  renderIsobar(state);
  return { state, refresh: () => renderIsobar(state) };
}

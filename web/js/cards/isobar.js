import { WORKER_URL } from "../../config.js";
import { fetchChartManifest } from "../sources/chart.js";
import { chartStepLabel } from "../charts/chart.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-isobar";
const SOURCE = "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure";

// title + a colour/B&W toggle (button labelled with the OTHER mode)
function header(state) {
  const { lang } = state.settings;
  const label = state.variant === "bw" ? t(lang, "chart_colour") : t(lang, "chart_bw");
  return `<div class="card__title-row"><span class="card__title">${t(lang, "isobar_title")}</span>` +
    `<button class="linkbtn" data-act="variant" type="button">${label}</button></div>`;
}

function bodyHTML(state) {
  const { lang } = state.settings;
  const step = state.steps[state.idx];
  const img = `<img class="isobar-img" src="${WORKER_URL}/api/chart?step=${step}&variant=${state.variant}" alt="${t(lang, "isobar_title")}" />`;
  const stepper = `<div class="isobar-step">` +
    `<button class="linkbtn" data-act="prev" type="button">◀</button> ` +
    `<span class="isobar-step__label">${chartStepLabel(state.run, step, lang)}</span> ` +
    `<button class="linkbtn" data-act="next" type="button">▶</button>` +
    `</div>`;
  return header(state) + img + stepper;
}

// Fullscreen enlarged view of the current chart (scroll/pinch-zoom on mobile).
function openIsobarZoom(src, alt) {
  const host = document.createElement("div");
  host.className = "isobar-zoom";
  host.innerHTML = `<button class="isobar-zoom-close" type="button" aria-label="✕">✕</button>` +
    `<div class="isobar-zoom-body"></div>`;
  const img = document.createElement("img");
  img.className = "isobar-zoom-img";
  img.src = src;
  img.alt = alt;
  host.querySelector(".isobar-zoom-body").appendChild(img);
  document.body.appendChild(host);
  const close = () => host.remove();
  host.querySelector(".isobar-zoom-close").addEventListener("click", close);
  host.addEventListener("click", (e) => {
    if (e.target === host || e.target.classList.contains("isobar-zoom-body")) close();
  });
}

// the colour/B&W toggle, present in every state (skeleton/body/error)
function bindVariant(state) {
  const card = document.getElementById(CARD_ID);
  const btn = card && card.querySelector('[data-act="variant"]');
  if (btn) btn.addEventListener("click", () => {
    state.variant = state.variant === "bw" ? "colour" : "bw";
    saveSetting("chartVariant", state.variant);
    state.idx = 0;
    renderIsobar(state);
  });
}

function renderBody(state) {
  mountCard(CARD_ID, bodyHTML(state), { fade: true });
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  bindVariant(state);
  card.querySelectorAll('[data-act="prev"], [data-act="next"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.getAttribute("data-act") === "next" ? 1 : -1;
      const n = state.steps.length;
      state.idx = (state.idx + dir + n) % n;
      renderBody(state);
    });
  });
  const img = card.querySelector(".isobar-img");
  if (img) img.addEventListener("click", () => openIsobarZoom(img.src, img.alt));
}

export async function renderIsobar(state) {
  const { lang } = state.settings;
  state.idx = 0; // always (re)open on the T+0 analysis
  mountCard(CARD_ID, header(state) + skeletonHTML(0, true));
  bindVariant(state);
  try {
    const { run, steps } = await fetchChartManifest(state.variant);
    state.run = run;
    state.steps = steps;
    if (state.idx >= steps.length) state.idx = 0;
    renderBody(state);
  } catch {
    mountCard(CARD_ID, header(state) + errorHTML(lang, SOURCE));
    bindVariant(state);
  }
}

export function mountIsobarCard(settings) {
  const state = { settings, idx: 0, run: null, steps: [], variant: settings.chartVariant || "bw" };
  renderIsobar(state);
  return { state, refresh: () => renderIsobar(state) };
}

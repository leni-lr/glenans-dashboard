import { WORKER_URL } from "../../config.js";
import { fetchChartManifest } from "../sources/chart.js";
import { chartStepLabel } from "../charts/chart.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-isobar";
const SOURCE = "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure";

// Pure: the image URL for one step of the current run/variant. Shared by the
// card, the enlarged view, and the preloader so the three cannot drift apart.
export function chartURL(state, step) {
  return `${WORKER_URL}/api/chart?step=${step}&variant=${state.variant}&run=${state.run}`;
}

// Pure: move an index by dir over n steps, stopping at both ends. The run is a
// timeline, not a carousel: stepping back from T+0 must not jump to +84 h.
export function stepIdx(idx, n, dir) {
  return Math.max(0, Math.min(idx + dir, n - 1));
}

// Pure: what a drag in the enlarged view means. Null unless it is a decisive
// horizontal swipe on an unzoomed chart — while zoomed, drags pan the image,
// and one gesture must never mean two things.
export function swipeAction(dx, dy, zoomed) {
  if (zoomed) return null;
  if (Math.abs(dx) <= 50) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}

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
  const img = `<img class="isobar-img" src="${chartURL(state, step)}" alt="${t(lang, "isobar_title")}" />`;
  const stepper = `<div class="isobar-step">` +
    `<button class="linkbtn" data-act="prev" type="button">◀</button> ` +
    `<span class="isobar-step__label">${chartStepLabel(state.run, step, lang)}</span> ` +
    `<button class="linkbtn" data-act="next" type="button">▶</button>` +
    `</div>`;
  return header(state) + img + stepper;
}

// Fullscreen enlarged chart. Pinch-zoom stays the browser's; a horizontal
// swipe steps to the previous/next chart, but only while unzoomed. state.idx
// is shared with the card, and onClose() leaves the card showing whatever
// you swiped to.
function openIsobarZoom(state, onClose) {
  const { lang } = state.settings;
  const n = state.steps.length;

  const host = document.createElement("div");
  host.className = "isobar-zoom";
  host.innerHTML =
    `<div class="isobar-zoom-head">` +
      `<span class="isobar-zoom-label"></span>` +
      `<button class="isobar-zoom-close" type="button" aria-label="${t(lang, "close")}">✕</button>` +
    `</div>` +
    `<div class="isobar-zoom-body"></div>`;

  const body = host.querySelector(".isobar-zoom-body");
  const label = host.querySelector(".isobar-zoom-label");
  const img = document.createElement("img");
  img.className = "isobar-zoom-img";
  img.alt = t(lang, "isobar_title");
  body.appendChild(img);
  document.body.appendChild(host);

  const paint = () => {
    const step = state.steps[state.idx];
    img.src = chartURL(state, step);
    label.textContent = chartStepLabel(state.run, step, lang);
    // Warm both neighbours so a swipe never lands on a blank frame.
    for (const d of [-1, 1]) new Image().src = chartURL(state, state.steps[stepIdx(state.idx, n, d)]);
  };
  paint();

  const close = () => { host.remove(); onClose(); };

  // Pinch-zoom is visual-viewport zoom on both iOS and Android, so the viewport
  // scale is what actually distinguishes "user zoomed in" from "chart is simply
  // wider than the screen" — which is the normal state here, since the charts are
  // ~891px wide and the image is deliberately not shrunk to fit.
  const isZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

  let sx = 0, sy = 0, down = false, moved = false;

  // Guarded the same way the backdrop tap is: a swipe that ends with the
  // pointer over the ✕ must pan/step, not dismiss the view.
  host.querySelector(".isobar-zoom-close").addEventListener("click", () => {
    if (moved) { moved = false; return; }
    close();
  });
  body.addEventListener("pointerdown", (e) => {
    down = true; moved = false; sx = e.clientX; sy = e.clientY;
    try { body.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  });
  body.addEventListener("pointermove", (e) => {
    if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
  });
  body.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = false;
    const act = swipeAction(e.clientX - sx, e.clientY - sy, isZoomed());
    if (!act) return;
    state.idx = stepIdx(state.idx, n, act === "next" ? 1 : -1);
    paint();
  });
  body.addEventListener("pointercancel", () => { down = false; moved = false; });

  // Tap-on-backdrop still closes, but a swipe must not: a drag fires a click
  // too, and without the `moved` guard every swipe would dismiss the view.
  host.addEventListener("click", (e) => {
    if (moved) { moved = false; return; }
    if (e.target === host || e.target === body) close();
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
      state.idx = stepIdx(state.idx, state.steps.length, dir);
      renderBody(state);
    });
  });
  const img = card.querySelector(".isobar-img");
  if (img) img.addEventListener("click", () => openIsobarZoom(state, () => renderBody(state)));
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

import { fetchTide } from "../sources/tide.js";
import { tideCurve, tideModel } from "../charts/tidecurve.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-tide";
const SOURCE = "https://maree.info/94";

function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "tide_title")}</span></div>`;
}

function titleRow(lang, port, coef) {
  const badge = coef && coef.length
    ? `<span class="chip chip--coef">${t(lang, "tide_coef")} ${coef[0]}</span>` : "";
  return `<div class="card__title-row"><span class="card__title">${t(lang, "tide_title")} · ${escapeHTML(port || "")}</span>${badge}</div>`;
}

export async function renderTide(state) {
  const { lang } = state.settings;
  if (state.settings.port == null) {
    mountCard(CARD_ID, plainTitle(lang) + `<p class="tc-none">${t(lang, "tide_none")}</p>`);
    return;
  }
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(0, true));
  try {
    const data = await fetchTide(state.settings.port);
    const svg = tideCurve(tideModel(data), { lang });
    mountCard(CARD_ID, titleRow(lang, data.port, data.coef) + svg, { fade: true });
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
  }
}

export function mountTideCard(settings) {
  const state = { settings };
  renderTide(state);
  return { state, refresh: () => renderTide(state) };
}

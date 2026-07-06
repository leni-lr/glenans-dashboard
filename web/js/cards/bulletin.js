import { fetchBMS } from "../sources/bms.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-bulletin";
const SOURCE = "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04";

function pill(lang, warning) {
  const cls = warning ? "bms-pill--active" : "bms-pill--none";
  const label = warning ? t(lang, "bms_active") : t(lang, "bms_none");
  return `<span class="bms-pill ${cls}">${label}</span>`;
}
function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "bulletin_title")}</span></div>`;
}
function titleRow(lang, warning) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "bulletin_title")}</span>${pill(lang, warning)}</div>`;
}

// The amber alert strip is a global element; the bulletin card owns it.
function forecastHTML(lang, forecasts) {
  if (!forecasts || !forecasts.length) return "";
  const f = forecasts[0];
  return `<div class="bms-forecast">` +
    `<div class="bms-fc-title">${escapeHTML(f.title)}</div>` +
    `<p class="bms-fc-line">${escapeHTML(f.vent)}</p>` +
    (f.mer ? `<p class="bms-fc-line">${escapeHTML(f.mer)}</p>` : "") +
    `</div>`;
}

function setAlertStrip(warning, special) {
  const el = document.getElementById("alert-strip");
  if (!el) return;
  if (warning) { el.textContent = special; el.hidden = false; }
  else { el.textContent = ""; el.hidden = true; }
}

export async function renderBulletin(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(3));
  try {
    const d = await fetchBMS(state.settings.zone);
    const body = titleRow(lang, d.warning) +
      `<p class="bms-text" data-clamped="true">${escapeHTML(d.situation)}</p>` +
      `<button class="linkbtn bms-more" data-act="more">${t(lang, "see_more")}</button>` +
      forecastHTML(lang, d.forecasts);
    mountCard(CARD_ID, body, { fade: true });
    setAlertStrip(d.warning, d.special);
    bindMore(state);
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
    setAlertStrip(false, "");
  }
}

function bindMore(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  const p = card.querySelector(".bms-text");
  const btn = card.querySelector(".bms-more");
  if (!p || !btn) return;
  btn.addEventListener("click", () => {
    const clamped = p.getAttribute("data-clamped") === "true";
    p.setAttribute("data-clamped", clamped ? "false" : "true");
    btn.textContent = t(state.settings.lang, clamped ? "see_less" : "see_more");
  });
}

export function mountBulletinCard(settings) {
  const state = { settings };
  renderBulletin(state);
  return { state, refresh: () => renderBulletin(state) };
}

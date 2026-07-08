import { fetchBMS } from "../sources/bms.js";
import { translateText } from "../sources/translate.js";
import { BMS_ZONES } from "../data/bmszones.js";
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
// the coastal zone the bulletin covers, shown under the title
function areaLine(zone) {
  const z = BMS_ZONES.find((x) => x.code === zone);
  return z ? `<div class="bms-area">${escapeHTML(z.title)}</div>` : "";
}

// The amber alert strip is a global element; the bulletin card owns it.
function reportSection(title, lines) {
  const body = lines.filter(Boolean).map((l) => `<p class="bms-fc-line">${escapeHTML(l)}</p>`).join("");
  return `<div class="bms-fc-title">${escapeHTML(title)}</div>${body}`;
}

// Today's daytime report data: the "journée" forecast for the current day (full
// report — vent/mer/houle/temps/visi), or the day's observations once they replace
// it later on. The French-date match keeps it to today, not tomorrow's échéance.
function pickTodayReport(d) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const fc = (d.forecasts || []).find((f) => /journée/i.test(f.title) && f.title.includes(today));
  if (fc) return { title: fc.title, lines: [fc.vent, fc.mer, fc.houle, fc.temps, fc.visi].filter(Boolean) };
  const obs = d.observation;
  if (obs && obs.title.includes(today)) return { title: obs.title, lines: [obs.text] };
  return null;
}

function setAlertStrip(warning, special) {
  const el = document.getElementById("alert-strip");
  if (!el) return;
  if (warning) { el.textContent = special; el.hidden = false; }
  else { el.textContent = ""; el.hidden = true; }
}

export async function renderBulletin(state) {
  const { lang } = state.settings;
  const area = areaLine(state.settings.zone);
  mountCard(CARD_ID, plainTitle(lang) + area + skeletonHTML(3));
  try {
    const d = await fetchBMS(state.settings.zone);
    let situation = d.situation;
    const report = pickTodayReport(d);
    let rTitle = report ? report.title : "";
    let rLines = report ? report.lines : [];
    // Bulletin text is French source; translate only for the English UI (Worker
    // proxy, with fallback to the original on failure).
    if (lang === "en") {
      const [s, tt, ...ll] = await Promise.all([
        translateText(situation), translateText(rTitle), ...rLines.map((l) => translateText(l)),
      ]);
      situation = s; rTitle = tt; rLines = ll;
    }
    const extra = report ? reportSection(rTitle, rLines) : "";
    const body = titleRow(lang, d.warning) + area +
      `<p class="bms-text" data-clamped="true">${escapeHTML(situation)}</p>` +
      (extra ? `<div class="bms-extra" hidden>${extra}</div>` : "") +
      `<button class="linkbtn bms-more" data-act="more">${t(lang, "see_more")}</button>`;
    mountCard(CARD_ID, body, { fade: true });
    setAlertStrip(d.warning, d.special);
    bindMore(state);
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + area + errorHTML(lang, SOURCE));
    setAlertStrip(false, "");
  }
}

function bindMore(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  const p = card.querySelector(".bms-text");
  const btn = card.querySelector(".bms-more");
  const extra = card.querySelector(".bms-extra");
  if (!p || !btn) return;
  btn.addEventListener("click", () => {
    const nowClamped = p.getAttribute("data-clamped") === "false"; // toggle
    p.setAttribute("data-clamped", String(nowClamped));
    if (extra) extra.hidden = nowClamped;
    btn.textContent = t(state.settings.lang, nowClamped ? "see_more" : "see_less");
  });
}

export function mountBulletinCard(settings) {
  const state = { settings };
  renderBulletin(state);
  return { state, refresh: () => renderBulletin(state) };
}

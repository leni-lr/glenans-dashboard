import { fetchLiveWind } from "../sources/livewind.js";
import { degToCardinal } from "../charts/meteogram.js";
import { minutesAgo } from "../util/time.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";

const CARD_ID = "card-livewind";
const SOURCE = "https://www.windmorbihan.com/Drenec";
const STALE_MIN = 20;
const REFRESH_MS = 5 * 60 * 1000;

function plainTitle(lang) {
  return `<div class="card__title-row"><span class="card__title">${t(lang, "livewind_title")}</span></div>`;
}

function bodyHTML(lang, d) {
  const age = minutesAgo(d.ts);
  const staleCls = age >= STALE_MIN ? " lw-stamp--stale" : "";
  const dirLine = d.dir == null ? "" :
    `<div class="lw-dir">` +
      `<span class="lw-arrow" style="transform:rotate(${d.dir}deg)">↑</span>` +
      `<span>${degToCardinal(d.dir)} ${d.dir}°</span>` +
    `</div>`;
  return plainTitle(lang) +
    `<div class="lw-main">` +
      `<span class="lw-speed">${d.mean}</span><span class="lw-unit">kn</span>` +
      `<span class="lw-gust">${t(lang, "livewind_gust")} ${d.gust}</span>` +
    `</div>` +
    dirLine +
    `<div class="lw-stamp${staleCls}">${t(lang, "livewind_updated")} ${age} ${t(lang, "livewind_ago")}</div>`;
}

export async function renderLiveWind(state) {
  const { lang } = state.settings;
  mountCard(CARD_ID, plainTitle(lang) + skeletonHTML(2));
  try {
    const d = await fetchLiveWind(state.settings.station);
    mountCard(CARD_ID, bodyHTML(lang, d), { fade: true });
  } catch {
    mountCard(CARD_ID, plainTitle(lang) + errorHTML(lang, SOURCE));
  }
}

export function mountLiveWindCard(settings) {
  const state = { settings };
  renderLiveWind(state);
  const timer = setInterval(() => renderLiveWind(state), REFRESH_MS);
  return { state, refresh: () => renderLiveWind(state), stop: () => clearInterval(timer) };
}

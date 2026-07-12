import { fetchTide } from "../sources/tide.js";
import { tideModel } from "../charts/tidecurve.js";
import { rockStatusAt, thToClock } from "../rocks/rocksafety.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";

const CARD_ID = "card-rocks";
const SOURCE = "https://maree.info/";

function titleRow(lang) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "rocks_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="rock-add" data-act="add" type="button" aria-label="+">＋</button>` +
    `</span></div>`;
}

function statusLine(lang, st) {
  const clock = st.crossingTh != null ? thToClock(st.crossingTh) : null;
  if (st.safe) {
    return clock ? `${t(lang, "rocks_clear")} · ${t(lang, "rocks_until")} ${clock}` : t(lang, "rocks_clear");
  }
  return clock ? `${t(lang, "rocks_foul")} · ${t(lang, "rocks_clear_from")} ${clock}` : t(lang, "rocks_foul");
}

function rowHTML(lang, rock, st) {
  const pill = st.safe
    ? `<span class="rock-pill rock-pill--clear">${t(lang, "rocks_clear")}</span>`
    : `<span class="rock-pill rock-pill--foul">${t(lang, "rocks_foul")}</span>`;
  return `<li class="rock-row" data-id="${escapeHTML(rock.id)}">` +
    `<div class="rock-main">` +
      `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
      `<div class="rock-status">${statusLine(lang, st)}</div>` +
    `</div>` +
    pill +
    `<button class="rock-del" data-act="del" data-id="${escapeHTML(rock.id)}" type="button" aria-label="✕">✕</button>` +
    `</li>`;
}

// Fetch each distinct rock port once, compute status per rock. A rock whose port
// fetch fails is returned with st:null (rendered with a "—" status, never blocks
// the others).
async function computeRows(lang, rocks, draft) {
  const ports = [...new Set(rocks.map((r) => r.port).filter(Boolean))];
  const models = new Map();
  await Promise.all(ports.map(async (port) => {
    try { models.set(port, tideModel(await fetchTide(port))); } catch { /* leave unset */ }
  }));
  return rocks.map((rock) => {
    const model = models.get(rock.port);
    if (!model) return { rock, st: null };
    const st = rockStatusAt(model.extremes, { height: rock.height, draft }, model.nowTh);
    return { rock, st };
  });
}

export async function renderRocks(state) {
  const { lang } = state.settings;
  const rocks = state.settings.rocks || [];
  if (!rocks.length) {
    mountCard(CARD_ID, titleRow(lang) + `<p class="rocks-none">${t(lang, "rocks_none")}</p>`);
    bindRocks(state);
    return;
  }
  mountCard(CARD_ID, titleRow(lang) + skeletonHTML(2, false));
  try {
    const rows = await computeRows(lang, rocks, state.settings.draft);
    const body = rows.map(({ rock, st }) =>
      st ? rowHTML(lang, rock, st)
         : `<li class="rock-row" data-id="${escapeHTML(rock.id)}"><div class="rock-main">` +
           `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
           `<div class="rock-status">—</div></div>` +
           `<button class="rock-del" data-act="del" data-id="${escapeHTML(rock.id)}" type="button" aria-label="✕">✕</button></li>`
    ).join("");
    mountCard(CARD_ID, titleRow(lang) + `<ul class="rocks-list">${body}</ul>`, { fade: true });
    bindRocks(state);
  } catch {
    mountCard(CARD_ID, titleRow(lang) + errorHTML(lang, SOURCE));
    bindRocks(state);
  }
}

// Click wiring. The add-form and delete are fully wired in Task 5; here the add
// button is a no-op placeholder and delete is unhandled.
function bindRocks(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  // (Task 5 attaches add/del handlers here.)
}

export function mountRocksCard(settings) {
  const state = { settings };
  renderRocks(state);
  return { state, refresh: () => renderRocks(state) };
}

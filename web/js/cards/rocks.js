import { fetchTide } from "../sources/tide.js";
import { tideModel } from "../charts/tidecurve.js";
import { rockStatusAt, thToClock } from "../rocks/rocksafety.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";
import { openRockForm } from "./rockform.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-rocks";
const SOURCE = "https://maree.info/";

function titleRow(lang) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "rocks_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="rock-add" data-act="add" type="button" aria-label="+">＋</button>` +
    `</span></div>`;
}

// "passe jusqu'à 12h24" while it clears; "découvert jusqu'à 14h37" while it dries.
// The clock is the next moment the state flips (or nothing if it holds all day).
function statusLine(lang, st) {
  const word = st.safe ? t(lang, "rocks_pass") : t(lang, "rocks_dry");
  const clock = st.crossingTh != null ? thToClock(st.crossingTh) : null;
  return clock ? `${word} ${t(lang, "rocks_until")} ${clock}` : word;
}

function rowActions(lang, id) {
  // Only edit on the dashboard — deletion lives inside the edit form, so a rock
  // can't be removed by a stray tap on the list.
  return `<button class="rock-edit" data-act="edit" data-id="${escapeHTML(id)}" type="button" aria-label="${t(lang, "rocks_edit_title")}">✎</button>`;
}

function rowHTML(lang, rock, st) {
  const pill = st.safe
    ? `<span class="rock-pill rock-pill--clear">${t(lang, "rocks_pass")}</span>`
    : `<span class="rock-pill rock-pill--foul">${t(lang, "rocks_dry")}</span>`;
  return `<li class="rock-row" data-id="${escapeHTML(rock.id)}">` +
    `<div class="rock-main">` +
      `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
      `<div class="rock-status">${statusLine(lang, st)}</div>` +
    `</div>` +
    pill +
    rowActions(lang, rock.id) +
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
           rowActions(lang, rock.id) + `</li>`
    ).join("");
    mountCard(CARD_ID, titleRow(lang) + `<ul class="rocks-list">${body}</ul>`, { fade: true });
    bindRocks(state);
  } catch {
    mountCard(CARD_ID, titleRow(lang) + errorHTML(lang, SOURCE));
    bindRocks(state);
  }
}

// Click wiring: ＋ opens the add-rock form, ✕ deletes a rock. Both persist
// settings.rocks and re-render.
function bindRocks(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "add") {
        openRockForm(state.settings, {
          onSave: (rock) => {
            state.settings.rocks = [...(state.settings.rocks || []), rock];
            saveSetting("rocks", state.settings.rocks);
            renderRocks(state);
          },
        });
      } else if (act === "edit") {
        const id = btn.getAttribute("data-id");
        const existing = (state.settings.rocks || []).find((r) => r.id === id);
        if (!existing) return;
        openRockForm(state.settings, {
          existing,
          onSave: (rock) => {
            state.settings.rocks = (state.settings.rocks || []).map((r) => (r.id === rock.id ? rock : r));
            saveSetting("rocks", state.settings.rocks);
            renderRocks(state);
          },
          onDelete: () => {
            state.settings.rocks = (state.settings.rocks || []).filter((r) => r.id !== id);
            saveSetting("rocks", state.settings.rocks);
            renderRocks(state);
          },
        });
      }
    });
  });
}

export function mountRocksCard(settings) {
  const state = { settings };
  renderRocks(state);
  return { state, refresh: () => renderRocks(state) };
}

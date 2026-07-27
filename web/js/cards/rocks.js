import { fetchTide } from "../sources/tide.js";
import { tideModel } from "../charts/tidecurve.js";
import { rockStatusAt, thToClock } from "../rocks/rocksafety.js";
import { t } from "../i18n.js";
import { mountCard, skeletonHTML, errorHTML } from "../card.js";
import { escapeHTML } from "../util/html.js";
import { openRockForm } from "./rockform.js";
import { openDraftPicker } from "./draftpicker.js";
import { saveSetting } from "../settings.js";

const CARD_ID = "card-rocks";
const SOURCE = "https://maree.info/";

// Pure: the chip's label — "1,5 m" in French, "1.5 m" in English. A corrupt
// stored value reads 0,0 m rather than NaN.
export function draftLabel(lang, draft) {
  const n = Number(draft);
  const v = (Number.isFinite(n) ? n : 0).toFixed(1);
  return `${lang === "fr" ? v.replace(".", ",") : v} m`;
}

// The draught chip shows the current value and opens the picker — same pattern
// as the model chip on the forecast card. It lives here, not in Réglages,
// because it is only ever meaningful next to the rocks it gates.
function titleRow(lang, draft) {
  return `<div class="card__title-row">` +
    `<span class="card__title">${t(lang, "rocks_title")}</span>` +
    `<span class="card__controls">` +
      `<button class="chip chip--btn" data-act="draft" type="button">${draftLabel(lang, draft)}</button> ` +
      `<button class="rock-add" data-act="add" type="button" aria-label="+">＋</button>` +
    `</span></div>`;
}

// Pure: the coloured pill, which is now the row's entire status. "passe jusqu'à
// 12h24" while the boat clears; "passe pas jusqu'à 14h37" while it doesn't. The
// clock is the next moment the state flips, and is dropped when it holds all day.
export function rockPill(lang, st) {
  const word = t(lang, st.safe ? "rocks_pass" : "rocks_dry");
  const clock = st.crossingTh != null ? thToClock(st.crossingTh) : null;
  const text = clock ? `${word} ${t(lang, "rocks_until")} ${clock}` : word;
  const cls = st.safe ? "rock-pill--clear" : "rock-pill--foul";
  return `<span class="rock-pill ${cls}">${text}</span>`;
}

function rowActions(lang, id) {
  // Only edit on the dashboard — deletion lives inside the edit form, so a rock
  // can't be removed by a stray tap on the list.
  return `<button class="rock-edit" data-act="edit" data-id="${escapeHTML(id)}" type="button" aria-label="${t(lang, "rocks_edit_title")}">✎</button>`;
}

function rowHTML(lang, rock, st) {
  return `<li class="rock-row" data-id="${escapeHTML(rock.id)}">` +
    `<div class="rock-main"><div class="rock-name">${escapeHTML(rock.name)}</div></div>` +
    rockPill(lang, st) +
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
    mountCard(CARD_ID, titleRow(lang, state.settings.draft) + `<p class="rocks-none">${t(lang, "rocks_none")}</p>`);
    bindRocks(state);
    return;
  }
  mountCard(CARD_ID, titleRow(lang, state.settings.draft) + skeletonHTML(2, false));
  try {
    const rows = await computeRows(lang, rocks, state.settings.draft);
    const body = rows.map(({ rock, st }) =>
      st ? rowHTML(lang, rock, st)
         : `<li class="rock-row" data-id="${escapeHTML(rock.id)}"><div class="rock-main">` +
           `<div class="rock-name">${escapeHTML(rock.name)}</div>` +
           `<div class="rock-status">—</div></div>` +
           rowActions(lang, rock.id) + `</li>`
    ).join("");
    mountCard(CARD_ID, titleRow(lang, state.settings.draft) + `<ul class="rocks-list">${body}</ul>`, { fade: true });
    bindRocks(state);
  } catch {
    mountCard(CARD_ID, titleRow(lang, state.settings.draft) + errorHTML(lang, SOURCE));
    bindRocks(state);
  }
}

// Click wiring: the draught chip opens the picker, ＋ opens the add-rock form,
// ✎ edits one. All persist their setting and re-render.
function bindRocks(state) {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "draft") {
        openDraftPicker(state.settings, (v) => {
          state.settings.draft = v;
          saveSetting("draft", v);
          renderRocks(state);
        });
        return;
      }
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

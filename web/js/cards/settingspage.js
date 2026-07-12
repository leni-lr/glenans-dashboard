import { CARD_REGISTRY, REGISTRY_KEYS } from "./registry.js";
import { orderedKeys, reorder } from "./cardorder.js";
import { saveSetting } from "../settings.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

// Full-screen settings overlay. ☰ opens it; ← (or backdrop) closes it and calls
// onClose(). Toggles persist cardHidden; long-press-drag on the handle persists
// cardOrder; the draft input persists draft. All three also mutate `settings` in
// place so the caller's live settings object stays current.
export function openSettingsPage(settings, onClose) {
  const { lang } = settings;
  const title = (key) => t(lang, CARD_REGISTRY.find((c) => c.key === key).titleKey);

  const host = document.createElement("div");
  host.className = "set-modal";

  const rowsHTML = () => orderedKeys(settings.cardOrder, REGISTRY_KEYS).map((key) => {
    const hidden = (settings.cardHidden || []).includes(key);
    return `<li class="set-row" data-key="${key}">` +
      `<span class="set-handle" data-act="handle" aria-hidden="true">⠿</span>` +
      `<span class="set-label">${escapeHTML(title(key))}</span>` +
      `<label class="set-switch"><input type="checkbox" data-act="toggle" ${hidden ? "" : "checked"} />` +
      `<span class="set-slider"></span></label>` +
      `</li>`;
  }).join("");

  host.innerHTML =
    `<div class="set-panel">` +
      `<div class="set-head">` +
        `<button class="iconbtn" data-act="close" aria-label="${t(lang, "settings_back")}">←</button>` +
        `<span class="set-title">${t(lang, "settings")}</span>` +
      `</div>` +
      `<h3 class="set-section">${t(lang, "settings_cards")}</h3>` +
      `<ul class="set-list">${rowsHTML()}</ul>` +
      `<label class="set-field">${t(lang, "settings_draft")}` +
        `<input class="set-draft" type="number" inputmode="decimal" step="0.1" min="0" value="${settings.draft}" />` +
      `</label>` +
    `</div>`;

  document.body.appendChild(host);

  const close = () => { host.remove(); onClose(); };
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  // Card on/off toggles.
  host.querySelectorAll('[data-act="toggle"]').forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.closest(".set-row").getAttribute("data-key");
      const hidden = new Set(settings.cardHidden || []);
      if (input.checked) hidden.delete(key); else hidden.add(key);
      settings.cardHidden = [...hidden];
      saveSetting("cardHidden", settings.cardHidden);
    });
  });

  // Draft.
  const draftInput = host.querySelector(".set-draft");
  draftInput.addEventListener("change", () => {
    const v = parseFloat(draftInput.value);
    if (Number.isFinite(v) && v >= 0) {
      settings.draft = v;
      saveSetting("draft", v);
    }
  });

  wireDragReorder(host, settings);
}

// Grab a row's handle and drag to reorder — starts instantly on pointerdown (no
// long-press), commits cardOrder on release. preventDefault + pointer capture stop
// Android from selecting text or scrolling mid-drag.
function wireDragReorder(host, settings) {
  const list = host.querySelector(".set-list");
  let dragging = null;

  const rows = () => [...list.querySelectorAll(".set-row")];
  const currentOrder = () => rows().map((r) => r.getAttribute("data-key"));

  list.querySelectorAll('[data-act="handle"]').forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // block text-selection / scroll on touch
      dragging = handle.closest(".set-row");
      dragging.classList.add("set-row--dragging");
      handle.setPointerCapture?.(e.pointerId); // keep move/up events flowing on touch
    });
  });

  host.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const rs = rows();
    const from = rs.indexOf(dragging);
    // Find the row whose vertical midpoint the pointer is past.
    let to = from;
    rs.forEach((r, i) => {
      const box = r.getBoundingClientRect();
      if (e.clientY > box.top + box.height / 2) to = i;
    });
    if (to !== from) {
      const order = reorder(currentOrder(), from, to);
      // Re-append rows in the new order (moves existing nodes).
      order.forEach((key) => list.appendChild(rs.find((r) => r.getAttribute("data-key") === key)));
    }
  });

  const end = () => {
    if (!dragging) return;
    dragging.classList.remove("set-row--dragging");
    dragging = null;
    settings.cardOrder = currentOrder();
    saveSetting("cardOrder", settings.cardOrder);
  };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
}

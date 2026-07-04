import { t } from "./i18n.js";

// Pure: skeleton markup (plain blocks, no spinner/animation).
export function skeletonHTML(lines = 2, withChart = false) {
  const chart = withChart ? '<div class="skeleton skeleton--chart"></div>' : "";
  const rows = Array.from({ length: lines },
    () => '<div class="skeleton skeleton--line"></div>').join("");
  return chart + rows;
}

// Pure: per-card failure message with a link back to the original source.
export function errorHTML(lang, href) {
  const label = t(lang, "source_down");
  return `<p class="card__error"><a href="${href}" target="_blank" rel="noopener">${label}</a></p>`;
}

// DOM: replace a card's contents; optional fade-in on data arrival.
export function mountCard(id, html, { fade = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  if (fade) {
    el.classList.remove("fade-in");
    void el.offsetWidth; // restart the animation
    el.classList.add("fade-in");
  }
}

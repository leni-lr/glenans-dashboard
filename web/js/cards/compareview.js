import { fetchAllModels } from "../sources/compare.js";
import { overlayChart, trimTrailingNulls } from "../charts/compare.js";
import { meteogram } from "../charts/meteogram.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

const OVERLAY_ID = "compare-overlay";

function legend(series) {
  return `<div class="cmp-legend">` + series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${i}"></span>${escapeHTML(s.label)}</span>`
  ).join("") + `</div>`;
}

function grid(series, lang) {
  return `<div class="cmp-grid">` + series.map((s) => {
    const body = s.data
      ? meteogram(trimTrailingNulls(s.data), { lang, range: "7d", nowTime: new Date().toISOString() })
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
    return `<figure class="cmp-cell"><figcaption>${escapeHTML(s.label)}</figcaption>${body}</figure>`;
  }).join("") + `</div>`;
}

export async function openCompareView(settings) {
  const { lang } = settings;
  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.className = "cmp-modal";
  host.innerHTML = `<div class="cmp-panel">` +
    `<div class="cmp-head"><span class="cmp-title">${t(lang, "compare_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    `<div class="cmp-body">${t(lang, "loading")}</div></div>`;
  document.body.appendChild(host);
  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);

  try {
    const series = await fetchAllModels({ lat: settings.lat, lon: settings.lon, days: 7 });
    const lines = series.filter((s) => s.data).map((s) => ({
      key: s.key, label: s.label, times: s.data.times, speed: s.data.speed,
    }));
    const body = host.querySelector(".cmp-body");
    if (!body) return;
    body.innerHTML = (lines.length
      ? `<div class="cmp-overlay">${overlayChart(lines, { lang })}</div>${legend(series)}`
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`) + grid(series, lang);
  } catch {
    const body = host.querySelector(".cmp-body");
    if (body) body.innerHTML = `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
  }
}

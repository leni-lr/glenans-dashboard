import { fetchAllModels } from "../sources/compare.js";
import { overlayChart, trimTrailingNulls, sliceData, bindOverlayTooltip } from "../charts/compare.js";
import { meteogram, bindMeteogramTooltip } from "../charts/meteogram.js";
import { t } from "../i18n.js";
import { escapeHTML } from "../util/html.js";

const OVERLAY_ID = "compare-overlay";

// Time windows over the 7-day fetch (hourly indices; hour 0 = today 00:00 local).
const RANGES = [
  { key: "today",    labelKey: "compare_today",    start: 0,  end: 24 },
  { key: "tomorrow", labelKey: "compare_tomorrow", start: 24, end: 48 },
  { key: "week",     labelKey: "seven_days",       start: 0,  end: null },
];

function tabs(lang, activeKey) {
  return `<div class="cmp-tabs">` + RANGES.map((r) =>
    `<button class="cmp-tab${r.key === activeKey ? " cmp-tab--on" : ""}" data-range="${r.key}">${t(lang, r.labelKey)}</button>`
  ).join("") + `</div>`;
}

function legend(series) {
  return `<div class="cmp-legend">` + series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${i}"></span>${escapeHTML(s.label)}</span>`
  ).join("") + `</div>`;
}

function grid(series, lang, r) {
  return `<div class="cmp-grid">` + series.map((s) => {
    const body = s.data
      ? `<div class="mg-wrap">${meteogram(trimTrailingNulls(sliceData(s.data, r.start, r.end)),
          { lang, range: r.key === "week" ? "7d" : "24h", nowTime: new Date().toISOString() })}</div>`
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
    return `<figure class="cmp-cell"><figcaption>${escapeHTML(s.label)}</figcaption>${body}</figure>`;
  }).join("") + `</div>`;
}

// Render overlay + legend + grid for one range (no refetch — slices in memory).
function renderBody(host, series, rangeKey, lang) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[0];
  const body = host.querySelector(".cmp-body");
  if (!body) return;
  const lines = series.filter((s) => s.data).map((s) => {
    const w = sliceData(s.data, r.start, r.end);
    return { key: s.key, label: s.label, times: w.times, speed: w.speed };
  });
  body.innerHTML = (lines.length
    ? `<div class="cmp-overlay"><div class="mg-wrap">${overlayChart(lines, { lang, range: r.key })}</div></div>${legend(series)}`
    : `<p class="cmp-miss">${t(lang, "source_down")}</p>`) + grid(series, lang, r);

  // slide tooltip on the overlay: mean + median across models
  const ov = body.querySelector(".cmp-overlay .mg-wrap");
  if (ov && lines.length) bindOverlayTooltip(ov, lines, lang);

  // slide tooltip on each per-model chart (cells with data, in series order)
  const wraps = body.querySelectorAll(".cmp-cell .mg-wrap");
  series.filter((s) => s.data).forEach((s, i) => {
    if (wraps[i]) bindMeteogramTooltip(wraps[i], trimTrailingNulls(sliceData(s.data, r.start, r.end)));
  });
}

export async function openCompareView(settings) {
  const { lang } = settings;
  let range = "today";
  let loaded = null;

  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.className = "cmp-modal";
  host.innerHTML = `<div class="cmp-panel">` +
    `<div class="cmp-head"><span class="cmp-title">${t(lang, "compare_title")}</span>` +
    `<button class="linkbtn" data-act="close" aria-label="${t(lang, "close")}">✕</button></div>` +
    tabs(lang, range) +
    `<div class="cmp-body">${t(lang, "loading")}</div></div>`;
  document.body.appendChild(host);

  const close = () => host.remove();
  host.addEventListener("click", (e) => { if (e.target === host) close(); });
  host.querySelector('[data-act="close"]').addEventListener("click", close);
  host.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => {
    range = b.getAttribute("data-range");
    host.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("cmp-tab--on", x === b));
    if (loaded) renderBody(host, loaded, range, lang);
  }));

  try {
    loaded = await fetchAllModels({ lat: settings.lat, lon: settings.lon, days: 7 });
    renderBody(host, loaded, range, lang);
  } catch {
    const body = host.querySelector(".cmp-body");
    if (body) body.innerHTML = `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
  }
}

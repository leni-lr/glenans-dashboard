import { fetchAllModels } from "../sources/compare.js";
import { overlayChart, trimTrailingNulls, sliceData, bindOverlayTooltip } from "../charts/compare.js";
import { meteogram, bindMeteogramTooltip, observedSeries } from "../charts/meteogram.js";
import { fetchWindHistory } from "../sources/windhistory.js";
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

function legend(series, lang, observed) {
  const models = series.map((s, i) =>
    `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--${i}"></span>${escapeHTML(s.label)}</span>`
  ).join("");
  const real = observed
    ? `<span class="cmp-key"><span class="cmp-swatch cmp-swatch--obs"></span>${t(lang, "legend_observed")}</span>`
    : "";
  return `<div class="cmp-legend">${models}${real}</div>`;
}

function grid(series, lang, r, observed) {
  return `<div class="cmp-grid">` + series.map((s) => {
    const body = s.data
      ? `<div class="mg-wrap">${meteogram(trimTrailingNulls(sliceData(s.data, r.start, r.end)),
          { lang, range: r.key === "week" ? "7d" : "24h", nowTime: new Date().toISOString(), observed })}</div>`
      : `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
    return `<figure class="cmp-cell"><figcaption>${escapeHTML(s.label)}</figcaption>${body}</figure>`;
  }).join("") + `</div>`;
}

// Render overlay + legend + grid for one range (no refetch — slices in memory).
// The measured curve belongs to today only: on demain / 7 j it is dropped, and
// the charts' own domain filter would discard it anyway.
function renderBody(host, series, rangeKey, lang, allObserved) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[0];
  const body = host.querySelector(".cmp-body");
  if (!body) return;
  const observed = rangeKey === "today" ? allObserved : [];
  const lines = series.filter((s) => s.data).map((s) => {
    const w = sliceData(s.data, r.start, r.end);
    return { key: s.key, label: s.label, times: w.times, speed: w.speed };
  });
  body.innerHTML = (lines.length
    ? `<div class="cmp-overlay"><div class="mg-wrap">${overlayChart(lines, { lang, range: r.key, observed })}</div></div>${legend(series, lang, observed.length > 0)}`
    : `<p class="cmp-miss">${t(lang, "source_down")}</p>`) + grid(series, lang, r, observed);

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
  let observed = [];

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
    if (loaded) renderBody(host, loaded, range, lang, observed);
  }));

  try {
    // Both in flight at once; the measured curve is optional and never blocks
    // or fails the model grid.
    const [models, obs] = await Promise.all([
      fetchAllModels({ lat: settings.lat, lon: settings.lon, days: 7 }),
      settings.stationNid == null
        ? Promise.resolve([])
        : fetchWindHistory(settings.stationNid).then((d) => observedSeries(d.samples)).catch(() => []),
    ]);
    loaded = models;
    observed = obs;
    renderBody(host, loaded, range, lang, observed);
  } catch {
    const body = host.querySelector(".cmp-body");
    if (body) body.innerHTML = `<p class="cmp-miss">${t(lang, "source_down")}</p>`;
  }
}

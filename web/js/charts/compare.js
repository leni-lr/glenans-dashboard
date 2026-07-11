import { computeYMax } from "./meteogram.js";
import { t } from "../i18n.js";

// Median of a numeric array (empty → null).
export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// DOM: slide tooltip on the overlay chart showing the mean + median wind across
// the models at the hovered hour (not each model — that would be too busy).
export function bindOverlayTooltip(wrap, series, lang) {
  const active = series.filter((s) => Array.isArray(s.speed) && s.speed.length);
  if (!wrap || !active.length) return;
  const maxLen = Math.max(1, ...active.map((s) => s.times.length));
  const times = (active.find((s) => s.times.length === maxLen) || {}).times || [];
  const tip = document.createElement("div");
  tip.className = "mg-tip";
  tip.hidden = true;
  wrap.appendChild(tip);
  let dragging = false;
  const show = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(frac * (maxLen - 1));
    const vals = active.map((s) => s.speed[i]).filter((v) => Number.isFinite(v));
    if (!vals.length) return;
    const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const med = Math.round(median(vals));
    const hh = (times[i] || "").slice(11, 16);
    tip.textContent = `${hh} · ${t(lang, "cmp_avg")} ${mean} kn · ${t(lang, "cmp_median")} ${med} kn`;
    tip.style.top = "6px";
    tip.hidden = false;
    const w = rect.width, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(tw / 2 + 2, Math.min(w - tw / 2 - 2, frac * w))}px`;
  };
  wrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { wrap.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    show(e.clientX);
  });
  wrap.addEventListener("pointermove", (e) => { if (dragging) show(e.clientX); });
  const end = () => { dragging = false; };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);
  wrap.addEventListener("pointerleave", () => { if (!dragging) tip.hidden = true; });
}

// Slice a forecast's parallel arrays to a [start, end) hour-index window.
export function sliceData(data, start, end) {
  const stop = end == null ? data.times.length : Math.min(end, data.times.length);
  const s = Math.min(start, data.times.length);
  return {
    times: data.times.slice(s, stop),
    speed: data.speed.slice(s, stop),
    gust: (data.gust ?? []).slice(s, stop),
    dir: (data.dir ?? []).slice(s, stop),
  };
}

// Drop trailing null speeds (short-range models pad the tail with nulls).
export function trimTrailingNulls(data) {
  let n = data.times.length;
  while (n > 0 && (data.speed[n - 1] == null)) n--;
  if (n === data.times.length) return data;
  return {
    times: data.times.slice(0, n),
    speed: data.speed.slice(0, n),
    gust: (data.gust ?? []).slice(0, n),
    dir: (data.dir ?? []).slice(0, n),
  };
}

// Overlay of each series' mean-wind line on one shared y-axis. Lines break at
// nulls (so a model that ends early just stops). Colours via .cmp-line--N.
export function overlayChart(series, opts = {}) {
  const W = opts.width ?? 320, H = opts.height ?? 150;
  const L = 26, R = 8, B = 22, TOP = 8;
  const plotW = W - L - R, plotH = H - B - TOP;
  const active = series.filter((s) => Array.isArray(s.speed) && s.speed.length);
  const maxLen = Math.max(1, ...active.map((s) => s.times.length));
  const labelTimes = (active.find((s) => s.times.length === maxLen) || {}).times || [];
  const allSpeeds = active.flatMap((s) => s.speed).filter((v) => v != null);
  const ym = computeYMax(allSpeeds);
  const x = (i) => L + (maxLen <= 1 ? 0 : (i * plotW) / (maxLen - 1));
  const y = (v) => TOP + plotH * (1 - v / ym);
  const f = (n) => n.toFixed(1);

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="${opts.ariaLabel ?? "Comparaison des modèles"}" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  for (const v of [10, 20, 30]) {
    if (v > ym) continue;
    s += `<line class="mg-grid" x1="${L}" y1="${f(y(v))}" x2="${W - R}" y2="${f(y(v))}"/>`;
    s += `<text class="mg-axis" x="${L - 4}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`;
  }
  active.forEach((ser) => {
    const idx = series.indexOf(ser);
    let d = "", pen = false;
    ser.speed.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${f(x(i))} ${f(y(v))} `;
      pen = true;
    });
    if (d) s += `<path class="cmp-line--${idx}" d="${d.trim()}"/>`;
  });

  // x-axis time scale: weekday at day boundaries for the week view, else hours.
  const is7 = opts.range === "week";
  for (let i = 0; i < labelTimes.length; i++) {
    const hh = Number(labelTimes[i].slice(11, 13));
    if (is7) {
      if (hh === 0) {
        const wd = new Date(labelTimes[i]).toLocaleDateString(
          opts.lang === "en" ? "en-GB" : "fr-FR", { weekday: "short" });
        s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 6}" text-anchor="middle">${wd}</text>`;
      }
    } else if (hh % 6 === 0) {
      s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 6}" text-anchor="middle">${hh}h</text>`;
    }
  }
  return s + `</svg>`;
}

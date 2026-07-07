// Pure helpers for the wind meteogram. (The SVG builder is added in Task 3.)

// Top of the y-axis in knots. Baseline 35 keeps the 10/20/30 gridlines tidy;
// expand past 32kn gusts to the next multiple of 10 at/above max+3 for headroom.
export function computeYMax(gusts) {
  const max = gusts.length ? Math.max(...gusts) : 0;
  if (max > 32) return Math.ceil((max + 3) / 10) * 10;
  return 35;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function degToCardinal(deg) {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// One hour's values for the tap tooltip.
export function tooltipAt(data, i) {
  return {
    time: data.times[i],
    mean: data.speed[i],
    gust: data.gust[i],
    dir: data.dir[i],
    cardinal: degToCardinal(data.dir[i]),
  };
}

// DOM: attach a tap/slide tooltip to a chart wrapper. `data` is a normalized
// forecast {times,speed,gust,dir}. Pointer capture + touch-action:none (CSS) let
// a finger scrub across the hours with the box tracking it, instead of vanishing.
export function bindMeteogramTooltip(wrap, data) {
  if (!wrap || !data || !Array.isArray(data.times) || !data.times.length) return;
  const tip = document.createElement("div");
  tip.className = "mg-tip";
  tip.hidden = true;
  wrap.appendChild(tip);
  let dragging = false;
  const show = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(frac * (data.times.length - 1));
    const p = tooltipAt(data, i);
    if (p.mean == null) return;
    const hh = p.time.slice(11, 16);
    // small arrow following the wind (downwind, dir+180), like the live-wind card
    const arrow = p.dir == null ? ""
      : `<span class="mg-arrow-inline" style="transform:rotate(${(p.dir + 180) % 360}deg)">↑</span> `;
    tip.innerHTML = `${hh} · ${p.mean} kn · raf. ${p.gust} · ${arrow}${p.cardinal} ${p.dir}°`;
    tip.style.top = "6px";
    tip.hidden = false;
    // clamp so the centred box (translateX -50%) stays inside the chart at the edges
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

// Inline-SVG meteogram. Colours/dashes are supplied by CSS classes (see
// meteogram.css); this function emits geometry + classes only.
export function meteogram(data, opts = {}) {
  const W = opts.width ?? 300, H = opts.height ?? 118;
  const L = 26, R = 8, B = 34, TOP = 10;
  const { times, speed, gust, dir } = data;
  const N = times.length;
  const ym = computeYMax(gust);
  const plotW = W - L - R, plotH = H - B - TOP;
  const baseY = H - B;
  const x = (i) => L + (N <= 1 ? 0 : (i * plotW) / (N - 1));
  const y = (v) => TOP + plotH * (1 - v / ym);
  const f = (n) => n.toFixed(1);

  let line = `M${f(x(0))} ${f(y(speed[0]))}`;
  for (let i = 1; i < N; i++) line += ` L${f(x(i))} ${f(y(speed[i]))}`;
  const area = `${line} L${f(x(N - 1))} ${baseY} L${f(x(0))} ${baseY} Z`;

  let gustP = `M${f(x(0))} ${f(y(gust[0]))}`;
  for (let i = 1; i < N; i++) gustP += ` L${f(x(i))} ${f(y(gust[i]))}`;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="${opts.ariaLabel ?? "Prévision de vent"}" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:block">`;

  for (const v of [10, 20, 30]) {
    if (v > ym) continue;
    s += `<line class="mg-grid" x1="${L}" y1="${f(y(v))}" x2="${W - R}" y2="${f(y(v))}"/>`;
    s += `<text class="mg-axis" x="${L - 4}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`;
  }

  s += `<path class="mg-area" d="${area}"/>`;
  s += `<path class="mg-line" d="${line}"/>`;
  s += `<path class="mg-gust" d="${gustP}"/>`;

  if (opts.compare && Array.isArray(opts.compare.speed) && opts.compare.speed.length) {
    const cs = opts.compare.speed, cn = cs.length;
    const cx = (i) => L + (cn <= 1 ? 0 : (i * plotW) / (cn - 1));
    let cp = `M${f(cx(0))} ${f(y(cs[0]))}`;
    for (let i = 1; i < cn; i++) cp += ` L${f(cx(i))} ${f(y(cs[i]))}`;
    s += `<path class="mg-compare" d="${cp}"/>`;
  }

  if (opts.nowTime != null) {
    const now = new Date(opts.nowTime).getTime();
    const t0 = new Date(times[0]).getTime();
    const tN = new Date(times[N - 1]).getTime();
    if (!Number.isNaN(now) && tN > t0) {
      const frac = (now - t0) / (tN - t0);
      if (frac >= 0 && frac <= 1) {
        const xn = L + frac * plotW;
        s += `<line class="mg-now" x1="${f(xn)}" y1="${TOP}" x2="${f(xn)}" y2="${baseY + 2}"/>`;
      }
    }
  }

  const arrowStep = Math.max(1, Math.round(N / 12));
  for (let i = 0; i < N; i += arrowStep) {
    const rot = (((dir[i] ?? 0) + 180) % 360);
    s += `<g class="mg-arrow" transform="translate(${f(x(i))},${H - 22}) rotate(${rot})">` +
      `<path d="M0 -5 L3.4 4 L0 2 L-3.4 4 Z"/></g>`;
  }

  const is7d = opts.range === "7d";
  for (let i = 0; i < N; i++) {
    const hh = Number(times[i].slice(11, 13));
    if (is7d) {
      if (hh === 0) {
        const wd = new Date(times[i]).toLocaleDateString(
          opts.lang === "en" ? "en-GB" : "fr-FR", { weekday: "short" });
        s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 3}" text-anchor="middle">${wd}</text>`;
      }
    } else if (hh % 6 === 0) {
      s += `<text class="mg-axis" x="${f(x(i))}" y="${H - 3}" text-anchor="middle">${hh}h</text>`;
    }
  }

  return s + `</svg>`;
}

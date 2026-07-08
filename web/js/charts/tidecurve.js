// Fractional hours from `todayISO` 00:00 (local) to an ISO-ish "YYYY-MM-DDTHH:MM".
export function hoursFromMidnight(isoT, todayISO) {
  return (new Date(isoT).getTime() - new Date(`${todayISO}T00:00`).getTime()) / 3600000;
}

// Cosine interpolation of tide height at time `th` (hours), given extremes
// `points` = [{th, h}] sorted ascending. Clamps to end heights outside the range.
export function tideHeightAt(points, th) {
  if (th <= points[0].th) return points[0].h;
  const last = points[points.length - 1];
  if (th >= last.th) return last.h;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1];
    if (th >= a.th && th <= b.th) {
      return (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos((Math.PI * (th - a.th)) / (b.th - a.th));
    }
  }
  return last.h;
}

const TIDE_HALF_PERIOD = 6.2075; // ~ half a semi-diurnal cycle, in hours

// Prepend a synthetic extreme before the day's first one so the curve oscillates
// from 00:00 instead of running flat until the first HW/LW (maree.info only gives
// today onward, so there's no real previous extreme). Its height mirrors the next
// extreme of that (opposite) type.
export function withLeadingExtreme(pts) {
  if (!pts.length || pts[0].th <= 0) return pts;
  const first = pts[0];
  const type = first.type === "high" ? "low" : "high";
  const ref = pts.find((p) => p.type === type) || first;
  return [{ th: first.th - TIDE_HALF_PERIOD, h: ref.h, type, time: "" }, ...pts];
}

export function tideCurve(model, opts = {}) {
  const W = opts.width ?? 300, H = opts.height ?? 118;
  const L = 10, R = 10, B = 20, TOP = 26;
  const pts = model.extremes;
  // y-scale adapts to the day's range: ~0.6 m headroom above the highest water,
  // floored at 5.4 m (Glénan) so small-range days still look right. Big-range
  // spots (Lézardrieux/Paimpol, HW ~11 m) no longer run off the top.
  const maxH = pts.reduce((m, p) => Math.max(m, p.h), 0);
  const YMAX = Math.max(5.4, maxH + 0.6);
  // x domain spans 23:00 (prev) → 01:00 (next) = th ∈ [-1, 25], a 26 h window, so
  // the "now" marker near midnight has margin and stays readable. The curve/labels
  // still only cover today (0–24); the ±1 h edges are just breathing room.
  const x = (th) => L + ((th + 1) / 26) * (W - L - R);
  const y = (h) => TOP + (H - B - TOP) * (1 - h / YMAX);
  const f = (n) => n.toFixed(1);

  let line = "", area = "";
  for (let th = 0; th <= 24.001; th += 0.5) {
    const px = f(x(th)), py = f(y(tideHeightAt(pts, th)));
    line += (th === 0 ? "M" : " L") + px + " " + py;
  }
  const baseY = H - B;
  area = `${line} L${f(x(24))} ${baseY} L${f(x(0))} ${baseY} Z`;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${opts.ariaLabel ?? "Courbe de marée du jour"}" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  s += `<path class="tc-area" d="${area}"/><path class="tc-line" d="${line}"/>`;

  for (const e of pts) {
    if (e.th <= 0 || e.th >= 24) continue; // only today's HW/LW are labelled
    const tag = e.type === "high" ? "PM" : "BM";
    // extra clearance so the "now" dot/ring doesn't cover the label (both HW and LW)
    const yTop = e.type === "high" ? y(e.h) - 22 : y(e.h) - 20;
    s += `<text class="tc-label-main" x="${f(x(e.th))}" y="${f(yTop)}" text-anchor="middle">${tag} ${e.time}</text>`;
    s += `<text class="tc-label-sub" x="${f(x(e.th))}" y="${f(yTop + 11)}" text-anchor="middle">${e.h.toFixed(1).replace(".", ",")} m</text>`;
  }

  const nowHeight = tideHeightAt(pts, model.nowTh);
  const nx = f(x(model.nowTh)), ny = f(y(nowHeight));
  s += `<circle class="tc-now-dot" cx="${nx}" cy="${ny}" r="5"/><circle class="tc-now-ring" cx="${nx}" cy="${ny}" r="8.5"/>`;
  // current height (m) below the curve, so it never clashes with the PM/BM labels above
  const nowM = nowHeight.toFixed(1).replace(".", ",");
  const nyLabel = Math.min(y(nowHeight) + 18, baseY - 3);
  s += `<text class="tc-now-label" x="${nx}" y="${f(nyLabel)}" text-anchor="middle">${nowM} m ${model.rising ? "↗" : "↘"}</text>`;

  for (const th of [0, 6, 12, 18, 24]) {
    s += `<text class="tc-axis" x="${f(x(th))}" y="${H - 3}" text-anchor="middle">${th}h</text>`;
  }
  return s + `</svg>`;
}

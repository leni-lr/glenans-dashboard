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

export function tideCurve(model, opts = {}) {
  const W = opts.width ?? 300, H = opts.height ?? 118;
  const L = 10, R = 10, B = 20, TOP = 26;
  const YMAX = 5.4; // metres, headroom above typical Glénan HW ~4.8
  const pts = model.extremes;
  const x = (th) => L + (th / 24) * (W - L - R);
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
    if (e.th <= 0 || e.th >= 24) {
      if (e.th > -1 && e.th < 25) {
        s += `<text class="tc-label-sub" x="${f(x(Math.min(24, Math.max(0, e.th))))}" y="${f(y(e.h) - 6)}" text-anchor="middle">${e.time}</text>`;
      }
      continue;
    }
    const tag = e.type === "high" ? "PM" : "BM";
    const yTop = e.type === "high" ? y(e.h) - 12 : y(e.h) - 16;
    s += `<text class="tc-label-main" x="${f(x(e.th))}" y="${f(yTop)}" text-anchor="middle">${tag} ${e.time}</text>`;
    s += `<text class="tc-label-sub" x="${f(x(e.th))}" y="${f(yTop + 11)}" text-anchor="middle">${e.h.toFixed(1).replace(".", ",")} m</text>`;
  }

  const nx = f(x(model.nowTh)), ny = f(y(tideHeightAt(pts, model.nowTh)));
  s += `<circle class="tc-now-dot" cx="${nx}" cy="${ny}" r="5"/><circle class="tc-now-ring" cx="${nx}" cy="${ny}" r="8.5"/>`;
  const nowH = String(Math.floor(model.nowTh)).padStart(2, "0") + ":" + String(Math.round((model.nowTh % 1) * 60)).padStart(2, "0");
  s += `<text class="tc-now-label" x="${f(x(model.nowTh) - 12)}" y="${f(y(tideHeightAt(pts, model.nowTh)) - 10)}" text-anchor="end">${nowH} ${model.rising ? "↗" : "↘"}</text>`;

  for (const th of [0, 6, 12, 18, 24]) {
    s += `<text class="tc-axis" x="${f(x(th))}" y="${H - 3}" text-anchor="middle">${th}h</text>`;
  }
  return s + `</svg>`;
}

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

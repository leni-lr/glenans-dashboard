// windmorbihan observations feed, day view. `time_frame` is an ENUM, not a
// duration: the site's own UI only ever sends 60 (2 h), 36 (6 h), 144 (24 h)
// and 1152 (8 days). Any other value silently falls back to a useless ~8-point
// default, so do not "improve" this number.
export const DAY_FRAME = 144;

export function windHistoryURL(nid) {
  return `https://backend.windmorbihan.com/observations/chart.json?sensor=${nid}&time_frame=${DAY_FRAME}`;
}

// The feed uses "" for channels a sensor lacks; Number("") is 0, so coerce
// through this guard which maps empty/absent/non-finite to null. (Deliberately
// duplicated from livewind.js — worker source modules stay standalone.)
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Every sample that has both a timestamp and a mean wind, oldest→newest. A
// sample missing either is DROPPED rather than nulled: the curve is mapped by
// time, so a gap just becomes a longer straight segment instead of a break.
export function parseWindHistory(jsonText) {
  const arr = JSON.parse(jsonText);
  if (!Array.isArray(arr)) throw new Error("not an array");
  const samples = [];
  for (const r of arr) {
    const ts = num(r?.ts);
    const mean = num(r?.ws?.moy);
    if (ts == null || mean == null) continue;
    const gust = num(r?.ws?.max);
    samples.push({ ts, mean, gust: gust == null ? mean : gust, dir: num(r?.wd?.moy) });
  }
  if (!samples.length) throw new Error("no valid readings");
  return { samples };
}

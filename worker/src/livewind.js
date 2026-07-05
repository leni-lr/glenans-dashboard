// windmorbihan observations feed: array of readings, oldest→newest. We surface
// only the latest. Fields: ts (epoch seconds), ws.moy/ws.max (knots, mean/gust),
// wd.moy (degrees true). Empty strings appear when a sensor lacks that channel.
export function liveWindURL(nid) {
  return `https://backend.windmorbihan.com/observations/chart.json?sensor=${nid}&time_frame=60`;
}

// The feed uses "" for channels a sensor lacks; Number("") is 0, so coerce
// through this guard which maps empty/absent/non-finite to null.
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseLiveWind(jsonText) {
  const arr = JSON.parse(jsonText);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("no readings");
  const last = arr[arr.length - 1];
  const mean = num(last?.ws?.moy);
  const gust = num(last?.ws?.max);
  const dir = num(last?.wd?.moy);
  const ts = num(last?.ts);
  if (mean == null || ts == null) throw new Error("bad reading");
  return {
    mean,
    gust: gust == null ? mean : gust,
    dir,
    ts,
  };
}

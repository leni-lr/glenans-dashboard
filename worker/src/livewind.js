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
  // Scan back for the most recent reading that actually has a wind value — some
  // stations report a timestamp but leave ws.moy empty ("") for the last minutes.
  for (let i = arr.length - 1; i >= 0; i--) {
    const r = arr[i];
    const mean = num(r?.ws?.moy);
    const ts = num(r?.ts);
    if (mean != null && ts != null) {
      const gust = num(r?.ws?.max);
      const dir = num(r?.wd?.moy);
      return { mean, gust: gust == null ? mean : gust, dir, ts };
    }
  }
  throw new Error("no valid reading");
}

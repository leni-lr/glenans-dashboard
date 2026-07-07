import { WORKER_URL } from "../../config.js";

// windmorbihan station slug → sensor nid + display label. Drénec (nid 6) is the
// LCJ anemometer on île Drénec, in the Glénan — the reference reading there.
// (Phase 9 replaces this with the nearest of the full 29-station network.)
export const STATIONS = {
  Drenec: { nid: 6, label: "Drénec" },
};

export function stationLabel(slug) {
  return (STATIONS[slug] || {}).label || slug;
}

export async function fetchLiveWind(station = "Drenec") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const nid = (STATIONS[station] || STATIONS.Drenec).nid;
  const res = await fetch(`${WORKER_URL}/api/livewind?nid=${nid}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `livewind HTTP ${res.status}`);
  return data;
}

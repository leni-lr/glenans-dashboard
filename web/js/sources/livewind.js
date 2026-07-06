import { WORKER_URL } from "../../config.js";

// windmorbihan station slug → sensor nid. Drénec (nid 6) is the LCJ anemometer
// on île Drénec, in the Glénan — the reference reading for sailing there.
export const STATION_NID = { Drenec: 6 };

export async function fetchLiveWind(station = "Drenec") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const nid = STATION_NID[station] ?? STATION_NID.Drenec;
  const res = await fetch(`${WORKER_URL}/api/livewind?nid=${nid}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `livewind HTTP ${res.status}`);
  return data;
}

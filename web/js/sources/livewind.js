import { WORKER_URL } from "../../config.js";

// Fetch the latest reading for a windmorbihan station by its sensor nid (the
// nearest station is resolved from the location; see web/js/location.js).
export async function fetchLiveWind(nid) {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  if (nid == null) throw new Error("no station");
  const res = await fetch(`${WORKER_URL}/api/livewind?nid=${encodeURIComponent(nid)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `livewind HTTP ${res.status}`);
  return data;
}

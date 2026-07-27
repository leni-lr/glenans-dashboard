import { WORKER_URL } from "../../config.js";

// The day's measured wind (~24 h of 10-minute samples) from the nearest
// windmorbihan anemometer. The station nid is resolved from the location; see
// web/js/location.js. Outside STATION_COVERAGE_KM there is no station and no
// curve — callers pass null and get a thrown error they are expected to swallow.
export async function fetchWindHistory(nid) {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  if (nid == null) throw new Error("no station");
  const res = await fetch(`${WORKER_URL}/api/windhistory?nid=${encodeURIComponent(nid)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `windhistory HTTP ${res.status}`);
  return data;
}

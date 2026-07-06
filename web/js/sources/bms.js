import { WORKER_URL } from "../../config.js";

// Marine bulletin from the Worker (Météo-France rwg proxy). Text stays French.
export async function fetchBMS(zone = "BMSCOTE-01-04") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/bms?zone=${encodeURIComponent(zone)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `bms HTTP ${res.status}`);
  return data;
}

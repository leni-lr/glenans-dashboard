import { WORKER_URL } from "../../config.js";

// Fetch normalised tide data from the Worker (maree.info scraper).
export async function fetchTide(port = "94") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/tide?port=${encodeURIComponent(port)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `tide HTTP ${res.status}`);
  return data;
}

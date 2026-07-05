import { WORKER_URL } from "../../config.js";

// Fetch the Met Office chart manifest from the Worker: { run, steps }.
export async function fetchChartManifest() {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/chart`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `chart HTTP ${res.status}`);
  return data;
}

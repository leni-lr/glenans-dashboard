import { WORKER_URL } from "../../config.js";

// Fetch the Met Office chart manifest from the Worker: { run, steps }. The step
// list differs per variant (colour goes to T+120, bw to T+84).
export async function fetchChartManifest(variant = "colour") {
  if (!WORKER_URL) throw new Error("WORKER_URL not configured");
  const res = await fetch(`${WORKER_URL}/api/chart?variant=${encodeURIComponent(variant)}`);
  const data = await res.json().catch(() => ({ error: "bad json" }));
  if (!res.ok || data.error) throw new Error(data.error || `chart HTTP ${res.status}`);
  return data;
}

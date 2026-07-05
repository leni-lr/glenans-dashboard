import { parseTide } from "./tide.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname !== "/api/tide") return json({ error: "not found" }, 404);

    const port = (url.searchParams.get("port") || "94").replace(/[^0-9]/g, "") || "94";
    const cache = caches.default;
    const cacheKey = new Request(`https://tide.cache/${port}`, request);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    try {
      const res = await fetch(`https://maree.info/${port}`, { headers: { "User-Agent": UA } });
      if (!res.ok) return json({ error: `maree.info HTTP ${res.status}` }, 502);
      const data = parseTide(await res.text());
      const out = json(data, 200, { "Cache-Control": "public, max-age=21600" });
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    } catch (e) {
      return json({ error: `tide parse failed: ${String(e.message || e)}` }, 502);
    }
  },
};

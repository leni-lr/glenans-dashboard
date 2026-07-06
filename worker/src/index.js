import { parseTide } from "./tide.js";
import { parseLatestRun, chartGifURL, CHART_STEPS } from "./chart.js";
import { parseLiveWind, liveWindURL } from "./livewind.js";
import { parseBMS, bmsURL, tokenFromSetCookie, MF_HOME } from "./bms.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0";
const METOFFICE_PAGE = "https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

async function handleTide(url, request, ctx) {
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
}

async function handleChart(url, request, ctx) {
  const stepParam = url.searchParams.get("step");
  const cache = caches.default;
  const cacheKey = new Request(`https://chart.cache/${stepParam ?? "manifest"}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const page = await fetch(METOFFICE_PAGE, { headers: { "User-Agent": UA } });
    if (!page.ok) return json({ error: `metoffice HTTP ${page.status}` }, 502);
    const run = parseLatestRun(await page.text());

    if (stepParam == null) {
      const out = json({ run, steps: CHART_STEPS }, 200, { "Cache-Control": "public, max-age=3600" });
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    const step = Number(stepParam);
    if (!CHART_STEPS.includes(step)) return json({ error: `invalid step ${stepParam}` }, 400);
    const gif = await fetch(chartGifURL(run, step), { headers: { "User-Agent": UA } });
    if (!gif.ok) return json({ error: `chart HTTP ${gif.status}` }, 502);
    const out = new Response(gif.body, {
      status: 200,
      headers: { "Content-Type": "image/gif", ...CORS, "Cache-Control": "public, max-age=3600" },
    });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `chart failed: ${String(e.message || e)}` }, 502);
  }
}

async function handleLiveWind(url, request, ctx) {
  const nid = (url.searchParams.get("nid") || "6").replace(/[^0-9]/g, "") || "6";
  const cache = caches.default;
  const cacheKey = new Request(`https://livewind.cache/${nid}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(liveWindURL(nid), { headers: { "User-Agent": UA } });
    if (!res.ok) return json({ error: `windmorbihan HTTP ${res.status}` }, 502);
    const data = parseLiveWind(await res.text());
    const out = json({ nid: Number(nid), ...data }, 200, { "Cache-Control": "public, max-age=120" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `livewind failed: ${String(e.message || e)}` }, 502);
  }
}

// Mint a fresh rwg Bearer token: meteofrance.com sets an `mfsession` cookie
// whose ROT13 is the token. env.MF_TOKEN overrides (for local testing).
async function mintBMSToken(env) {
  if (env && env.MF_TOKEN) return env.MF_TOKEN;
  const res = await fetch(MF_HOME, { headers: { "User-Agent": UA } });
  const setCookie = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie().join("\n")
    : (res.headers.get("set-cookie") || "");
  const token = tokenFromSetCookie(setCookie);
  if (!token) throw new Error("mfsession cookie not found");
  return token;
}

async function handleBMS(url, request, env, ctx) {
  const zone = (url.searchParams.get("zone") || "BMSCOTE-01-04").replace(/[^A-Za-z0-9-]/g, "") || "BMSCOTE-01-04";
  const cache = caches.default;
  const cacheKey = new Request(`https://bms.cache/${zone}`, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const token = await mintBMSToken(env);
    const res = await fetch(bmsURL(zone), {
      headers: {
        "User-Agent": UA,
        "Authorization": `Bearer ${token}`,
        "Origin": "https://meteofrance.com",
        "Referer": "https://meteofrance.com/",
        "Accept": "*/*",
      },
    });
    if (!res.ok) return json({ error: `meteofrance HTTP ${res.status}` }, 502);
    const data = parseBMS(await res.text());
    const out = json(data, 200, { "Cache-Control": "public, max-age=1800" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json({ error: `bms failed: ${String(e.message || e)}` }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/api/tide") return handleTide(url, request, ctx);
    if (url.pathname === "/api/chart") return handleChart(url, request, ctx);
    if (url.pathname === "/api/livewind") return handleLiveWind(url, request, ctx);
    if (url.pathname === "/api/bms") return handleBMS(url, request, env, ctx);
    return json({ error: "not found" }, 404);
  },
};

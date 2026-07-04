// Open-Meteo wind forecast — called directly from the browser (CORS, no key).
const HOURLY = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "precipitation", "cloud_cover"];

export const MODELS = {
  arome:  "meteofrance_arome_france_hd",
  arpege: "meteofrance_arpege_europe",
  icon:   "icon_eu",
  ecmwf:  "ecmwf_ifs025",
  gfs:    "gfs_global",
};

// Pure: build the request URL. URLSearchParams handles encoding.
export function buildForecastURL({ lat, lon, model = MODELS.arome, days = 1 }) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY.join(","),
    models: model,
    wind_speed_unit: "kn",
    timezone: "Europe/Paris",
    forecast_days: String(days),
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

// Pure: flatten Open-Meteo's hourly block into parallel arrays.
export function normalizeForecast(json) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error("open-meteo: missing hourly.time");
  return {
    times:  h.time,
    speed:  h.wind_speed_10m ?? [],
    gust:   h.wind_gusts_10m ?? [],
    dir:    h.wind_direction_10m ?? [],
    precip: h.precipitation ?? [],
    cloud:  h.cloud_cover ?? [],
  };
}

// Thin fetch wrapper (browser/global fetch). Throws on HTTP error.
export async function fetchForecast(opts) {
  const res = await fetch(buildForecastURL(opts));
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  return normalizeForecast(await res.json());
}

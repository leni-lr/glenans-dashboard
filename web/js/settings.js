const STORAGE_KEY = "glenans";

export const DEFAULTS = {
  lang: "fr",
  themePref: "auto",
  place: "Penfret · Glénan",
  lat: 47.716,
  lon: -3.950,
  stationNid: 6,
  stationLabel: "Drénec",
  port: "94",
  zone: "BMSCOTE-01-04",
  chartVariant: "bw",
  forecastModel: "arome_hd",
};

// Pure: DEFAULTS overlaid with only the known keys from `stored`.
export function mergeSettings(stored) {
  const out = { ...DEFAULTS };
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && stored[key] !== undefined) out[key] = stored[key];
    }
  }
  return out;
}

// DOM: read + parse + merge, never throw.
export function loadSettings() {
  try {
    return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...DEFAULTS };
  }
}

// DOM: update one key and persist.
export function saveSetting(key, value) {
  const next = { ...loadSettings(), [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

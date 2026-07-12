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
  cardOrder: ["forecast", "livewind", "tide", "rocks", "bulletin", "isobar"],
  cardHidden: ["rocks"],
  rocks: [],
  draft: 1.5,
};

// Pure: DEFAULTS overlaid with only the known keys from `stored`. Array-valued
// settings are cloned (never shared with DEFAULTS or across calls) so callers can
// mutate settings.rocks / settings.cardOrder without corrupting the defaults.
export function mergeSettings(stored) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = Array.isArray(DEFAULTS[key]) ? DEFAULTS[key].slice() : DEFAULTS[key];
  }
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored && stored[key] !== undefined) {
        out[key] = Array.isArray(stored[key]) ? stored[key].slice() : stored[key];
      }
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

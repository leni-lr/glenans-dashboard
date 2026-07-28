import { fetchForecast, MODELS } from "./openmeteo.js";

export const COMPARE_MODELS = [
  { key: "arome_hd", label: "AROME HD",  model: MODELS.arome },
  { key: "arome25",  label: "AROME 2.5", model: MODELS.arome25 },
  { key: "icon",     label: "ICON-EU",   model: MODELS.icon },
  { key: "ecmwf",    label: "ECMWF",     model: MODELS.ecmwf },
  { key: "gfs",      label: "GFS",       model: MODELS.gfs },
  { key: "harmonie", label: "HARMONIE",  model: MODELS.harmonie },
];

// Fetch all comparison models in parallel; a failed model resolves to data:null
// so one bad model never blanks the view. `ci` is the model's fixed colour slot
// — carried on the series so filtering the list cannot recolour what remains.
export async function fetchAllModels({ lat, lon, days = 7 }) {
  return Promise.all(
    COMPARE_MODELS.map(async (m, ci) => {
      try {
        const data = await fetchForecast({ lat, lon, model: m.model, days });
        return { key: m.key, label: m.label, ci, data };
      } catch {
        return { key: m.key, label: m.label, ci, data: null };
      }
    })
  );
}

// Pure: drop the models switched off in settings.compareHidden, preserving order.
export function visibleModels(series, hidden) {
  if (!Array.isArray(hidden) || !hidden.length) return series;
  return series.filter((s) => !hidden.includes(s.key));
}

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
// so one bad model never blanks the view.
export async function fetchAllModels({ lat, lon, days = 7 }) {
  return Promise.all(
    COMPARE_MODELS.map(async (m) => {
      try {
        const data = await fetchForecast({ lat, lon, model: m.model, days });
        return { key: m.key, label: m.label, data };
      } catch {
        return { key: m.key, label: m.label, data: null };
      }
    })
  );
}

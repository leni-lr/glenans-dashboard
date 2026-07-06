// FR/EN UI dictionary. Source texts (BMS bulletin) are NOT translated — they
// stay in their original language and never pass through here.
export const LANGS = ["fr", "en"];

export const DICT = {
  header_subtitle_sep: { fr: " · ", en: " · " },
  forecast_title:   { fr: "Prévision vent · 24 h", en: "Wind forecast · 24 h" },
  compare:          { fr: "+ comparer",            en: "+ compare" },
  seven_days:       { fr: "7 j",                   en: "7 d" },
  livewind_title:   { fr: "Vent actuel",           en: "Live wind" },
  livewind_gust:    { fr: "raf.",                  en: "gust" },
  livewind_updated: { fr: "mis à jour il y a",     en: "updated" },
  livewind_ago:     { fr: "min",                   en: "min ago" },
  tide_title:       { fr: "Marée",                 en: "Tide" },
  tide_coef:        { fr: "coef",                  en: "coef" },
  bulletin_title:   { fr: "Situation générale",    en: "General situation" },
  bms_none:         { fr: "BMS : aucun",           en: "BMS: none" },
  bms_active:       { fr: "BMS en cours",          en: "BMS in effect" },
  see_more:         { fr: "voir plus",             en: "see more" },
  see_less:         { fr: "voir moins",            en: "see less" },
  isobar_title:     { fr: "Isobares · Met Office", en: "Isobars · Met Office" },
  source_down:      { fr: "Source indisponible — ouvrir sur le site ↗",
                      en: "Source unavailable — open on the site ↗" },
  refresh:          { fr: "Rafraîchir",            en: "Refresh" },
  settings:         { fr: "Réglages",              en: "Settings" },
  legend_mean: { fr: "vent",       en: "wind" },
  legend_gust: { fr: "rafales",    en: "gusts" },
  legend_now:  { fr: "maintenant", en: "now" },
};

export function t(lang, key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] ?? entry.fr ?? key;
}

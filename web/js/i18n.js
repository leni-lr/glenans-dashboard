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
  livewind_none:    { fr: "Pas de station d'observation à proximité.",
                      en: "No nearby observation station." },
  location_title:   { fr: "Changer de lieu",       en: "Change location" },
  location_search:  { fr: "Rechercher un lieu…",   en: "Search a place…" },
  location_none:    { fr: "Aucun résultat",        en: "No results" },
  tide_title:       { fr: "Marée",                 en: "Tide" },
  tide_coef:        { fr: "coef",                  en: "coef" },
  tide_none:        { fr: "Pas de port de marée à proximité.",
                      en: "No nearby tide port." },
  bulletin_title:   { fr: "Situation générale",    en: "General situation" },
  bms_none:         { fr: "BMS : aucun",           en: "BMS: none" },
  bms_active:       { fr: "BMS en cours",          en: "BMS in effect" },
  see_more:         { fr: "voir plus",             en: "see more" },
  see_less:         { fr: "voir moins",            en: "see less" },
  compare_title:    { fr: "Comparaison des modèles", en: "Model comparison" },
  compare_today:    { fr: "aujourd'hui",           en: "today" },
  compare_tomorrow: { fr: "demain",                en: "tomorrow" },
  install_link:     { fr: "Comment l'ajouter sur mon téléphone ?", en: "How do I add it to my phone?" },
  install_title:    { fr: "Ajouter à l'écran d'accueil", en: "Add to home screen" },
  install_ios:      { fr: "dans Safari, appuyez sur Partager, faites défiler vers le bas, puis « Sur l'écran d'accueil ».",
                      en: "in Safari, tap Share, scroll down, then \"Add to Home Screen\"." },
  install_android:  { fr: "dans Chrome, ouvrez le menu ⋮, puis « Installer l'application ».",
                      en: "in Chrome, open the ⋮ menu, then \"Install app\"." },
  install_note:     { fr: "L'app s'ouvre alors en plein écran, comme une vraie application.",
                      en: "It then opens full-screen, like a real app." },
  close:            { fr: "Fermer",                en: "Close" },
  loading:          { fr: "Chargement…",           en: "Loading…" },
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

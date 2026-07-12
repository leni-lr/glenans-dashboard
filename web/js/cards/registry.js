import { mountForecastCard } from "./forecast.js";
import { mountLiveWindCard } from "./livewind.js";
import { mountTideCard } from "./tide.js";
import { mountRocksCard } from "./rocks.js";
import { mountBulletinCard } from "./bulletin.js";
import { mountIsobarCard } from "./isobar.js";

// The single source of truth for which cards exist, their DOM section id, the i18n
// key for their display title (used by the settings page), and their mount fn.
// Order here is the fallback order for users whose saved cardOrder predates a card.
export const CARD_REGISTRY = [
  { key: "forecast", el: "card-forecast", titleKey: "forecast_title", mount: mountForecastCard },
  { key: "livewind", el: "card-livewind", titleKey: "livewind_title", mount: mountLiveWindCard },
  { key: "tide",     el: "card-tide",     titleKey: "tide_title",     mount: mountTideCard },
  { key: "rocks",    el: "card-rocks",    titleKey: "rocks_title",    mount: mountRocksCard },
  { key: "bulletin", el: "card-bulletin", titleKey: "bulletin_title", mount: mountBulletinCard },
  { key: "isobar",   el: "card-isobar",   titleKey: "isobar_title",   mount: mountIsobarCard },
];

export const REGISTRY_KEYS = CARD_REGISTRY.map((c) => c.key);

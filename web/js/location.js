import { STATIONS, STATION_COVERAGE_KM } from "./data/stations.js";
import { PORTS } from "./data/ports.js";
import { BMS_ZONES } from "./data/bmszones.js";
import { nearest, haversineKm } from "./util/geo.js";

// Zone whose nearest coastal point is closest to the location.
function nearestZone(lat, lon, zones) {
  let best = null, bestKm = Infinity;
  for (const z of zones) {
    for (const [plat, plon] of z.points) {
      const km = haversineKm(lat, lon, plat, plon);
      if (km < bestKm) { bestKm = km; best = z; }
    }
  }
  return best;
}

// maree.info's list is Channel + Atlantic only (no Med); beyond this, don't show
// a wildly-distant port.
const TIDE_PORT_MAX_KM = 130;

// Resolve a lat/lon to the nearest live-wind station (within coverage, else null),
// tide port (within range, else null), and bulletin zone.
export function resolveLocation({ lat, lon }) {
  const st = nearest(lat, lon, STATIONS);
  const inCoverage = st && st.km <= STATION_COVERAGE_KM;
  const port = nearest(lat, lon, PORTS);
  const portNear = port && port.km <= TIDE_PORT_MAX_KM;
  const zone = nearestZone(lat, lon, BMS_ZONES);
  return {
    stationNid: inCoverage ? st.item.nid : null,
    stationLabel: inCoverage ? st.item.label : "",
    port: portNear ? port.item.id : null,
    zone: zone ? zone.code : "BMSCOTE-01-04",
  };
}

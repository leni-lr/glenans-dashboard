export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371, d = Math.PI / 180;
  const dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Nearest item (each with .lat/.lon) to a point; returns { item, km }.
export function nearest(lat, lon, items) {
  let best = null, bestKm = Infinity;
  for (const it of items) {
    const km = haversineKm(lat, lon, it.lat, it.lon);
    if (km < bestKm) { bestKm = km; best = it; }
  }
  return best ? { item: best, km: bestKm } : null;
}

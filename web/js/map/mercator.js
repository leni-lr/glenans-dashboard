// Spherical Web-Mercator with 256 px tiles. World pixel space at integer zoom z is
// a (TILE * 2^z) square; (0,0) lon/lat sits at its centre. No DOM.
export const TILE = 256;
export const MAX_LAT = 85.05112878; // latitude limit where Mercator y is finite

export function clampLat(lat) {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export function project(lat, lon, z) {
  const scale = TILE * Math.pow(2, z);
  const x = (lon + 180) / 360 * scale;
  const s = Math.sin(clampLat(lat) * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function unproject(x, y, z) {
  const scale = TILE * Math.pow(2, z);
  const lon = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

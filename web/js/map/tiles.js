import { project, TILE } from "./mercator.js";

export function tileURL(x, y, z) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// Which tiles cover a viewW×viewH viewport centred on (lat,lon) at zoom z, and
// where each sits. `x` is wrapped modulo 2^z for the URL; `left/top` use the
// unwrapped index so the layout stays contiguous across the seam. No vertical wrap.
export function tileGrid(centerLat, centerLon, z, viewW, viewH) {
  const n = Math.pow(2, z);
  const c = project(centerLat, centerLon, z);
  const originX = c.x - viewW / 2;
  const originY = c.y - viewH / 2;

  const x0 = Math.floor(originX / TILE);
  const y0 = Math.floor(originY / TILE);
  const x1 = Math.floor((originX + viewW) / TILE);
  const y1 = Math.floor((originY + viewH) / TILE);

  const tiles = [];
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      tiles.push({ x: wx, y: ty, z, left: tx * TILE - originX, top: ty * TILE - originY });
    }
  }
  return { tiles, centerPx: c };
}

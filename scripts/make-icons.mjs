import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Minimal truecolor-alpha PNG encoder (no deps). draw(x,y,size)->[r,g,b,a].
function png(size, draw) {
  const bpp = 4, stride = size * bpp;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      const o = y * (stride + 1) + 1 + x * bpp;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, truecolor+alpha
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Compass rose (rose des vents), ported from web/icons/icon.svg (120x120 space).
const NAVY = [4, 44, 83, 255], B185 = [24, 95, 165, 255], B378 = [55, 138, 221, 255],
      WHITE = [255, 255, 255, 255], CENTER = [133, 183, 235, 255];
const PT_N = [[60, 20], [68, 60], [60, 53], [52, 60]];
const PT_S = [[60, 100], [68, 60], [60, 67], [52, 60]];
const PT_E = [[100, 60], [60, 68], [67, 60], [60, 52]];
const PT_W = [[20, 60], [60, 68], [53, 60], [60, 52]];
const CORNERS = [[84, 36], [84, 84], [36, 84], [36, 36]];

function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
const hyp = (px, py, cx, cy) => Math.hypot(px - cx, py - cy);

// scale < 1 shrinks the rose into a padded safe-zone (for maskable icons).
function compass(scale) {
  return (x, y, size) => {
    const u = (x / size * 120 - 60) / scale + 60;
    const v = (y / size * 120 - 60) / scale + 60;
    if (hyp(u, v, 60, 60) <= 4) return CENTER;             // centre boss (top)
    if (inPoly(u, v, PT_N)) return WHITE;                  // north point
    if (inPoly(u, v, PT_S)) return B185;                   // south point
    if (inPoly(u, v, PT_E) || inPoly(u, v, PT_W)) return B378; // east/west points
    for (const [cx, cy] of CORNERS) if (hyp(u, v, cx, cy) <= 2.5) return B185;
    if (Math.abs(hyp(u, v, 60, 60) - 42) <= 1.25) return B185; // ring
    return NAVY;                                           // field (full bleed)
  };
}

mkdirSync(new URL("../web/icons/", import.meta.url), { recursive: true });
const out = (name, buf) => writeFileSync(new URL(`../web/icons/${name}`, import.meta.url), buf);
out("icon-192.png", png(192, compass(1)));
out("icon-512.png", png(512, compass(1)));
out("icon-maskable-512.png", png(512, compass(0.8))); // extra safe-zone padding
console.log("icons written: 192, 512, maskable-512 (compass rose)");

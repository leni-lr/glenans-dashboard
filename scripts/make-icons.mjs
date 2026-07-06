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

// Navy #0C447C field; light sail triangle #B5D4F4 within the centre safe-zone.
const NAVY = [12, 68, 124, 255], SAIL = [181, 212, 244, 255];
function scene(pad) {
  return (x, y, size) => {
    const s = size;
    const ax = 0.52 * s, ay = pad * s;            // apex
    const bx = 0.30 * s, by = (1 - pad) * s;      // bottom-left
    const cx = 0.62 * s, cy = (1 - pad) * s;      // bottom-right
    const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = sign(x, y, ax, ay, bx, by);
    const d2 = sign(x, y, bx, by, cx, cy);
    const d3 = sign(x, y, cx, cy, ax, ay);
    const inTri = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    return inTri ? SAIL : NAVY;
  };
}

mkdirSync(new URL("../web/icons/", import.meta.url), { recursive: true });
const out = (name, buf) => writeFileSync(new URL(`../web/icons/${name}`, import.meta.url), buf);
out("icon-192.png", png(192, scene(0.18)));
out("icon-512.png", png(512, scene(0.18)));
out("icon-maskable-512.png", png(512, scene(0.28))); // extra safe-zone padding
console.log("icons written: 192, 512, maskable-512");

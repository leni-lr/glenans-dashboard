import test from "node:test";
import assert from "node:assert/strict";
import { tileURL, tileGrid } from "../js/map/tiles.js";

test("tileURL builds an OSM url", () => {
  assert.equal(tileURL(1, 2, 3), "https://tile.openstreetmap.org/3/1/2.png");
});

test("tileGrid covers a 256x256 viewport centred on (0,0) at z2 with 4 tiles", () => {
  const g = tileGrid(0, 0, 2, 256, 256);
  assert.deepEqual(g.centerPx, { x: 512, y: 512 }); // z2 map is 1024 px, centre 512
  assert.equal(g.tiles.length, 4);
  // every tile x is wrapped into [0, 2^z)
  for (const tl of g.tiles) {
    assert.ok(tl.x >= 0 && tl.x < 4, `x ${tl.x} in range`);
    assert.equal(tl.z, 2);
  }
});

test("tileGrid wraps x across the antimeridian", () => {
  // centred near -179°, a westward tile index (-1) must wrap to 2^z-1
  const g = tileGrid(0, -179, 1, 256, 256);
  for (const tl of g.tiles) assert.ok(tl.x >= 0 && tl.x < 2, `x ${tl.x} wrapped`);
  assert.ok(g.tiles.some((tl) => tl.x === 1), "includes a wrapped western tile");
});

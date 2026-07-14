import test from "node:test";
import assert from "node:assert/strict";
import { TILE, MAX_LAT, clampLat, project, unproject } from "../js/map/mercator.js";

test("project puts (0,0) at the map centre", () => {
  const p = project(0, 0, 1); // z1 map is TILE*2 = 512 px square
  assert.equal(p.x, 256);
  assert.equal(p.y, 256);
});

test("project/unproject round-trip within tolerance", () => {
  for (const [lat, lon, z] of [[47.716, -3.95, 13], [-33.87, 151.21, 10], [60, -120, 6]]) {
    const p = project(lat, lon, z);
    const b = unproject(p.x, p.y, z);
    assert.ok(Math.abs(b.lat - lat) < 1e-6, `lat ${b.lat} ~ ${lat}`);
    assert.ok(Math.abs(b.lon - lon) < 1e-6, `lon ${b.lon} ~ ${lon}`);
  }
});

test("clampLat clamps to the Web-Mercator limit", () => {
  assert.equal(clampLat(90), MAX_LAT);
  assert.equal(clampLat(-90), -MAX_LAT);
  assert.equal(clampLat(45), 45);
  assert.equal(TILE, 256);
});

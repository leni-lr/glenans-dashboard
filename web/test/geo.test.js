import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, nearest } from "../js/util/geo.js";

test("haversineKm is ~0 for the same point and ~sane for a known pair", () => {
  assert.ok(haversineKm(47.7, -4.0, 47.7, -4.0) < 0.001);
  // Drénec (47.718,-4.009) → Concarneau (47.875,-3.919) ≈ 18 km
  assert.ok(Math.abs(haversineKm(47.718, -4.009, 47.875, -3.919) - 18) < 4);
});

test("nearest picks the closest item", () => {
  const items = [
    { id: "a", lat: 48.0, lon: -4.5 },
    { id: "b", lat: 47.72, lon: -4.0 },
    { id: "c", lat: 46.0, lon: -1.0 },
  ];
  const r = nearest(47.716, -3.95, items);
  assert.equal(r.item.id, "b");
  assert.ok(r.km < 6);
});

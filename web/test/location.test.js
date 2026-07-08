import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocation } from "../js/location.js";

test("Penfret/Glénan resolves to Drénec + a South-Brittany zone", () => {
  const r = resolveLocation({ lat: 47.716, lon: -3.95 });
  assert.equal(r.stationNid, 6, "nearest station is Drénec");
  assert.equal(r.zone, "BMSCOTE-01-04", "South-Brittany bulletin zone");
  assert.ok(r.port, "a tide port resolved");
});

test("a far-inland point has no local wind station", () => {
  const r = resolveLocation({ lat: 45.76, lon: 4.83 }); // Lyon
  assert.equal(r.stationNid, null, "no windmorbihan station within coverage");
});

test("a Mediterranean point (Corsica) has no Atlantic tide port, right zone", () => {
  const r = resolveLocation({ lat: 41.74, lon: 9.30 }); // Conca, Corse-du-Sud
  assert.equal(r.port, null, "no maree.info Atlantic port within range");
  assert.equal(r.stationNid, null, "no windmorbihan station");
  assert.equal(r.zone, "BMSCOTE-02-04", "Corsica bulletin zone");
});

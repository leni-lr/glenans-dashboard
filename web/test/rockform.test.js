import test from "node:test";
import assert from "node:assert/strict";
import { newRockId, deriveRock } from "../js/cards/rockform.js";

test("newRockId returns a non-empty unique-ish string", () => {
  const a = newRockId(), b = newRockId();
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("deriveRock builds a rock from name + height + port with an id", () => {
  const rock = deriveRock({ name: "  Basse Jaune  ", height: 0.6, port: "94" });
  assert.equal(rock.name, "Basse Jaune", "name trimmed");
  assert.equal(rock.height, 0.6);
  assert.equal(rock.port, "94");
  assert.ok(rock.id, "has an id");
  assert.equal("lat" in rock, false, "no coord when none given");
});

test("deriveRock carries lat/lon when both are finite", () => {
  const rock = deriveRock({ name: "x", height: 1, port: "94", lat: 47.7, lon: -3.9 });
  assert.equal(rock.lat, 47.7);
  assert.equal(rock.lon, -3.9);
  const noCoord = deriveRock({ name: "x", height: 1, port: "94", lat: NaN, lon: -3.9 });
  assert.equal("lat" in noCoord, false, "partial/NaN coord dropped");
});

import test from "node:test";
import assert from "node:assert/strict";
import { newRockId, deriveRock } from "../js/cards/rockform.js";

test("newRockId returns a non-empty unique-ish string", () => {
  const a = newRockId(), b = newRockId();
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("deriveRock fills id + zone and derives nearest port when omitted", () => {
  const rock = deriveRock({ name: "Basse Jaune", lat: 47.72, lon: -3.94, height: 0.6 });
  assert.equal(rock.name, "Basse Jaune");
  assert.equal(rock.height, 0.6);
  assert.ok(rock.id, "has an id");
  assert.ok(rock.zone, "has a zone code");
  assert.equal(rock.port, "94", "nearest port to the Glénan is Penfret (94)");
});

test("deriveRock keeps an explicit port override", () => {
  const rock = deriveRock({ name: "x", lat: 47.6, lon: -2.8, height: 1, port: "107" });
  assert.equal(rock.port, "107", "override wins over nearest");
});

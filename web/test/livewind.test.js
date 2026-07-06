import test from "node:test";
import assert from "node:assert/strict";
import { minutesAgo } from "../js/util/time.js";

const NOW = 1_000_000_000_000; // fixed clock (ms)

test("minutesAgo rounds elapsed whole minutes", () => {
  assert.equal(minutesAgo(NOW / 1000 - 120, NOW), 2);
  assert.equal(minutesAgo(NOW / 1000 - 20, NOW), 0);
});

test("minutesAgo never returns negative for a future timestamp", () => {
  assert.equal(minutesAgo(NOW / 1000 + 300, NOW), 0);
});

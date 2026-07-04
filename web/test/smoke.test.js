import test from "node:test";
import assert from "node:assert/strict";
import { ok } from "../js/smoke.js";

test("test harness runs ESM modules", () => {
  assert.equal(ok(), true);
});

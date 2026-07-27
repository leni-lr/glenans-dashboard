import test from "node:test";
import assert from "node:assert/strict";
import { rockPill } from "../js/cards/rocks.js";

test("rockPill states passage and when it ends", () => {
  const html = rockPill("fr", { safe: true, crossingTh: 12.4 });
  assert.ok(html.includes("passe jusqu'à 12h24"));
  assert.ok(html.includes("rock-pill--clear"));
});

test("rockPill says passe pas, not découvert", () => {
  const html = rockPill("fr", { safe: false, crossingTh: 14.6 });
  assert.ok(html.includes("passe pas jusqu'à 14h36"));
  assert.ok(!html.includes("découvert"), "the rock drying is not the question");
  assert.ok(html.includes("rock-pill--foul"));
});

test("rockPill drops the clock when the state holds all day", () => {
  assert.ok(rockPill("fr", { safe: true, crossingTh: null }).includes(">passe<"));
  assert.ok(rockPill("fr", { safe: false, crossingTh: null }).includes(">passe pas<"));
});

test("rockPill translates to English", () => {
  assert.ok(rockPill("en", { safe: true, crossingTh: 12.4 }).includes("clear until 12h24"));
  assert.ok(rockPill("en", { safe: false, crossingTh: null }).includes(">no-go<"));
});

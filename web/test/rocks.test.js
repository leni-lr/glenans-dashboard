import test from "node:test";
import assert from "node:assert/strict";
import { rockPill, draftLabel } from "../js/cards/rocks.js";

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

test("draftLabel uses a decimal comma in French and a point in English", () => {
  assert.equal(draftLabel("fr", 1.5), "1,5 m");
  assert.equal(draftLabel("en", 1.5), "1.5 m");
  assert.equal(draftLabel("fr", 2), "2,0 m");
});

test("draftLabel survives a corrupt stored value", () => {
  assert.equal(draftLabel("fr", undefined), "0,0 m");
  assert.equal(draftLabel("fr", "abc"), "0,0 m");
});

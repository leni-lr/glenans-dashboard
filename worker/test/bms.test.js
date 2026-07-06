import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBMS, bmsDomain, bmsURL, rot13, tokenFromSetCookie } from "../src/bms.js";

const xml = readFileSync(new URL("./fixtures/bms-sample.xml", import.meta.url), "utf8");

test("parseBMS extracts title + situation", () => {
  const b = parseBMS(xml);
  assert.match(b.title, /Penmarc'h/);
  assert.match(b.situation, /Anticyclone 1028 hPa/);
});

test("parseBMS flags no warning when bulletinSpecial says 'Pas d'avis'", () => {
  assert.equal(parseBMS(xml).warning, false);
  assert.match(parseBMS(xml).special, /Pas d'avis/);
});

test("parseBMS flags a warning when bulletinSpecial is anything else", () => {
  const active = xml.replace("Pas d'avis de vent fort en cours ni prévu. ",
    "Avis de coup de vent en cours.");
  assert.equal(parseBMS(active).warning, true);
});

test("parseBMS throws when the document has no title and no situation", () => {
  assert.throws(() => parseBMS("<bulletin></bulletin>"));
});

test("parseBMS extracts forecast échéances with vent + mer", () => {
  const b = parseBMS(xml);
  assert.ok(b.forecasts.length >= 1, "at least one forecast");
  const f = b.forecasts[0];
  assert.match(f.title, /Prévisions pour la journée/);
  assert.match(f.vent, /VENT/);
  assert.match(f.mer, /MER/);
});

test("bmsDomain maps the page zone BMS→BMR", () => {
  assert.equal(bmsDomain("BMSCOTE-01-04"), "BMRCOTE-01-04");
});

test("bmsURL builds the rwg report URL", () => {
  assert.equal(bmsURL("BMSCOTE-01-04"),
    "https://rwg.meteofrance.com/internet2018client/2.0/report?domain=BMRCOTE-01-04&report_type=marine&report_subtype=BMR_cote_fr&format=xml");
});

test("rot13 is symmetric and touches only letters", () => {
  assert.equal(rot13("eyJ0-_.9"), "rlW0-_.9");
  assert.equal(rot13(rot13("Hello, World 123")), "Hello, World 123");
});

test("tokenFromSetCookie ROT13-decodes the mfsession cookie into a JWT", () => {
  // 'eyJ' ROT13-encodes to 'rlW'
  const sc = "mfsession=rlW0abc.def-ghi; Path=/; Max-Age=3600; SameSite=None; Secure";
  const tok = tokenFromSetCookie(sc);
  assert.ok(tok.startsWith("eyJ0"), "decodes to a JWT-looking token");
});

test("tokenFromSetCookie returns null when no mfsession cookie is present", () => {
  assert.equal(tokenFromSetCookie("othercookie=x; Path=/"), null);
  assert.equal(tokenFromSetCookie(""), null);
});

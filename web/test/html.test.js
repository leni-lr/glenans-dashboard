import test from "node:test";
import assert from "node:assert/strict";
import { escapeHTML } from "../js/util/html.js";

test("escapeHTML neutralises HTML metacharacters", () => {
  assert.equal(escapeHTML(`<b>"x"&'y'</b>`), "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
});
test("escapeHTML coerces non-strings", () => {
  assert.equal(escapeHTML(72), "72");
});

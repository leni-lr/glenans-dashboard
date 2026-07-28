import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");

// The declarations inside one selector's { ... } block.
function block(selector) {
  const i = css.indexOf(selector);
  assert.ok(i > -1, `${selector} block found`);
  const start = css.indexOf("{", i);
  return css.slice(start, css.indexOf("}", start));
}

function token(blk, name) {
  const m = blk.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`));
  assert.ok(m, `--${name} defined`);
  return m[1].toLowerCase();
}

const THEMES = [[":root {", "light"], [':root[data-theme="dark"]', "dark"]];

test("no comparison-model colour collides with the measured-wind green", () => {
  for (const [sel, name] of THEMES) {
    const blk = block(sel);
    const now = token(blk, "now");
    for (let i = 0; i < 6; i++) {
      assert.notEqual(token(blk, `cmp-${i}`), now,
        `${name}: --cmp-${i} must differ from --now (the measured curve reuses --now)`);
    }
  }
});

test("the six comparison-model colours are all distinct", () => {
  for (const [sel, name] of THEMES) {
    const blk = block(sel);
    const vals = Array.from({ length: 6 }, (_, i) => token(blk, `cmp-${i}`));
    assert.equal(new Set(vals).size, 6, `${name}: cmp-0..5 all distinct, got ${vals.join(" ")}`);
  }
});

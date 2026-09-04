// tests/homeStats.test.mjs
// Estadísticas del Home V2 (2026-09-03). node --test; sin framework.
import test from "node:test";
import assert from "node:assert/strict";
import { bandOf, regimeAge, range7, pushes } from "../lib/homeStats.js";

test("bandOf: usa band del front-matter y cae a riskBand(score)", () => {
  assert.equal(bandOf({ score: 57, band: "CONSTRUCTIVE" }), "CONSTRUCTIVE");
  assert.equal(bandOf({ score: 57 }), "CONSTRUCTIVE");   // corte ≤67
  assert.equal(bandOf({ score: 20 }), "RISK-OFF");       // corte ≤32
  assert.equal(bandOf({ score: "no" }), null);
  assert.equal(bandOf({}), null);
});

test("regimeAge: cuenta views consecutivos en la banda del más reciente", () => {
  const posts = [
    { score: 57, band: "CONSTRUCTIVE" },
    { score: 53 },                       // sin band → riskBand(53) = CONSTRUCTIVE
    { score: 60, band: "CONSTRUCTIVE" },
    { score: 45, band: "DEFENSIVE" },
    { score: 58, band: "CONSTRUCTIVE" }, // ya no cuenta: hubo un DEFENSIVE antes
  ];
  assert.equal(regimeAge(posts), 3);
  assert.equal(regimeAge([]), 0);
  assert.equal(regimeAge([{ score: 45, band: "DEFENSIVE" }]), 1);
});

test("range7: min/max de los 7 más recientes, null si n<3", () => {
  const posts = [57, 53, 60, 45, 58, 49, 62, 99, 1].map((score) => ({ score }));
  assert.deepEqual(range7(posts), { min: 45, max: 62, n: 7 });
  assert.equal(range7([{ score: 57 }, { score: 53 }]), null);
  assert.deepEqual(range7([{ score: 57 }, { score: "x" }, { score: 53 }, { score: 60 }]), { min: 53, max: 60, n: 3 });
});

test("pushes: w·(sub−50)/Σw y la suma es score−50", () => {
  const breakdown = [
    { label: "VIX", sub: 64, w: 20 },
    { label: "USD/MXN", sub: 44, w: 18 },
    { label: "Oro", sub: 9, w: 5 },
  ];
  const out = pushes(breakdown);
  const wsum = 43;
  assert.equal(out.length, 3);
  assert.equal(out[0].label, "VIX");
  assert.ok(Math.abs(out[0].push - (20 * 14) / wsum) < 1e-9);
  assert.ok(Math.abs(out[1].push - (18 * -6) / wsum) < 1e-9);
  const score = (64 * 20 + 44 * 18 + 9 * 5) / wsum;
  const sum = out.reduce((a, r) => a + r.push, 0);
  assert.ok(Math.abs(sum - (score - 50)) < 1e-9);
});

test("pushes: señal sin dato → push null y fuera de Σw", () => {
  const out = pushes([
    { label: "VIX", sub: 70, w: 20 },
    { label: "Carry", sub: null, w: 10 },
  ]);
  assert.equal(out[1].push, null);
  assert.ok(Math.abs(out[0].push - 20) < 1e-9); // 20·20/20 = 20
  assert.deepEqual(pushes(null), []);
});

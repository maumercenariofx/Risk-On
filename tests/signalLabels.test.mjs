// tests/signalLabels.test.mjs
// Mapa de presentación de labels de señal (2026-09-11). node --test; sin framework.
import test from "node:test";
import assert from "node:assert/strict";
import { signalLabel } from "../lib/signalLabels.js";

test("signalLabel: EN traduce Oro y Curva 2s10s; ES y labels neutros pasan tal cual", () => {
  assert.equal(signalLabel("Oro", "en"), "Gold");
  assert.equal(signalLabel("Curva 2s10s", "en"), "2s10s curve");
  assert.equal(signalLabel("Oro (cobertura, inverso)", "en"), "Gold (hedge, inverse)"); // view 2026-06-17
  assert.equal(signalLabel("Oro", "es"), "Oro");
  assert.equal(signalLabel("VIX", "en"), "VIX");
  assert.equal(signalLabel("algo nuevo", "en"), "algo nuevo");
});

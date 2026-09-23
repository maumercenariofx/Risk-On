// tests/portafolioLive.test.mjs
// Marca a mercado en vivo del portafolio simulado (2026-09-23). node --test.
import test from "node:test";
import assert from "node:assert/strict";
import { marcarEnVivo, vencida } from "../lib/portafolioLive.js";

// Recorte real del portafolio.json del 2026-09-23 (spot del bot: 17.4527).
const data = {
  regla: { capital: 1_000_000, carry_pct: 2.87 },
  resumen: { pnl_cerrado: 26478, valor: 1029866 },
  abiertas: [
    { slug: "2026-09-16", bias: "pro-dolar", S0: 17.1285, vence: "2026-09-23", capital: 204048.31, pnl: 3748.25, stop: null },
    { slug: "2026-09-18", bias: "pro-peso",  S0: 17.1796, vence: "2026-09-25", capital: 206161.05, pnl: -3195,   stop: null },
    { slug: "2026-09-19", bias: "pro-peso",  S0: 17.20,   vence: "2026-09-26", capital: 200000,    pnl: 0,       stop: "2026-09-22" },
    { slug: "2026-09-22", bias: "neutral",   S0: 17.2415, vence: "2026-09-29", capital: 189790,    pnl: 0,       stop: null },
  ],
  mensual: [{ mes: "2026-08", pnl: 22366, ret_pct: 2.24 }, { mes: "2026-09", pnl: 4850, ret_pct: 0.47 }],
  daily: [{ d: "2026-09-22", v: 1027368, px: 17.2415 }],
};

test("marcarEnVivo reproduce la fórmula del bot con el mismo spot", () => {
  // Antes de las 7:00 CDMX del 23: el tramo del 16 sigue abierto.
  const live = marcarEnVivo(data, { px: 17.4527, ts: "2026-09-23T12:54:51Z" });
  const t16 = live.abiertas[0], t18 = live.abiertas[1];
  assert.ok(Math.abs(t16.pnl - 3748.25) < 1, `t16 ${t16.pnl}`);
  assert.ok(Math.abs(t18.pnl - -3195) < 1, `t18 ${t18.pnl}`);
  assert.equal(t16.vivo, true);
});

test("vencidas, con stop y neutrales no se re-marcan", () => {
  // Después de las 7:00 CDMX (13:00Z) del 23: el tramo del 16 ya salió.
  const live = marcarEnVivo(data, { px: 18.0, ts: "2026-09-23T15:00:00Z" });
  assert.equal(live.abiertas[0].pnl, 3748.25);
  assert.equal(live.abiertas[0].vivo, false);
  assert.equal(live.abiertas[2].pnl, 0);       // stop → en caja
  assert.equal(live.abiertas[2].vivo, false);
  assert.equal(live.abiertas[3].pnl, 0);       // neutral: vivo pero sin dirección
  assert.equal(live.abiertas[3].vivo, true);
  // El pro-peso del 18 sí se mueve con el spot a 18.0 (pierde).
  assert.ok(live.abiertas[1].pnl < -9000, `t18 ${live.abiertas[1].pnl}`);
  assert.equal(vencida({ vence: "2026-09-23" }, Date.parse("2026-09-23T12:59:00Z")), false);
  assert.equal(vencida({ vence: "2026-09-23" }, Date.parse("2026-09-23T13:00:00Z")), true);
});

test("valor, pnl y la fila del mes en curso salen del mismo número", () => {
  const live = marcarEnVivo(data, { px: 17.4527, ts: "2026-09-23T12:54:51Z" });
  const suma = live.abiertas.reduce((a, x) => a + x.pnl, 0);
  assert.equal(live.valor, Math.round(1_000_000 + 26478 + suma));
  assert.equal(live.pnl, live.valor - 1_000_000);
  assert.equal(live.ret_pct, +((100 * live.pnl) / 1_000_000).toFixed(2));
  const sep = live.mensual.find((m) => m.mes === "2026-09");
  assert.equal(sep.pnl, live.valor - (1027368 - 4850));
  assert.equal(live.mensual[0].pnl, 22366); // meses cerrados intactos
  assert.deepEqual(live.punto, { d: "2026-09-23", v: live.valor, px: 17.4527, live: true });
});

test("si el spot cambió de mes, la fila 'en curso' no se toca", () => {
  const live = marcarEnVivo(data, { px: 17.4527, ts: "2026-10-01T12:00:00Z" });
  assert.equal(live.mensual[1].pnl, 4850);
});

test("spot inválido → null (la UI se queda con el JSON)", () => {
  assert.equal(marcarEnVivo(data, { px: 0, ts: "2026-09-23T12:00:00Z" }), null);
  assert.equal(marcarEnVivo(data, { px: "x", ts: "2026-09-23T12:00:00Z" }), null);
  assert.equal(marcarEnVivo(data, null), null);
});

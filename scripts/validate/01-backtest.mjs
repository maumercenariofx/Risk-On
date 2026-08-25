// scripts/validate/01-backtest.mjs
// Prueba 1 del marco: full backtest. Esperanza, Sharpe, Sortino, Calmar,
// profit factor, hit rate y max drawdown de cada regla publicada, SIEMPRE
// contra el benchmark ingenuo.
//
// Umbral de aprobado (declarado antes de mirar el resultado):
//   · Sharpe ≥ 0.5 Y ≥ Sharpe del benchmark + 0.3
//   · Profit factor ≥ 1.25
//   · Cualquier regla que no supere al benchmark se retira del prior.
//
// Uso:  node scripts/validate/01-backtest.mjs

import { loadHistory, forwardReturns, stretchSeries, RULES, evaluate, metrics, fmt, pct } from "./lib.mjs";

const rows = loadHistory();
const ctx = { stretch: stretchSeries(rows), fwd: forwardReturns(rows, 5) };
console.log(`\nMuestra: ${rows.length} días · ${rows[0].date} → ${rows[rows.length - 1].date}\n`);

const CASOS = [
  ["Siempre pro-peso (benchmark)", RULES.base()],
  ["Banda extrema", RULES.banda()],
  ["Estiramiento > 1", RULES.estiramiento({ th: 1 })],
  ["Estiramiento > 0.5", RULES.estiramiento({ th: 0.5 })],
  ["Híbrida (banda + estiramiento)", RULES.hibrida()],
];

const res = CASOS.map(([nombre, rule]) => [nombre, metrics(evaluate(rows, rule, { ctx }))]);
const base = res[0][1];

console.log("regla                            n     hit%    ret medio  Sharpe  Sortino    PF   maxDD   Calmar");
console.log("─".repeat(103));
for (const [nombre, m] of res) {
  console.log(
    nombre.padEnd(32) +
    String(m.n).padStart(5) +
    pct(m.hit).padStart(8) +
    (fmt(m.mediaRet, 3) + "%").padStart(11) +
    fmt(m.sharpe).padStart(8) +
    fmt(m.sortino).padStart(9) +
    fmt(m.profitFactor).padStart(6) +
    fmt(m.maxDD, 1).padStart(8) +
    fmt(m.calmar).padStart(9)
  );
}

console.log("\nVEREDICTO (umbrales fijados de antemano):");
for (const [nombre, m] of res.slice(1)) {
  const c1 = m.sharpe >= 0.5;
  const c2 = m.sharpe >= base.sharpe + 0.3;
  const c3 = m.profitFactor >= 1.25;
  const ok = c1 && c2 && c3;
  console.log(
    `  ${ok ? "PASA  " : "FALLA "} ${nombre.padEnd(32)} ` +
    `Sharpe≥0.5 ${c1 ? "✓" : "✗"} · supera benchmark+0.3 ${c2 ? "✓" : "✗"} (${fmt(m.sharpe)} vs ${fmt(base.sharpe + 0.3)}) · PF≥1.25 ${c3 ? "✓" : "✗"}`
  );
}
console.log();

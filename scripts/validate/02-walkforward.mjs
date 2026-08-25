// scripts/validate/02-walkforward.mjs
// Prueba 2 del marco: walk-forward RODANTE con purga y embargo.
//
// Es la prueba que detecta sobreajuste, y hasta el 2026-08-24 era IMPOSIBLE de
// correr: con 5 años de historia y ventanas de IS=4a/OOS=1a salían cero
// ventanas. Con la serie extendida a 2005 salen 17.
//
// Ventanas RODANTES, no ancladas: el USD/MXN cambia de régimen con el
// diferencial TIIE-Fed, y una ventana anclada dejaría que 2008 siguiera
// pesando en la optimización de 2025.
//
// PURGA de 5 días: la etiqueta es el retorno a 5 días hábiles, así que las
// últimas 5 observaciones del IS tienen su resultado DENTRO del OOS.
// EMBARGO de 10 días adicionales: las features usan ventanas de 20 (MA) y 21
// (vol), así que la dependencia va más allá del horizonte de la etiqueta.
//
// Umbral (fijado antes de mirar):
//   WFE > 70% excelente · 50-70% aceptable · < 50% RECHAZAR
//   y el hit OOS debe superar la base pro-peso DEL MISMO TRAMO OOS.
//
// Uso:  node scripts/validate/02-walkforward.mjs

import { loadHistory, forwardReturns, stretchSeries, RULES, evaluate, metrics, fmt, pct, mean } from "./lib.mjs";

const HORIZON = 5;
const PURGE = 5;    // horizonte de la etiqueta
const EMBARGO = 10; // ventanas de features (MA20, vol21)
const IS_LEN = 4 * 252;
const OOS_LEN = 252;

const rows = loadHistory();
const ctx = { stretch: stretchSeries(rows), fwd: forwardReturns(rows, HORIZON) };

// Espacio de búsqueda que se re-optimiza en cada IS. Son los parámetros que
// HOY están fijos en producción por calibración full-sample — justo los que
// F2/F3 de la auditoría señalaron como in-sample.
const GRID = [];
for (const off of [26, 29, 32, 35, 38]) {
  for (const on of [61, 64, 67, 70, 73]) {
    for (const th of [0.5, 0.75, 1.0, 1.25, 1.5]) {
      GRID.push({ off, on, th });
    }
  }
}

const scoreOf = (m) => (m && isFinite(m.sharpe) ? m.sharpe : -Infinity);

console.log(`\nMuestra: ${rows.length} días · ${rows[0].date} → ${rows[rows.length - 1].date}`);
console.log(`Rejilla de reoptimización: ${GRID.length} configuraciones por ventana`);
console.log(`IS ${IS_LEN}d · OOS ${OOS_LEN}d · purga ${PURGE}d · embargo ${EMBARGO}d\n`);

const ventanas = [];
for (let start = 0; start + IS_LEN + EMBARGO + OOS_LEN <= rows.length; start += OOS_LEN) {
  const isFrom = start;
  const isTo = start + IS_LEN - PURGE;              // purga al final del IS
  const oosFrom = start + IS_LEN + EMBARGO;         // embargo antes del OOS
  const oosTo = Math.min(oosFrom + OOS_LEN, rows.length);

  // Optimizar EN EL IS.
  let best = null;
  for (const g of GRID) {
    const m = metrics(evaluate(rows, RULES.hibrida(g), { ctx, from: isFrom, to: isTo }), { horizon: HORIZON });
    if (!best || scoreOf(m) > scoreOf(best.m)) best = { g, m };
  }

  // Aplicar EN EL OOS, sin volver a mirar.
  const oosTrades = evaluate(rows, RULES.hibrida(best.g), { ctx, from: oosFrom, to: oosTo });
  const oos = metrics(oosTrades, { horizon: HORIZON });
  const baseOos = metrics(evaluate(rows, RULES.base(), { ctx, from: oosFrom, to: oosTo }), { horizon: HORIZON });

  ventanas.push({
    isDesde: rows[isFrom].date, isHasta: rows[isTo - 1].date,
    oosDesde: rows[oosFrom].date, oosHasta: rows[oosTo - 1].date,
    g: best.g, sharpeIS: best.m.sharpe, oos, baseOos, trades: oosTrades,
  });
}

console.log("ventana  IS                       OOS                      params(off/on/th)  SharpeIS  SharpeOOS   hitOOS   base");
console.log("─".repeat(120));
ventanas.forEach((v, i) => {
  console.log(
    String(i + 1).padStart(5) + "  " +
    `${v.isDesde}→${v.isHasta}`.padEnd(24) +
    `${v.oosDesde}→${v.oosHasta}`.padEnd(24) +
    `${v.g.off}/${v.g.on}/${v.g.th}`.padEnd(19) +
    fmt(v.sharpeIS).padStart(8) +
    fmt(v.oos.sharpe).padStart(11) +
    pct(v.oos.hit).padStart(9) +
    pct(v.baseOos.hit).padStart(8)
  );
});

// Curva OOS concatenada: SOLO los tramos out-of-sample, que es el punto.
const todos = ventanas.flatMap((v) => v.trades);
const oosTotal = metrics(todos, { horizon: HORIZON });
const sharpeISmedio = mean(ventanas.map((v) => v.sharpeIS).filter(isFinite));
const wfe = sharpeISmedio ? (oosTotal.sharpe / sharpeISmedio) * 100 : null;

console.log("\n── OOS CONCATENADO (la única curva que cuenta) ──");
console.log(`  operaciones      ${oosTotal.n}`);
console.log(`  hit rate         ${pct(oosTotal.hit)}`);
console.log(`  retorno medio    ${fmt(oosTotal.mediaRet, 3)}%`);
console.log(`  Sharpe OOS       ${fmt(oosTotal.sharpe)}`);
console.log(`  Sharpe IS medio  ${fmt(sharpeISmedio)}`);
console.log(`  profit factor    ${fmt(oosTotal.profitFactor)}`);
console.log(`  max drawdown     ${fmt(oosTotal.maxDD, 1)}`);

console.log(`\n  WFE = SharpeOOS / SharpeIS medio = ${fmt(wfe, 1)}%`);
// GUARDA CONTRA LA PROPIA MÉTRICA. El WFE es un COCIENTE de Sharpes: cuando
// el denominador ronda cero, un OOS igual de nulo produce un WFE altísimo y el
// marco lo etiquetaría "EXCELENTE". Eso no dice que la regla generalice — dice
// que no había nada que sobreajustar. Con |SharpeIS| por debajo de 0.3 el WFE
// es ruido dividido entre ruido y se reporta como tal.
const SHARPE_MIN = 0.3;
let veredicto;
if (wfe == null || !isFinite(wfe)) {
  veredicto = "INDETERMINADO";
} else if (Math.abs(sharpeISmedio) < SHARPE_MIN) {
  veredicto = `NO INTERPRETABLE — el Sharpe IS medio (${fmt(sharpeISmedio)}) no llega a ${SHARPE_MIN}: ` +
    "no hay edge in-sample que generalizar, así que un WFE alto solo significa " +
    "que ni siquiera hubo sobreajuste. Lo que manda aquí es el Sharpe OOS.";
} else {
  veredicto = wfe > 70 ? "EXCELENTE" : wfe >= 50 ? "ACEPTABLE" : "RECHAZAR";
}
console.log(`  VEREDICTO: ${veredicto}`);
console.log(`  Sharpe OOS absoluto: ${fmt(oosTotal.sharpe)} — el número que de verdad decide.`);

const ganaBase = ventanas.filter((v) => v.oos.hit > v.baseOos.hit).length;
console.log(`\n  Ventanas donde el OOS supera a "siempre pro-peso" del mismo tramo: ${ganaBase}/${ventanas.length}`);

// Estabilidad de los parámetros elegidos: si cada ventana elige algo distinto,
// no hay un óptimo estable que aprender — hay ruido.
const combos = new Map();
for (const v of ventanas) {
  const k = `${v.g.off}/${v.g.on}/${v.g.th}`;
  combos.set(k, (combos.get(k) ?? 0) + 1);
}
console.log(`\n  Configuraciones distintas elegidas: ${combos.size} en ${ventanas.length} ventanas`);
console.log("  " + [...combos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join("  "));
console.log();

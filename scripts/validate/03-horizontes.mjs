// scripts/validate/03-horizontes.mjs
// ¿Y si cada señal opera en SU horizonte? Idea de Mauricio (2026-08-24), y es
// buena por una razón real: el IC del score y el del estiramiento no solo
// difieren en tamaño, difieren en HORIZONTE. Si el score anticipa a 1 día y el
// estiramiento revierte a 5, forzarlos al mismo horizonte los destruye a los dos.
//
// Aquí se prueba de verdad, no se argumenta:
//   A) score solo, horizonte 1 día
//   B) estiramiento solo, horizonte 5 días
//   C) las dos combinadas, cada una en su horizonte
//   contra el benchmark en cada horizonte.
//
// Y con FRICCIÓN, que a 1 día es la mitad del problema: cinco veces más
// operaciones significa cinco veces más spread pagado.
//
// Uso:  node scripts/validate/03-horizontes.mjs

import {
  loadHistory, forwardReturns, stretchSeries, RULES, evaluate, metrics,
  mean, fmt, pct,
} from "./lib.mjs";

// 2 centavos de spread ida y vuelta sobre un spot medio de ~15: el mismo
// supuesto que publica /indice, para que backtest y sitio hablen igual.
const FRICCION = (100 * 0.02) / 15;

const rows = loadHistory();
const stretch = stretchSeries(rows);
const idx = (d) => rows.findIndex((r) => r.date >= d);
const last = (d) => rows.findLastIndex((r) => r.date <= d) + 1;

// Regla del score en su propio horizonte. Score alto = apetito de riesgo =
// peso fuerte, así que score alto → pro-peso. Umbral simétrico alrededor de 50.
const reglaScore = ({ th = 8 } = {}) => (r) =>
  r.score >= 50 + th ? "pro-peso" : r.score <= 50 - th ? "pro-dolar" : "neutral";

// Combinada: cada señal vota en SU horizonte y se opera solo cuando coinciden.
// Es la lectura literal de la idea — no un promedio, una confirmación.
function combinada({ thS = 8, thE = 1 } = {}) {
  return (r, i, ctx) => {
    const vScore = r.score >= 50 + thS ? "pro-peso" : r.score <= 50 - thS ? "pro-dolar" : null;
    const s = ctx.stretch[i];
    const vEstira = s == null ? null : s > thE ? "pro-peso" : s < -thE ? "pro-dolar" : null;
    if (vScore && vEstira && vScore === vEstira) return vScore;
    return "neutral"; // sin confirmación, no se opera
  };
}

function corre(nombre, rule, h, from, to) {
  const ctx = { stretch, fwd: forwardReturns(rows, h) };
  const trades = evaluate(rows, rule, { ctx, horizon: h, from, to }).filter((t) => t.bias !== "neutral");
  if (!trades.length) return { nombre, h, n: 0 };
  const m = metrics(trades, { horizon: h });
  const netos = trades.map((t) => t.ret - FRICCION);
  const mNeto = mean(netos);
  return { nombre, h, ...m, mediaNeta: mNeto, opsPorAno: (trades.length / rows.length) * 252 };
}

function tabla(titulo, from, to) {
  console.log(`\n══ ${titulo} · ${rows[from].date} → ${rows[to - 1].date} ══`);
  console.log("estrategia                     h      n   ops/año   hit%   ret medio   neto/op  Sharpe");
  console.log("─".repeat(90));
  const casos = [
    ["Benchmark pro-peso @1d", RULES.base(), 1],
    ["Benchmark pro-peso @5d", RULES.base(), 5],
    ["A · Score @1d", reglaScore(), 1],
    ["B · Estiramiento @5d", RULES.estiramiento({ th: 1 }), 5],
    ["C · Combinada @1d", combinada(), 1],
    ["C · Combinada @5d", combinada(), 5],
  ];
  const out = [];
  for (const [nm, rule, h] of casos) {
    const r = corre(nm, rule, h, from, to);
    out.push(r);
    if (!r.n) { console.log(nm.padEnd(30) + String(h).padStart(2) + "      0   (sin operaciones)"); continue; }
    console.log(
      nm.padEnd(30) + String(r.h).padStart(2) + String(r.n).padStart(7) +
      fmt(r.opsPorAno, 0).padStart(10) + pct(r.hit).padStart(8) +
      (fmt(r.mediaRet, 3) + "%").padStart(12) + (fmt(r.mediaNeta, 3) + "%").padStart(10) +
      fmt(r.sharpe).padStart(8)
    );
  }
  return out;
}

console.log(`\nFricción aplicada: ${fmt(FRICCION, 3)}% por operación (2 centavos ida y vuelta).`);
console.log("A 1 día se opera ~5 veces más, así que la fricción pesa ~5 veces más.");

tabla("LOS 17 AÑOS PREVIOS (fuera de la muestra que originó las reglas)", idx("2005-01-01"), last("2021-11-30"));
tabla("EL TRAMO DE 5 AÑOS (donde se calibraron las reglas)", idx("2021-12-01"), last("2026-12-31"));
const todo = tabla("21 AÑOS COMPLETOS", idx("2005-01-01"), last("2026-12-31"));

console.log("\n── LECTURA ──");
const comb1 = todo.find((r) => r.nombre === "C · Combinada @1d");
const comb5 = todo.find((r) => r.nombre === "C · Combinada @5d");
for (const c of [comb1, comb5].filter((x) => x && x.n)) {
  const vivo = c.mediaNeta > 0;
  console.log(
    `  Combinada @${c.h}d: ${c.n} ops · bruto ${fmt(c.mediaRet, 3)}% · neto ${fmt(c.mediaNeta, 3)}% → ` +
    (vivo ? "sobrevive a la fricción" : "LA FRICCIÓN SE LO COME")
  );
}
console.log();

// scripts/backtest-ledger-ejecucion.mjs
// Backtest de las posturas YA PUBLICADAS (content/*.md → postura_bias) con una
// regla de ejecución explícita, y portafolio simulado de 1 MDP (2026-09-21).
//
// REGLA DE EJECUCIÓN PROPUESTA
//   · Entrada: 7:00 CDMX (13:00 UTC) del día de publicación t — la apertura de
//     la vela horaria de Yahoo MXN=X que empieza a las 13:00 UTC. Es el primer
//     instante en que un lector puede actuar.
//   · Salida: 7:00 CDMX del 5º día hábil posterior (t+5). Es el mismo instante
//     en que se publica el view de t+5, así que el tramo que vence se cierra y
//     se reabre con la postura nueva sin hueco. Si la nueva postura es del
//     mismo lado, no se opera nada (costo cero).
//   · Contraste: la convención del marcador (cierre de t → cierre de t+5).
//
// El marcador público NO cambia: esto es un ejercicio de P&L, no un veredicto.
// Carry: Banxico − Fed constante = CARRY (último valor de history.csv); es una
// SUPOSICIÓN, no la curva diaria real.
//
// Uso:  node scripts/backtest-ledger-ejecucion.mjs

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const H = 5;
const CAPITAL = 1_000_000;
const COSTO_RT = 0.02; // %
const CARRY = 2.87; // % anual, Banxico − Fed (history.csv, 2026-08-21)
const HORA_UTC = 13; // 7:00 CDMX

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahoo(interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/MXN=X?range=${range}&interval=${interval}`;
  const r = (await (await fetch(url, { headers: { "User-Agent": UA } })).json()).chart.result[0];
  const q = r.indicators.quote[0];
  return r.timestamp.map((ts, i) => ({ ts, open: q.open[i], close: q.close[i], off: r.meta.gmtoffset }))
    .filter((b) => b.open != null && b.close != null);
}

const posturas = readdirSync("content")
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .map((f) => ({ slug: f.slice(0, 10), ...matter(readFileSync(path.join("content", f), "utf8")).data }))
  .filter((p) => p.postura_bias)
  .sort((a, b) => (a.slug < b.slug ? -1 : 1));

const horas = await yahoo("60m", "1y");
const diarias = await yahoo("1d", "1y");

// Precio a las 7:00 CDMX de cada fecha (UTC): apertura de la vela de 13:00 UTC.
const p7 = {};
for (const b of horas) {
  const d = new Date(b.ts * 1000);
  if (d.getUTCHours() === HORA_UTC) p7[d.toISOString().slice(0, 10)] = b.open;
}
// Cierre diario con el mismo tratamiento de gmtoffset que update-ledger.mjs.
const cierre = {};
for (const b of diarias) cierre[new Date((b.ts + b.off) * 1000).toISOString().slice(0, 10)] = b.close;
const habiles = Object.keys(p7).filter((d) => ![0, 6].includes(new Date(d).getUTCDay())).sort();
const habilesC = Object.keys(cierre).sort();

const sign = (b) => (b === "pro-peso" ? -1 : b === "pro-dolar" ? 1 : 0);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

function evalua(modo) {
  const out = [];
  for (const p of posturas) {
    const cal = modo === "7am" ? habiles : habilesC;
    const px = modo === "7am" ? p7 : cierre;
    const i = cal.indexOf(p.slug);
    if (i === -1 || i + H >= cal.length) { out.push({ ...p, abierta: true }); continue; }
    const S0 = px[cal[i]], S1 = px[cal[i + H]];
    const f = ((S1 - S0) / S0) * 100;
    const s = sign(p.postura_bias);
    const carry = CARRY * days(cal[i], cal[i + H]) / 360;
    out.push({ ...p, S0, S1, salida: cal[i + H], f, s, retBruto: s * f, ret: s === 0 ? 0 : s * f - s * carry });
  }
  // Costo solo si el tramo que vence hoy estaba del otro lado (o en caja).
  const cerradas = out.filter((x) => !x.abierta);
  cerradas.forEach((x, k) => {
    const prev = k >= H ? cerradas[k - H].s : null;
    if (x.s !== 0 && x.s !== prev) x.ret -= COSTO_RT;
  });
  return out;
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const f3 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3) + "%";
const mxn = (v) => (v < 0 ? "−" : "+") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

function reporte(nombre, ops) {
  const c = ops.filter((x) => !x.abierta && x.s !== 0);
  const r = c.map((x) => x.ret);
  const w = r.filter((v) => v > 0), l = r.filter((v) => v <= 0);
  const p = w.length / r.length, W = mean(w), L = -mean(l);
  const E = p * W - (1 - p) * L;
  const se = std(r) / Math.sqrt(r.length / H);
  const acFx = c.filter((x) => x.retBruto > 0).length;
  console.log(`\n── ${nombre} ──`);
  console.log(`  posturas direccionales cerradas: ${c.length} · acierto FX ${acFx}/${c.length} (${(100 * acFx / c.length).toFixed(1)}%) · acierto neto ${w.length}/${r.length}`);
  console.log(`  gana en promedio ${f3(W)} · pierde en promedio ${f3(-L)} · payoff ${(W / L).toFixed(2)}`);
  console.log(`  E[op] = ${(100 * p).toFixed(1)}% × ${W.toFixed(3)} − ${(100 * (1 - p)).toFixed(1)}% × ${L.toFixed(3)} = ${f3(E)}  · IC95 [${f3(E - 1.96 * se)}, ${f3(E + 1.96 * se)}] · t ${(E / se).toFixed(2)}`);
  console.log(`  Sharpe anualizado (√(252/5)): ${((mean(r) / std(r)) * Math.sqrt(252 / H)).toFixed(2)}  ·  n efectivo ≈ ${Math.round(r.length / H)}`);

  // Portafolio escalera 5 × 200k, en orden de publicación.
  const tramos = Array(H).fill(CAPITAL / H);
  const todas = ops.filter((x) => !x.abierta);
  const lista = [];
  todas.forEach((x, k) => {
    const pnl = tramos[k % H] * x.ret / 100;
    tramos[k % H] += pnl;
    lista.push({ ...x, pnl });
  });
  const dir = lista.filter((x) => x.s !== 0);
  const g = dir.filter((x) => x.pnl > 0), pe = dir.filter((x) => x.pnl <= 0);
  const fin = tramos.reduce((s, v) => s + v, 0);
  console.log(`  PORTAFOLIO 1 MDP (5 × 200k): final $${Math.round(fin).toLocaleString("en-US")} (${f3(100 * (fin / CAPITAL - 1))})`);
  console.log(`    ${g.length} ganadoras suman ${mxn(g.reduce((s, x) => s + x.pnl, 0))} (media ${mxn(mean(g.map((x) => x.pnl)))}) · ` +
    `${pe.length} perdedoras suman ${mxn(pe.reduce((s, x) => s + x.pnl, 0))} (media ${mxn(mean(pe.map((x) => x.pnl)))})`);
  const ord = [...dir].sort((a, b) => a.pnl - b.pnl);
  console.log(`    mejor ${ord.at(-1).slug} ${ord.at(-1).postura_bias} ${mxn(ord.at(-1).pnl)} · peor ${ord[0].slug} ${ord[0].postura_bias} ${mxn(ord[0].pnl)}`);
  // Mismo capital completo, sin traslape (1 MDP cada 5 posturas).
  for (let off = 0; off < H; off++) {
    let cap = CAPITAL;
    todas.filter((_, k) => k % H === off).forEach((x) => (cap *= 1 + x.ret / 100));
    process.stdout.write(`${off ? " · " : "    1 MDP completo sin traslape, arranque +" }${off}d: ${mxn(cap - CAPITAL)}`);
  }
  console.log();
  return lista;
}

console.log(`Posturas publicadas: ${posturas.length} · ${posturas[0].slug} → ${posturas.at(-1).slug}`);
console.log(`Costo ${COSTO_RT}% ida y vuelta al cambiar de lado · carry ${CARRY}% anual (supuesto constante)`);
const a = reporte("EJECUCIÓN 7:00 CDMX (t) → 7:00 CDMX (t+5)", evalua("7am"));
reporte("CONVENCIÓN DEL MARCADOR: cierre (t) → cierre (t+5)", evalua("cierre"));

console.log("\n── Detalle por postura (ejecución 7:00, tramo de 200k) ──");
console.log("fecha       postura    entrada   salida(fecha)       USD/MXN Δ   neto      P&L MXN");
for (const x of a) console.log(
  `${x.slug}  ${x.postura_bias.padEnd(9)}  ${x.S0.toFixed(4)}  ${x.S1.toFixed(4)} (${x.salida})  ${f3(x.f).padStart(8)}  ${f3(x.ret).padStart(8)}  ${mxn(x.pnl).padStart(9)}`
);
const ab = evalua("7am").filter((x) => x.abierta);
console.log(`\nEn curso (sin salida todavía): ${ab.map((x) => `${x.slug} ${x.postura_bias}`).join(", ")}`);

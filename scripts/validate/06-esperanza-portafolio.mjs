// scripts/validate/06-esperanza-portafolio.mjs
// Prueba 6: esperanza matemática, Sharpe y portafolio simulado de 1 MDP sobre
// la serie congelada (2005-2026). Responde las preguntas de 2026-09-21:
//   · ¿El índice tiene esperanza positiva por operación?
//   · ¿Cuánto se gana cuando se gana y cuánto se pierde cuando se pierde, en pesos?
//
// CONVENCIÓN DE EJECUCIÓN (la misma que se propone para el producto):
//   · El view sale a las 7:00 CDMX del día t con datos del cierre de t−1.
//   · En esta serie el precio es DEXMXUS (fixing de la Fed, 12:00 ET), así que
//     la entrada más cercana a "7:00 de t" que existe aquí es el fixing de t.
//   · Por eso la señal que se usa es la de la fila t−1 (LAG = 1). Con LAG = 0
//     —la convención de lib.mjs— el score de t incluye VIX/S&P al cierre de las
//     16:00 ET, cuatro horas DESPUÉS del fixing de entrada: look-ahead. Se
//     reportan ambas para que se vea cuánto infla.
//   · Salida al fixing de t+5 hábiles: el mismo instante en que madura la
//     postura y se publica la que la reemplaza.
//
// P&L por operación, en % del nocional, A FAVOR de la postura:
//   ret = ±(S1−S0)/S0  +  carry  −  costo
//   · carry: pro-peso cobra (Banxico − Fed) × días naturales / 360; pro-dólar lo paga.
//   · costo: COSTO_RT ida y vuelta, cobrado SOLO si la escalera cambia de lado
//     al rolar (si la postura nueva es igual a la vencida, no se opera nada).
//
// Portafolio: 1,000,000 MXN en escalera de 5 tramos de 200k. Cada día hábil
// madura un tramo y se reabre con la postura de ese día. Neutral = tramo en caja.
// Mark-to-market diario, capital compuesto por tramo. No incluye el rendimiento
// del colateral (CETES): el P&L es el del overlay cambiario.
//
// Uso:  node scripts/validate/06-esperanza-portafolio.mjs

import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadHistory, stretchSeries, mean, std, fmt } from "./lib.mjs";

const H = 5;
const CAPITAL = 1_000_000;
const COSTO_RT = 0.02; // % ida y vuelta (spread institucional USD/MXN ~1-2 pips por lado)

const rows = loadHistory();
const stretch = stretchSeries(rows);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// Reglas: además de las de lib.mjs, la lectura "intuitiva" del índice.
const REGLAS = {
  "Siempre pro-peso": () => "pro-peso",
  "Sigue el índice (≥50 peso / <50 dólar)": (r) => (r.score >= 50 ? "pro-peso" : "pro-dolar"),
  "Bandas (ON/CONS peso · DEF neutral · OFF dólar)": (r) =>
    r.score > 49 ? "pro-peso" : r.score > 32 ? "neutral" : "pro-dolar",
  "Banda extrema (contraria)": (r) => (r.score > 67 ? "pro-dolar" : "pro-peso"),
  "Estiramiento > 1": (r, i) => {
    const s = stretch[i];
    return s == null ? "pro-peso" : s < -1 ? "pro-dolar" : "pro-peso";
  },
};
const sign = (b) => (b === "pro-peso" ? -1 : b === "pro-dolar" ? 1 : 0);

function trades(rule, lag) {
  const out = [];
  for (let t = lag; t + H < rows.length; t++) {
    const sig = rows[t - lag];
    const bias = rule(sig, t - lag);
    const s = sign(bias);
    const S0 = rows[t].mxn_close, S1 = rows[t + H].mxn_close;
    const f = ((S1 - S0) / S0) * 100;
    const carry = sig.r_carry != null ? sig.r_carry * days(rows[t].date, rows[t + H].date) / 360 : 0;
    const prev = out.length >= H ? out[out.length - H].s : null; // el tramo que madura hoy
    const costo = s !== 0 && s !== prev ? COSTO_RT : 0;
    const ret = s === 0 ? 0 : s * f - s * carry - costo; // pro-peso (s=−1) cobra carry
    out.push({ t, date: rows[t].date, bias, s, f, ret, retFx: s * f });
  }
  return out;
}

function esperanza(tr, key = "ret") {
  const act = tr.filter((x) => x.s !== 0);
  const r = act.map((x) => x[key]);
  const w = r.filter((v) => v > 0), l = r.filter((v) => v <= 0);
  const p = w.length / r.length;
  const W = mean(w), L = -mean(l);
  const E = p * W - (1 - p) * L;
  // Error estándar con n efectivo = n/H (las ventanas se traslapan).
  const se = std(r) / Math.sqrt(r.length / H);
  const sharpe = (mean(r) / std(r)) * Math.sqrt(252 / H);
  return { n: r.length, p, W, L, E, payoff: W / L, t: E / se, lo: E - 1.96 * se, hi: E + 1.96 * se, sharpe };
}

function portafolio(tr) {
  // Escalera: tramo k = índice de operación mod H.
  const tramo = Array(H).fill(CAPITAL / H);
  const abiertas = Array(H).fill(null);
  const eq = [];
  const pnlOps = [];
  const porAño = {};
  let peak = CAPITAL, maxDD = 0, ddFecha = null;
  for (let t = 0; t < rows.length; t++) {
    // Cierra el tramo que madura hoy y reabre con la operación que arranca hoy.
    const op = tr.find((x) => x.t === t);
    for (let k = 0; k < H; k++) {
      const a = abiertas[k];
      if (a && a.t + H === t) {
        const pnl = tramo[k] * a.ret / 100;
        tramo[k] += pnl;
        if (a.s !== 0) pnlOps.push({ date: a.date, pnl });
        const y = rows[t].date.slice(0, 4);
        porAño[y] = (porAño[y] ?? 0) + pnl;
        abiertas[k] = null;
      }
    }
    if (op) abiertas[op.t % H] = op;
    // Mark-to-market de lo abierto.
    let v = 0;
    for (let k = 0; k < H; k++) {
      const a = abiertas[k];
      if (!a || a.s === 0) { v += tramo[k]; continue; }
      const S0 = rows[a.t].mxn_close, St = rows[t].mxn_close;
      v += tramo[k] * (1 + (a.s * (St - S0) / S0 * 100) / 100);
    }
    if (tr.length && t >= tr[0].t) {
      eq.push({ date: rows[t].date, v });
      if (v > peak) peak = v;
      const dd = (peak - v) / peak;
      if (dd > maxDD) { maxDD = dd; ddFecha = rows[t].date; }
    }
  }
  const final = tramo.reduce((s, v) => s + v, 0);
  const años = days(eq[0].date, eq[eq.length - 1].date) / 365.25;
  const rd = eq.slice(1).map((x, i) => x.v / eq[i].v - 1);
  const wins = pnlOps.filter((x) => x.pnl > 0).map((x) => x.pnl);
  const losses = pnlOps.filter((x) => x.pnl <= 0).map((x) => x.pnl);
  const ord = [...pnlOps].sort((a, b) => a.pnl - b.pnl);
  return {
    final,
    cagr: (final / CAPITAL) ** (1 / años) - 1,
    vol: std(rd) * Math.sqrt(252),
    sharpe: (mean(rd) / std(rd)) * Math.sqrt(252),
    maxDD, ddFecha,
    ganMedia: mean(wins), perMedia: mean(losses),
    peor: ord[0], mejor: ord[ord.length - 1],
    porAño,
    eq,
  };
}

const mxn = (v) => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

console.log(`\nMuestra: ${rows.length} días · ${rows[0].date} → ${rows[rows.length - 1].date}`);
console.log(`Horizonte ${H}d · costo ${COSTO_RT}% ida y vuelta al cambiar de lado · carry Banxico−Fed incluido\n`);

console.log("── 1. ESPERANZA POR OPERACIÓN (% del nocional, neto) ─────────────────────────────────────────────");
console.log("regla                                            lag     n   acierto  gana    pierde  payoff   E[op]    IC95 E            t    Sharpe");
const resumen = [];
for (const [nombre, rule] of Object.entries(REGLAS)) {
  for (const lag of [0, 1]) {
    const tr = trades(rule, lag);
    const e = esperanza(tr);
    if (lag === 1) resumen.push([nombre, tr, e]);
    console.log(
      nombre.padEnd(48) + String(lag).padStart(4) + String(e.n).padStart(7) +
      (fmt(100 * e.p, 1) + "%").padStart(9) + (fmt(e.W, 3) + "%").padStart(8) + (fmt(e.L, 3) + "%").padStart(9) +
      fmt(e.payoff).padStart(7) + (fmt(e.E, 3) + "%").padStart(9) +
      `  [${fmt(e.lo, 3)}, ${fmt(e.hi, 3)}]`.padEnd(18) + fmt(e.t).padStart(6) + fmt(e.sharpe).padStart(8)
    );
  }
}

console.log("\n── 1b. Descomposición (lag 1): cuánto de E es FX y cuánto es carry ──────────────────────────────");
for (const [nombre, tr, e] of resumen) {
  const act = tr.filter((x) => x.s !== 0);
  const fx = mean(act.map((x) => x.retFx));
  console.log(`${nombre.padEnd(48)} E neto ${fmt(e.E, 3)}%  =  FX ${fmt(fx, 3)}%  +  carry/costo ${fmt(e.E - fx, 3)}%`);
}

console.log("\n── 2. PORTAFOLIO 1 MDP · escalera 5×200k · lag 1 ─────────────────────────────────────────────────");
console.log("regla                                            final          CAGR    vol    Sharpe  maxDD         gana/op   pierde/op  peor op     mejor op");
for (const [nombre, tr] of resumen) {
  const p = portafolio(tr);
  console.log(
    nombre.padEnd(48) + mxn(p.final).padStart(12) + (fmt(100 * p.cagr) + "%").padStart(8) + (fmt(100 * p.vol, 1) + "%").padStart(7) +
    fmt(p.sharpe).padStart(8) + `  ${fmt(100 * p.maxDD, 1)}% (${p.ddFecha.slice(0, 7)})`.padEnd(16) +
    mxn(p.ganMedia).padStart(9) + mxn(p.perMedia).padStart(11) +
    `  ${mxn(p.peor.pnl)} ${p.peor.date}`.padEnd(22) + `  ${mxn(p.mejor.pnl)} ${p.mejor.date}`
  );
}

console.log("\n── 3. P&L por año (MXN) · escalera 1 MDP · lag 1 ─────────────────────────────────────────────────");
const ports = resumen.map(([n, tr]) => [n, portafolio(tr)]);
const años = Object.keys(ports[0][1].porAño).sort();
console.log("año   " + ports.map(([n]) => n.slice(0, 16).padStart(18)).join(""));
for (const y of años) console.log(y + "  " + ports.map(([, p]) => mxn(p.porAño[y] ?? 0).padStart(18)).join(""));
console.log();

// ── 4. Por ventana: ¿cambia la foto si miramos 1, 3, 5 o 21 años? ──────────
// Las posturas publicadas (jul-2026 en adelante) las escribe el redactor con
// noticias del día; eso NO se puede reconstruir hacia atrás sin look-ahead. Lo
// que sí se puede es correr las reglas determinísticas en cada ventana.
console.log("── 4. POR VENTANA (lag 1, escalera 1 MDP) ────────────────────────────────────────────────────────");
const fin = rows[rows.length - 1].date;
const corte = (a) => `${+fin.slice(0, 4) - a}${fin.slice(4)}`;
console.log("regla".padEnd(48) + ["1 año", "3 años", "5 años", "21 años"].map((s) => s.padStart(30)).join(""));
console.log("".padEnd(48) + "      acierto  E/op   CAGR  Sharpe".repeat(4));
for (const [nombre, tr] of resumen) {
  let linea = nombre.padEnd(48);
  for (const a of [1, 3, 5, 21]) {
    const sub = a === 21 ? tr : tr.filter((x) => x.date >= corte(a));
    const e = esperanza(sub), p = portafolio(sub);
    linea += `${fmt(100 * e.p, 1).padStart(12)}% ${fmt(e.E, 2).padStart(5)}% ${(fmt(100 * p.cagr, 1) + "%").padStart(6)} ${fmt(p.sharpe).padStart(6)}`;
  }
  console.log(linea);
}
console.log();

// ── 5. --json: public/data/portafolio-backtest.json para /indice ────────────
// Solo la regla "seguir el índice" (decisión de Mauricio, 2026-09-21): es lo
// más cercano a la señal propia. Las posturas del redactor NO se pueden
// reconstruir hacia atrás — usan noticias y criterio del día — y la página lo
// dice. Curva muestreada semanal para que el JSON pese poco.
if (process.argv.includes("--json")) {
  const [, tr] = resumen.find(([n]) => n.startsWith("Sigue el índice"));
  const ventanas = {};
  for (const a of [3, 5]) {
    const sub = tr.filter((x) => x.date >= corte(a));
    const e = esperanza(sub), p = portafolio(sub);
    ventanas[`${a}y`] = {
      desde: sub[0].date, hasta: p.eq[p.eq.length - 1].date,
      final: Math.round(p.final), cagr_pct: +(100 * p.cagr).toFixed(2), sharpe: +p.sharpe.toFixed(2),
      max_dd_pct: +(100 * p.maxDD).toFixed(1), vol_pct: +(100 * p.vol).toFixed(1),
      n: e.n, n_efectivo: Math.round(e.n / H), acierto_pct: +(100 * e.p).toFixed(1),
      e_op_pct: +e.E.toFixed(3), e_ic95: [+e.lo.toFixed(3), +e.hi.toFixed(3)],
      curva: p.eq.filter((_, i, arr) => i % 5 === 0 || i === arr.length - 1).map((x) => ({ d: x.date, v: Math.round(x.v) })),
    };
  }
  const out = {
    regla: "score ≥ 50 → pro-peso · score < 50 → pro-dólar",
    ejecucion: "señal del día anterior, entrada y salida al fixing FRED DEXMXUS, 5 días hábiles, 5 tramos de 200k",
    costo_rt_pct: COSTO_RT, carry: "Banxico − Fed histórico, días naturales / 360",
    fuente: "data/backtest/history.csv (SHA256 en history.sha256) · scripts/validate/06-esperanza-portafolio.mjs",
    ventanas,
  };
  const OUT = path.join(process.cwd(), "public", "data", "portafolio-backtest.json");
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`escrito ${OUT}`);
}

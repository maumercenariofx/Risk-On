// scripts/research-posturas.mjs
// Investigación integral (2026-07-30): ¿las ponderaciones del índice son las
// correctas, y qué regla maximiza la probabilidad de acertar la postura diaria
// bajo la regla del marcador (/indice)?
//
// A diferencia de backtest-riskscore.mjs (que dejaba carry y curva CONSTANTES),
// aquí las 9 señales llevan historia real de 5 años:
//   · Yahoo v8 chart: ^VIX ^MOVE MXN=X ^GSPC BTC-USD GC=F
//   · FRED CSV público: DGS2, DGS10 (curva 2s10s) y DFF (fed funds efectiva)
//   · Banxico: tasa objetivo reconstruida por fechas de decisión (fuente:
//     comunicados Banxico / El Financiero; último recorte 2026-05-07 → 6.50,
//     fin del ciclo iniciado en mar-2024)
//
// Análisis:
//   A. IC de Spearman por señal (sub-score → USD/MXN forward 1/5/10d)
//   B. Matriz de correlación entre sub-scores (Problema 2: redundancia)
//   C. Composites candidatos (pesos actuales / iguales / decorrelacionados /
//      tilt predictivo) comparados en IC y en el edge de colas por banda
//   D. Reglas de postura evaluadas con la REGLA DEL MARCADOR (pro-peso acierta
//      si fwd5<0; pro-dolar si fwd5>0; neutral si |fwd5|≤0.35) con baselines
//      honestos y validación walk-forward para lo que lleve parámetros
//   E. Marcador real: las posturas publicadas desde 2026-07-10 vs realizado
//
// Uso:  node scripts/research-posturas.mjs
// Salida: consola + CSV en el scratchpad.

import { writeFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SCRATCH =
  "C:/Users/mauri/AppData/Local/Temp/claude/C--Users-mauri/67ea65cf-821c-47f8-ac0a-4263fe412ce2/scratchpad";

// ── Réplica EXACTA de lib/riskScore.js ───────────────────────────────────────
const DYN_N = 60, DYN_K = 1.1;
const DYN = {
  vix:    { anchor: 17.5, sign: -1, minScale: 4.4 },
  mxn:    { anchor: 0,    sign: -1 },
  spx:    { anchor: 0,    sign:  1 },
  mxnvol: { anchor: 9,    sign: -1, minScale: 4.1 },
  move:   { anchor: 100,  sign: -1, minScale: 28 },
  btc:    { anchor: 0,    sign:  1 },
  gold:   { anchor: 0,    sign: -1 },
};
const RAMP = { carry: { at0: 0, at100: 7 }, curve: { at0: -0.5, at100: 1.0 } };
const W_CURRENT = { vix: 20, mxn: 18, spx: 15, carry: 10, mxnvol: 10, move: 8, btc: 7, curve: 7, gold: 5 };
const KEYS = Object.keys(W_CURRENT);
const BAND_CUTS = { off: 32, def: 49, con: 67 }; // 32/49/67 vigentes
const bandOf = (s) => (s <= BAND_CUTS.off ? "RISK-OFF" : s <= BAND_CUTS.def ? "DEFENSIVE" : s <= BAND_CUTS.con ? "CONSTRUCTIVE" : "RISK-ON");

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const madScale = (w) => { const m = median(w); return 1.4826 * median(w.map((v) => Math.abs(v - m))); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lin = (v, at0, at100) => clamp(((v - at0) / (at100 - at0)) * 100, 0, 100);
function dynSub(value, window, key) {
  const cfg = DYN[key];
  const w = window.filter((x) => x != null && !isNaN(x)).slice(-DYN_N);
  if (w.length < 30) return null;
  const scale = Math.max(madScale(w), cfg.minScale ?? 0);
  if (!scale || !isFinite(scale)) return null;
  return 100 / (1 + Math.exp(-DYN_K * cfg.sign * ((value - cfg.anchor) / scale)));
}

// ── Descargas ────────────────────────────────────────────────────────────────
async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      const ts = r?.timestamp ?? [], closes = r?.indicators?.quote?.[0]?.close ?? [];
      const map = new Map();
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c == null || isNaN(c)) continue;
        map.set(new Date(ts[i] * 1000).toISOString().slice(0, 10), c);
      }
      if (!map.size) throw new Error("serie vacía");
      return map;
    } catch (e) {
      if (a === 2) throw new Error(`${symbol}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 900));
    }
  }
}
async function fetchFred(id) {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { "User-Agent": YAHOO_UA } });
  if (!res.ok) throw new Error(`FRED ${id}: HTTP ${res.status}`);
  const map = new Map();
  for (const line of (await res.text()).trim().split("\n").slice(1)) {
    const [d, v] = line.split(",");
    const x = parseFloat(v);
    if (!isNaN(x)) map.set(d, x);
  }
  return map;
}
// Tasa objetivo Banxico por fecha de decisión (efectiva al día hábil siguiente,
// la aproximación de 1 día es irrelevante para una señal que cambia 8 veces/año).
const BANXICO_STEPS = [
  ["2021-01-01", 4.25], ["2021-02-12", 4.00], ["2021-06-25", 4.25], ["2021-08-13", 4.50],
  ["2021-10-01", 4.75], ["2021-11-12", 5.00], ["2021-12-17", 5.50],
  ["2022-02-11", 6.00], ["2022-03-25", 6.50], ["2022-05-13", 7.00], ["2022-06-24", 7.75],
  ["2022-08-12", 8.50], ["2022-09-30", 9.25], ["2022-11-11", 10.00], ["2022-12-16", 10.50],
  ["2023-02-10", 11.00], ["2023-03-31", 11.25],
  ["2024-03-22", 11.00], ["2024-08-09", 10.75], ["2024-09-27", 10.50], ["2024-11-15", 10.25], ["2024-12-20", 10.00],
  ["2025-02-07", 9.50], ["2025-03-28", 9.00], ["2025-05-16", 8.50], ["2025-06-27", 8.00],
  ["2025-08-08", 7.75], ["2025-09-26", 7.50], ["2025-11-07", 7.25], ["2025-12-19", 7.00],
  ["2026-05-08", 6.50],
];
const banxicoAt = (date) => {
  let r = BANXICO_STEPS[0][1];
  for (const [d, v] of BANXICO_STEPS) { if (d <= date) r = v; else break; }
  return r;
};

// ── Estadística ──────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const spearman = (a, b) => pearson(ranks(a), ranks(b));
// t aproximada con n efectivo = n/h (retornos forward de h días se traslapan)
const icT = (ic, n, h) => ic * Math.sqrt(Math.max(1, n / h));

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("Descargando 5 años (Yahoo + FRED)…");
const [vix, move, mxnP, spxP, btcP, goldP, dgs2, dgs10, dff] = await Promise.all([
  fetchYahoo("^VIX"), fetchYahoo("^MOVE"), fetchYahoo("MXN=X"), fetchYahoo("^GSPC"),
  fetchYahoo("BTC-USD"), fetchYahoo("GC=F"), fetchFred("DGS2"), fetchFred("DGS10"), fetchFred("DFF"),
]);
console.log(`  ✓ VIX ${vix.size} · MOVE ${move.size} · MXN ${mxnP.size} · SPX ${spxP.size} · BTC ${btcP.size} · GOLD ${goldP.size} · DGS2 ${dgs2.size} · DGS10 ${dgs10.size} · DFF ${dff.size}`);

const dates = [...spxP.keys()].sort();
const ff = (m, d, last) => m.get(d) ?? last;
const lvl = { vix: [], move: [], mxn: [], spx: [], btc: [], gold: [], d2: [], d10: [], dff: [] };
{
  const last = {};
  for (const d of dates) {
    last.vix = ff(vix, d, last.vix); last.move = ff(move, d, last.move);
    last.mxn = ff(mxnP, d, last.mxn); last.spx = ff(spxP, d, last.spx);
    last.btc = ff(btcP, d, last.btc); last.gold = ff(goldP, d, last.gold);
    last.d2 = ff(dgs2, d, last.d2); last.d10 = ff(dgs10, d, last.d10); last.dff = ff(dff, d, last.dff);
    for (const k of ["vix", "move", "mxn", "spx", "btc", "gold"]) lvl[k].push(last[k]);
    lvl.d2.push(last.d2); lvl.d10.push(last.d10); lvl.dff.push(last.dff);
  }
}
const pctChg = (arr, i) => (i > 0 && arr[i - 1] ? ((arr[i] - arr[i - 1]) / arr[i - 1]) * 100 : null);
function realizedVol(i) {
  const lr = [];
  for (let j = Math.max(1, i - 21); j <= i; j++)
    if (lvl.mxn[j] && lvl.mxn[j - 1]) lr.push(Math.log(lvl.mxn[j] / lvl.mxn[j - 1]));
  if (lr.length < 6) return null;
  const m = mean(lr);
  return Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (lr.length - 1)) * Math.sqrt(252) * 100;
}

// Insumos crudos por día
const input = dates.map((d, i) => ({
  date: d,
  vix: lvl.vix[i], move: lvl.move[i], mxnvol: realizedVol(i),
  mxn: pctChg(lvl.mxn, i), spx: pctChg(lvl.spx, i), btc: pctChg(lvl.btc, i), gold: pctChg(lvl.gold, i),
  carry: lvl.dff[i] != null ? banxicoAt(d) - lvl.dff[i] : null,
  curve: lvl.d10[i] != null && lvl.d2[i] != null ? lvl.d10[i] - lvl.d2[i] : null,
  price: lvl.mxn[i],
}));
const inputSeries = {};
for (const k of ["vix", "mxn", "spx", "mxnvol", "move", "btc", "gold"]) inputSeries[k] = input.map((r) => r[k]);

// Sub-scores + forward returns
const WARMUP = 70;
const rows = [];
for (let i = WARMUP; i < input.length; i++) {
  const r = input[i];
  const subs = {};
  for (const k of KEYS) {
    if (DYN[k]) {
      const v = r[k];
      if (v == null || isNaN(v)) continue;
      const s = dynSub(v, inputSeries[k].slice(i - DYN_N, i), k);
      subs[k] = s ?? lin(v, ...(k === "vix" ? [28, 12] : k === "mxn" ? [0.5, -0.5] : k === "spx" ? [-1, 1] : k === "mxnvol" ? [14, 6] : k === "move" ? [140, 60] : k === "btc" ? [-3, 3] : [1, -1]));
    } else {
      if (r[k] == null) continue;
      subs[k] = lin(r[k], RAMP[k].at0, RAMP[k].at100);
    }
  }
  const fwd = (n) => (i + n < input.length && r.price && input[i + n].price ? ((input[i + n].price - r.price) / r.price) * 100 : null);
  // extras para reglas: estiramiento vs MA20 en ATR%, momentum del precio
  const win = lvl.mxn.slice(i - 19, i + 1).filter((x) => x != null);
  const ma20 = win.length === 20 ? mean(win) : null;
  const trs = [];
  for (let j = i - 13; j <= i; j++) if (lvl.mxn[j] && lvl.mxn[j - 1]) trs.push(Math.abs(lvl.mxn[j] - lvl.mxn[j - 1]));
  const atr = trs.length >= 10 ? mean(trs) : null;
  const stretch = ma20 && atr ? (r.price - ma20) / atr : null;
  rows.push({ i, date: r.date, subs, price: r.price, carry: r.carry, curve: r.curve,
    stretch, ma20, fwd1: fwd(1), fwd5: fwd(5), fwd10: fwd(10) });
}
// score con pesos arbitrarios
function scoreWith(subs, W) {
  let s = 0, w = 0;
  for (const k of KEYS) if (subs[k] != null) { s += subs[k] * W[k]; w += W[k]; }
  return w ? s / w : null;
}
for (const r of rows) { r.score = scoreWith(r.subs, W_CURRENT); r.band = bandOf(r.score); }
for (let j = 0; j < rows.length; j++) rows[j].dScore5 = j >= 5 ? rows[j].score - rows[j - 5].score : null;

const complete = rows.filter((r) => r.fwd5 != null && KEYS.every((k) => r.subs[k] != null) && r.stretch != null && r.dScore5 != null);
console.log(`\n${rows.length} días con score · ${complete.length} completos con fwd5 · ${rows[0].date} → ${rows[rows.length - 1].date}`);

// ── A. IC por señal ──────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(74));
console.log("A · IC DE SPEARMAN  sub-score → retorno forward USD/MXN  (IC<0 = señal");
console.log("    'risk-on' anticipa peso fuerte = sentido esperado del índice)");
console.log("═".repeat(74));
const icTable = {};
for (const k of [...KEYS, "SCORE"]) {
  const xs = complete.map((r) => (k === "SCORE" ? r.score : r.subs[k]));
  const row = {};
  for (const [h, fld] of [[1, "fwd1"], [5, "fwd5"], [10, "fwd10"]]) {
    const ys = complete.map((r) => r[fld]).map((v, i) => [v, i]).filter(([v]) => v != null);
    const ic = spearman(ys.map(([, i]) => xs[i]), ys.map(([v]) => v));
    row[`IC ${h}d`] = +ic.toFixed(3);
    row[`t ${h}d`] = +icT(ic, ys.length, h).toFixed(1);
  }
  row["peso"] = k === "SCORE" ? "—" : W_CURRENT[k];
  icTable[k] = row;
}
console.table(icTable);

// ── B. Correlación entre sub-scores (Problema 2) ─────────────────────────────
console.log("\n" + "═".repeat(74));
console.log("B · CORRELACIÓN ENTRE SUB-SCORES (redundancia → peso efectivo)");
console.log("═".repeat(74));
const corrM = {};
for (const a of KEYS) {
  corrM[a] = {};
  for (const b of KEYS)
    corrM[a][b] = +pearson(complete.map((r) => r.subs[a]), complete.map((r) => r.subs[b])).toFixed(2);
}
console.table(corrM);
// peso decorrelacionado: w ∝ w_actual / Σ|ρ|
const rho = {};
for (const a of KEYS) rho[a] = KEYS.reduce((s, b) => s + Math.abs(corrM[a][b]), 0);
const wDecorr = {};
{
  let tot = 0;
  for (const k of KEYS) { wDecorr[k] = W_CURRENT[k] / rho[k]; tot += wDecorr[k]; }
  for (const k of KEYS) wDecorr[k] = (wDecorr[k] / tot) * 100;
}
console.log("Peso efectivo (actual ÷ Σ|ρ|, renormalizado):",
  Object.fromEntries(KEYS.map((k) => [k, +wDecorr[k].toFixed(1)])));

// ── C. Composites candidatos ─────────────────────────────────────────────────
console.log("\n" + "═".repeat(74));
console.log("C · COMPOSITES CANDIDATOS — nowcast + edge contrarian de colas");
console.log("═".repeat(74));
const wEqual = Object.fromEntries(KEYS.map((k) => [k, 100 / 9]));
// tilt predictivo: pesos actuales escalados por |IC5| de cada señal (mitad in-sample:
// solo diagnóstico — un peso ajustado con TODO el sample es lookahead y se marca así)
const ic5 = Object.fromEntries(KEYS.map((k) => {
  const ys = complete.filter((r) => r.fwd5 != null);
  return [k, Math.abs(spearman(ys.map((r) => r.subs[k]), ys.map((r) => r.fwd5)))];
}));
const wPred = {};
{
  let tot = 0;
  for (const k of KEYS) { wPred[k] = W_CURRENT[k] * (0.5 + ic5[k] / Math.max(...Object.values(ic5))); tot += wPred[k]; }
  for (const k of KEYS) wPred[k] = (wPred[k] / tot) * 100;
}
const CANDIDATES = { ACTUAL: W_CURRENT, IGUALES: wEqual, DECORR: wDecorr, "PRED-TILT (in-sample!)": wPred };
const candTable = {};
for (const [name, W] of Object.entries(CANDIDATES)) {
  const sc = complete.map((r) => scoreWith(r.subs, W));
  const f5 = complete.map((r) => r.fwd5);
  // cortes por percentil equivalentes a 32/49/67 del actual
  const base = complete.map((r) => r.score);
  const sortedBase = [...base].sort((a, b) => a - b), sortedSc = [...sc].sort((a, b) => a - b);
  const pctOf = (s, v) => s.filter((x) => x <= v).length / s.length;
  const cutAt = (p) => sortedSc[Math.min(sortedSc.length - 1, Math.floor(p * sortedSc.length))];
  const cuts = [BAND_CUTS.off, BAND_CUTS.def, BAND_CUTS.con].map((c) => cutAt(pctOf(sortedBase, c)));
  const inOff = sc.map((v, i) => [v, i]).filter(([v]) => v <= cuts[0]).map(([, i]) => i);
  const inOn = sc.map((v, i) => [v, i]).filter(([v]) => v > cuts[2]).map(([, i]) => i);
  candTable[name] = {
    "IC5": +spearman(sc, f5).toFixed(3),
    "IC10": +spearman(sc, complete.map((r) => r.fwd10 ?? 0)).toFixed(3),
    "OFF n": inOff.length,
    "OFF fwd5": inOff.length ? +mean(inOff.map((i) => f5[i])).toFixed(2) : null,
    "OFF %peso↑": inOff.length ? +(100 * inOff.filter((i) => f5[i] < 0).length / inOff.length).toFixed(0) : null,
    "ON n": inOn.length,
    "ON fwd5": inOn.length ? +mean(inOn.map((i) => f5[i])).toFixed(2) : null,
  };
}
console.table(candTable);

// ── D. Reglas de postura con la regla del marcador ───────────────────────────
console.log("\n" + "═".repeat(74));
console.log("D · REGLAS DE POSTURA  (marcador: pro-peso✓ si fwd5<0 · pro-dolar✓ si");
console.log("    fwd5>0 · neutral✓ si |fwd5|≤0.35) — walk-forward donde aplica");
console.log("═".repeat(74));
const hit = (bias, f5) =>
  bias === "pro-peso" ? f5 < 0 : bias === "pro-dolar" ? f5 > 0 : Math.abs(f5) <= 0.35;

function evalRule(name, fn, universe = complete) {
  const calls = universe.map((r) => ({ r, bias: fn(r) })).filter((c) => c.bias);
  const byBias = {};
  for (const b of ["pro-peso", "neutral", "pro-dolar"]) {
    const xs = calls.filter((c) => c.bias === b);
    if (xs.length)
      byBias[b] = { n: xs.length, "hit%": +(100 * xs.filter((c) => hit(b, c.r.fwd5)).length / xs.length).toFixed(0),
        fwd5: +mean(xs.map((c) => c.r.fwd5)).toFixed(2) };
  }
  return { name, n: calls.length,
    "hit% total": +(100 * calls.filter((c) => hit(c.bias, c.r.fwd5)).length / calls.length).toFixed(1), byBias };
}

// Baselines + reglas simples (sin parámetros ajustados → todo el sample es OOS)
const results = [];
results.push(evalRule("SIEMPRE pro-peso", () => "pro-peso"));
results.push(evalRule("SIEMPRE neutral", () => "neutral"));
results.push(evalRule("SIEMPRE pro-dolar", () => "pro-dolar"));
results.push(evalRule("BANDA: OFF→peso, ON→dolar, resto neutral",
  (r) => (r.band === "RISK-OFF" ? "pro-peso" : r.band === "RISK-ON" ? "pro-dolar" : "neutral")));
results.push(evalRule("BANDA: OFF→peso, ON→dolar, resto peso",
  (r) => (r.band === "RISK-OFF" ? "pro-peso" : r.band === "RISK-ON" ? "pro-dolar" : "pro-peso")));
results.push(evalRule("TENDENCIA: precio<MA20→peso, si no→dolar",
  (r) => (r.price < r.ma20 ? "pro-peso" : "pro-dolar")));
results.push(evalRule("ESTIRAMIENTO: >+1σ→peso, <−1σ→dolar, resto neutral",
  (r) => (r.stretch > 1 ? "pro-peso" : r.stretch < -1 ? "pro-dolar" : "neutral")));
results.push(evalRule("ESTIRAMIENTO no-neutral: >0→peso, ≤0→dolar",
  (r) => (r.stretch > 0 ? "pro-peso" : "pro-dolar")));
results.push(evalRule("CARRY>4 → peso, si no tendencia",
  (r) => (r.carry > 4 ? "pro-peso" : r.price < r.ma20 ? "pro-peso" : "pro-dolar")));
results.push(evalRule("HÍBRIDA: banda extrema manda, resto estiramiento",
  (r) => (r.band === "RISK-OFF" ? "pro-peso" : r.band === "RISK-ON" ? "pro-dolar" :
          r.stretch > 1 ? "pro-peso" : r.stretch < -1 ? "pro-dolar" :
          r.price < r.ma20 ? "pro-peso" : "pro-dolar")));

// Logística walk-forward: P(fwd5<0) con features estandarizadas, refit c/21d
function logitWalkForward(features, pHi = 0.6, pLo = 0.4) {
  const X = complete.map((r) => features.map((f) => f(r)));
  const y = complete.map((r) => (r.fwd5 < 0 ? 1 : 0));
  const preds = new Array(complete.length).fill(null);
  const MIN_TRAIN = 250, REFIT = 21, LAMBDA = 0.01, LR = 0.05, ITERS = 300;
  let betas = null;
  for (let t = MIN_TRAIN; t < complete.length; t++) {
    if ((t - MIN_TRAIN) % REFIT === 0) {
      // estandariza con lo visto hasta t (sin mirar el futuro)
      const mu = features.map((_, j) => mean(X.slice(0, t).map((x) => x[j])));
      const sg = features.map((_, j) => sd(X.slice(0, t).map((x) => x[j])) || 1);
      const Xs = X.slice(0, t).map((x) => x.map((v, j) => (v - mu[j]) / sg[j]));
      let b = new Array(features.length + 1).fill(0);
      for (let it = 0; it < ITERS; it++) {
        const g = new Array(b.length).fill(0);
        for (let n = 0; n < t; n++) {
          const z = b[0] + Xs[n].reduce((s, v, j) => s + v * b[j + 1], 0);
          const p = 1 / (1 + Math.exp(-z));
          const e = p - y[n];
          g[0] += e;
          for (let j = 0; j < features.length; j++) g[j + 1] += e * Xs[n][j];
        }
        for (let j = 0; j < b.length; j++) b[j] -= (LR / t) * (g[j] + LAMBDA * b[j] * (j ? 1 : 0));
      }
      betas = { b, mu, sg };
    }
    const xs = X[t].map((v, j) => (v - betas.mu[j]) / betas.sg[j]);
    const z = betas.b[0] + xs.reduce((s, v, j) => s + v * betas.b[j + 1], 0);
    preds[t] = 1 / (1 + Math.exp(-z));
  }
  return complete
    .map((r, i) => ({ r, p: preds[i] }))
    .filter((x) => x.p != null)
    .map(({ r, p }) => ({ r, bias: p >= pHi ? "pro-peso" : p <= pLo ? "pro-dolar" : "neutral" }));
}
function evalCalls(name, calls) {
  const byBias = {};
  for (const b of ["pro-peso", "neutral", "pro-dolar"]) {
    const xs = calls.filter((c) => c.bias === b);
    if (xs.length)
      byBias[b] = { n: xs.length, "hit%": +(100 * xs.filter((c) => hit(b, c.r.fwd5)).length / xs.length).toFixed(0),
        fwd5: +mean(xs.map((c) => c.r.fwd5)).toFixed(2) };
  }
  return { name, n: calls.length,
    "hit% total": +(100 * calls.filter((c) => hit(c.bias, c.r.fwd5)).length / calls.length).toFixed(1), byBias };
}
const FEATS_ALL = KEYS.map((k) => (r) => r.subs[k]);
const FEATS_X = [...FEATS_ALL, (r) => r.stretch, (r) => r.dScore5];
results.push(evalCalls("LOGIT-WF subs (p 60/40)", logitWalkForward(FEATS_ALL)));
results.push(evalCalls("LOGIT-WF subs+stretch+Δscore (p 60/40)", logitWalkForward(FEATS_X)));
results.push(evalCalls("LOGIT-WF subs+extras (p 55/45)", logitWalkForward(FEATS_X, 0.55, 0.45)));

for (const res of results) {
  console.log(`\n▸ ${res.name} — n=${res.n}, hit total ${res["hit% total"]}%`);
  console.table(res.byBias);
}

// Split temporal honesto de las 3 mejores reglas simples: mitad vieja vs nueva
console.log("\n▸ ESTABILIDAD TEMPORAL (mitad 1 vs mitad 2 del sample, reglas sin fit)");
const half = Math.floor(complete.length / 2);
const halves = { "1ª mitad": complete.slice(0, half), "2ª mitad": complete.slice(half) };
const stabTable = {};
for (const [hn, uni] of Object.entries(halves)) {
  stabTable[hn] = {};
  for (const [rn, fn] of [
    ["TENDENCIA", (r) => (r.price < r.ma20 ? "pro-peso" : "pro-dolar")],
    ["BANDA→resto peso", (r) => (r.band === "RISK-OFF" ? "pro-peso" : r.band === "RISK-ON" ? "pro-dolar" : "pro-peso")],
    ["HÍBRIDA", (r) => (r.band === "RISK-OFF" ? "pro-peso" : r.band === "RISK-ON" ? "pro-dolar" : r.stretch > 1 ? "pro-peso" : r.stretch < -1 ? "pro-dolar" : r.price < r.ma20 ? "pro-peso" : "pro-dolar")],
    ["SIEMPRE peso", () => "pro-peso"],
  ]) {
    stabTable[hn][rn] = evalRule(rn, fn, uni)["hit% total"] + "%";
  }
}
console.table(stabTable);

// ── E. Marcador real de posturas publicadas ──────────────────────────────────
console.log("\n" + "═".repeat(74));
console.log("E · POSTURAS PUBLICADAS (desde 2026-07-10) vs USD/MXN realizado");
console.log("═".repeat(74));
try {
  const matterMod = await import("gray-matter");
  const matter = matterMod.default;
  const contentDir = path.join(process.cwd(), "content");
  const posts = readdirSync(contentDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()
    .map((f) => matter(readFileSync(path.join(contentDir, f), "utf8")).data)
    .filter((fm) => fm.postura_bias);
  const dateIdx = new Map(rows.map((r, i) => [r.date, i]));
  const realTable = [];
  let realHits = 0, realN = 0;
  for (const p of posts) {
    const i = dateIdx.get(p.date);
    const f5 = i != null ? rows[i].fwd5 : null;
    const v = f5 == null ? null : hit(p.postura_bias, f5);
    if (v != null) { realN++; if (v) realHits++; }
    realTable.push({ fecha: p.date, bias: p.postura_bias, score: p.score,
      fwd5: f5 == null ? "en curso" : +f5.toFixed(2), acierto: v == null ? "—" : v ? "✓" : "✗" });
  }
  console.table(realTable);
  console.log(`Marcador real: ${realHits}/${realN} = ${realN ? (100 * realHits / realN).toFixed(0) : "—"}%`);
} catch (e) {
  console.log(`(no se pudo leer content/: ${e.message})`);
}

// ── CSV ──────────────────────────────────────────────────────────────────────
const csv = ["date,score,band," + KEYS.join(",") + ",stretch,dScore5,carry,curve,fwd1,fwd5,fwd10"]
  .concat(rows.map((r) => [r.date, r.score?.toFixed(1), r.band,
    ...KEYS.map((k) => r.subs[k]?.toFixed(1) ?? ""), r.stretch?.toFixed(2) ?? "", r.dScore5?.toFixed(1) ?? "",
    r.carry?.toFixed(2) ?? "", r.curve?.toFixed(2) ?? "",
    r.fwd1?.toFixed(3) ?? "", r.fwd5?.toFixed(3) ?? "", r.fwd10?.toFixed(3) ?? ""].join(",")))
  .join("\n");
writeFileSync(path.join(SCRATCH, "research-posturas.csv"), csv);
console.log(`\n✓ CSV: ${path.join(SCRATCH, "research-posturas.csv")}`);

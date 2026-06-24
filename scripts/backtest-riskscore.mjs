// scripts/backtest-riskscore.mjs
// Backtest comparativo: índice Risk On ACTUAL (rampas fijas, réplica exacta de
// lib/riskScore.js) vs índice NUEVO (Problema 1: normalización dinámica con
// z-score robusto + squashing logístico) sobre 2 años de historia diaria.
//
// Objetivo de esta primera corrida: aislar el efecto del clipping. Las señales
// lentas (carry, curva) se mantienen CONSTANTES e idénticas en ambos métodos
// (17% del peso) para que la diferencia refleje SOLO el cambio de normalización
// en las 7 señales rápidas / de volatilidad (85% del peso). EWMA (Problema 3) y
// pesos por correlación (Problema 2) se añadirán en corridas posteriores.
//
// Uso:  node scripts/backtest-riskscore.mjs
// Salida: resumen en consola + CSV en el scratchpad.

import { writeFileSync } from "node:fs";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const OUT_CSV =
  "C:/Users/mauri/AppData/Local/Temp/claude/C--Users-mauri/e42bdc8a-fcf2-437e-846d-96b87e2df376/scratchpad/backtest-riskscore.csv";

// ── Parámetros del método NUEVO (Problema 1) ─────────────────────────────────
const N_WINDOW = 60;   // ventana rodante para MAD (días hábiles)
const K_LOGIT  = 1.1;  // pendiente logística: z=±2σ→~90/10, z=±3σ→~96/4, nunca 0/100
const WARMUP   = 60;   // días iniciales sin score nuevo (falta historia para MAD)

// Anclas absolutas (preservan el significado risk-on/off; NO son medias rodantes)
const ANCHOR = { vix: 17.5, move: 100, mxnvol: 9, ret: 0 };

// ── 1. Descarga de historia diaria (Yahoo v8 chart, 2 años) ──────────────────
async function fetchDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      if (!r) throw new Error("no result");
      const ts = r.timestamp ?? [];
      const closes = r.indicators?.quote?.[0]?.close ?? [];
      const map = new Map(); // 'YYYY-MM-DD' -> close
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c == null || isNaN(c)) continue;
        const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
        map.set(d, c);
      }
      return map;
    } catch (e) {
      if (attempt === 2) { console.error(`  ✗ ${symbol}: ${e.message}`); return new Map(); }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

// ── 2. Helpers estadísticos ──────────────────────────────────────────────────
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const madScale = (window) => {
  const med = median(window);
  return 1.4826 * median(window.map((v) => Math.abs(v - med)));
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// MÉTODO ACTUAL: rampa lineal con clamp duro (idéntico a lib/riskScore.js → lin())
const lin = (v, at0, at100) => clamp(((v - at0) / (at100 - at0)) * 100, 0, 100);

// MÉTODO NUEVO: z robusto (centro = ancla absoluta, escala = MAD rodante) + logística
const logistic = (z, k) => 100 / (1 + Math.exp(-k * z));
function subDynamic(x, window, anchor, sign) {
  const scale = madScale(window) || 1e-9;
  const z = (x - anchor) / scale;
  return logistic(sign * z, K_LOGIT);
}

// ── 3. Definición de señales (réplica EXACTA de los pesos/umbrales actuales) ──
// sign: +1 si "más alto = más risk-on"; -1 si inversa.  kind: 'level' | 'ret'
const SIGNALS = [
  { key: "vix",    w: 20, at0: 28,  at100: 12,  sign: -1, kind: "level", anchor: ANCHOR.vix },
  { key: "mxn",    w: 18, at0: 0.5, at100: -0.5, sign: -1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "spx",    w: 15, at0: -1,  at100: 1,   sign: +1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "mxnvol", w: 10, at0: 14,  at100: 6,   sign: -1, kind: "level", anchor: ANCHOR.mxnvol },
  { key: "move",   w: 8,  at0: 140, at100: 60,  sign: -1, kind: "level", anchor: ANCHOR.move },
  { key: "btc",    w: 7,  at0: -3,  at100: 3,   sign: +1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "gold",   w: 5,  at0: 1,   at100: -1,  sign: -1, kind: "ret",  anchor: ANCHOR.ret },
];
// Señales lentas: CONSTANTES e idénticas en ambos métodos (cancelan en la comparación).
const SLOW = [
  { key: "carry", w: 10, at0: 0,    at100: 7,   value: 5.5 },  // Banxico-Fed ~5.5pp
  { key: "curve", w: 7,  at0: -0.5, at100: 1.0, value: 0.3 },  // 2s10s ~+0.3
];
const SLOW_SUB = SLOW.map((s) => ({ w: s.w, sub: lin(s.value, s.at0, s.at100) }));
const SLOW_W = SLOW.reduce((a, s) => a + s.w, 0);
const SLOW_WEIGHTED = SLOW_SUB.reduce((a, s) => a + s.sub * s.w, 0);

const BANDS = [
  { max: 25, key: "RISK-OFF" }, { max: 50, key: "DEFENSIVE" },
  { max: 75, key: "CONSTRUCTIVE" }, { max: 100, key: "RISK-ON" },
];
const band = (score) => (BANDS.find((b) => score <= b.max) ?? BANDS[3]).key;

// Vol realizada anualizada (%) de USD/MXN sobre los últimos `n` retornos log diarios
function realizedVol(logrets, n = 21) {
  const w = logrets.slice(-n);
  if (w.length < 6) return null;
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const varr = w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1);
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

// ── 4. Main ──────────────────────────────────────────────────────────────────
const SYMBOLS = {
  vix: "^VIX", move: "^MOVE", mxn: "MXN=X", spx: "^GSPC", btc: "BTC-USD", gold: "GC=F",
};

console.log("Descargando 2 años de historia diaria de Yahoo…");
const maps = {};
for (const [k, sym] of Object.entries(SYMBOLS)) {
  maps[k] = await fetchDaily(sym);
  console.log(`  ✓ ${sym.padEnd(8)} ${maps[k].size} días`);
}

// Timeline maestro = días hábiles de EE.UU. (^GSPC). Para cada símbolo, carry-forward.
const dates = [...maps.spx.keys()].sort();
const ff = (map, date, last) => map.get(date) ?? last;

// Construye series alineadas de NIVELES y RETORNOS diarios
const lvl = { vix: [], move: [], mxnPrice: [], spx: [], btc: [], gold: [] };
const last = {};
for (const d of dates) {
  last.vix = ff(maps.vix, d, last.vix);
  last.move = ff(maps.move, d, last.move);
  last.mxn = ff(maps.mxn, d, last.mxn);
  last.spx = ff(maps.spx, d, last.spx);
  last.btc = ff(maps.btc, d, last.btc);
  last.gold = ff(maps.gold, d, last.gold);
  lvl.vix.push(last.vix); lvl.move.push(last.move); lvl.mxnPrice.push(last.mxn);
  lvl.spx.push(last.spx); lvl.btc.push(last.btc); lvl.gold.push(last.gold);
}

// Retornos diarios (%) y log-retornos de MXN para vol realizada
const pctChg = (arr, i) => (i > 0 && arr[i - 1] ? ((arr[i] - arr[i - 1]) / arr[i - 1]) * 100 : null);
const series = dates.map((d, i) => {
  const mxnVol = (() => {
    const lr = [];
    for (let j = Math.max(1, i - 30); j <= i; j++) {
      if (lvl.mxnPrice[j] && lvl.mxnPrice[j - 1]) lr.push(Math.log(lvl.mxnPrice[j] / lvl.mxnPrice[j - 1]));
    }
    return realizedVol(lr, 21);
  })();
  return {
    date: d,
    vix: lvl.vix[i],
    move: lvl.move[i],
    mxnvol: mxnVol,
    mxn: pctChg(lvl.mxnPrice, i),   // usdmxnChg %
    spx: pctChg(lvl.spx, i),
    btc: pctChg(lvl.btc, i),
    gold: pctChg(lvl.gold, i),
  };
});

// Para MAD rodante necesitamos, por señal, su serie de insumos (nivel o retorno)
const inputSeries = {};
for (const s of SIGNALS) inputSeries[s.key] = series.map((r) => r[s.key]);

// ── 5. Calcular ambos índices por día ────────────────────────────────────────
const rows = [];
const clipCount = Object.fromEntries(SIGNALS.map((s) => [s.key, 0]));
let clipDenom = 0;

for (let i = WARMUP; i < series.length; i++) {
  const r = series[i];

  // --- ACTUAL ---
  let curNum = SLOW_WEIGHTED, curW = SLOW_W;
  const curSubs = {};
  for (const s of SIGNALS) {
    const v = r[s.key];
    if (v == null || isNaN(v)) continue;
    const sub = lin(v, s.at0, s.at100);
    curSubs[s.key] = sub;
    curNum += sub * s.w; curW += s.w;
    clipDenom += 0; // contado abajo una sola vez
    if (sub === 0 || sub === 100) clipCount[s.key]++;
  }
  const curScore = Math.round(curNum / curW);

  // --- NUEVO (z robusto + logística) ---
  let newNum = SLOW_WEIGHTED, newW = SLOW_W;
  const newSubs = {};
  for (const s of SIGNALS) {
    const v = r[s.key];
    if (v == null || isNaN(v)) continue;
    const window = inputSeries[s.key].slice(i - N_WINDOW, i).filter((x) => x != null && !isNaN(x));
    if (window.length < 20) { // sin ventana suficiente, cae a la rampa actual
      newSubs[s.key] = curSubs[s.key]; newNum += curSubs[s.key] * s.w; newW += s.w; continue;
    }
    const sub = subDynamic(v, window, s.anchor, s.sign);
    newSubs[s.key] = sub;
    newNum += sub * s.w; newW += s.w;
  }
  const newScore = Math.round(newNum / newW);

  clipDenom++;
  rows.push({ date: r.date, curScore, newScore, r, curSubs, newSubs });
}

// ── 6. Resumen comparativo ───────────────────────────────────────────────────
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const q = (p) => s[Math.floor(p * (s.length - 1))];
  return { mean, sd, min: s[0], max: s[s.length - 1], p05: q(0.05), p50: q(0.5), p95: q(0.95) };
};
const cur = stats(rows.map((r) => r.curScore));
const neu = stats(rows.map((r) => r.newScore));
const diffs = rows.map((r) => r.newScore - r.curScore);
const corr = (() => {
  const a = rows.map((r) => r.curScore), b = rows.map((r) => r.newScore);
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
})();

const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(1)]));

console.log("\n" + "═".repeat(70));
console.log(`BACKTEST  ·  ${rows.length} días hábiles  ·  ${rows[0].date} → ${rows[rows.length - 1].date}`);
console.log("═".repeat(70));

console.log("\n▸ DISTRIBUCIÓN DEL SCORE FINAL");
console.table({ ACTUAL: fmt(cur), NUEVO: fmt(neu) });
console.log(`  Correlación actual↔nuevo: ${corr.toFixed(3)}`);
console.log(`  Diferencia (nuevo−actual): media ${(diffs.reduce((a,b)=>a+b,0)/diffs.length).toFixed(1)}, ` +
  `máx +${Math.max(...diffs)}, mín ${Math.min(...diffs)}`);

console.log("\n▸ FRECUENCIA DE CLIPPING (método ACTUAL: sub-score == 0 o 100)");
const clipTable = {};
for (const s of SIGNALS) clipTable[s.key] = { "% días clip": +(100 * clipCount[s.key] / clipDenom).toFixed(1), "peso %": s.w };
console.table(clipTable);

console.log("\n▸ DISTRIBUCIÓN POR BANDA (nº de días)");
const bandCount = (key) => {
  const c = { "RISK-OFF": 0, DEFENSIVE: 0, CONSTRUCTIVE: 0, "RISK-ON": 0 };
  rows.forEach((r) => c[band(r[key])]++);
  return c;
};
console.table({ ACTUAL: bandCount("curScore"), NUEVO: bandCount("newScore") });

console.log("\n▸ SENSIBILIDAD EN COLAS — 8 días con mayor |movimiento USD/MXN|");
const extreme = [...rows].sort((a, b) => Math.abs(b.r.mxn) - Math.abs(a.r.mxn)).slice(0, 8);
console.table(extreme.map((r) => ({
  fecha: r.date,
  "USDMXN %": +r.r.mxn.toFixed(2),
  "sub MXN ACTUAL": Math.round(r.curSubs.mxn),
  "sub MXN NUEVO": Math.round(r.newSubs.mxn),
  "score ACTUAL": r.curScore,
  "score NUEVO": r.newScore,
})));

console.log("\n▸ RECALIBRACIÓN DE BANDAS (quantile-matching: preserva la proporción histórica)");
// Los cortes actuales 25/50/75 corresponden a ciertos percentiles del índice
// ACTUAL; aplicamos esos MISMOS percentiles a la distribución NUEVA → cortes
// nuevos que dejan la misma fracción de días en cada banda.
const curScores = rows.map((r) => r.curScore);
const newScores = rows.map((r) => r.newScore);
const sortedCur = [...curScores].sort((a, b) => a - b);
const sortedNew = [...newScores].sort((a, b) => a - b);
const pctOf = (sorted, val) => sorted.filter((x) => x <= val).length / sorted.length;
const valAt = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
const recal = [25, 50, 75].map((c) => {
  const p = pctOf(sortedCur, c);
  return { corteActual: c, percentil: +(100 * p).toFixed(1), corteNuevo: valAt(sortedNew, p) };
});
console.table(recal);
const newCuts = recal.map((r) => r.corteNuevo);
console.log(`  → Cortes recalibrados para el método NUEVO: ` +
  `RISK-OFF ≤${newCuts[0]} · DEFENSIVE ≤${newCuts[1]} · CONSTRUCTIVE ≤${newCuts[2]} · RISK-ON >${newCuts[2]}`);
const bandRecal = (score) =>
  score <= newCuts[0] ? "RISK-OFF" : score <= newCuts[1] ? "DEFENSIVE" : score <= newCuts[2] ? "CONSTRUCTIVE" : "RISK-ON";
const cRecal = { "RISK-OFF": 0, DEFENSIVE: 0, CONSTRUCTIVE: 0, "RISK-ON": 0 };
rows.forEach((r) => cRecal[bandRecal(r.newScore)]++);
console.log("  Distribución por banda con cortes recalibrados:");
console.table({ "ACTUAL (cortes 25/50/75)": bandCount("curScore"), "NUEVO (cortes recalibrados)": cRecal });

// ── 7. CSV completo ──────────────────────────────────────────────────────────
const header = "date,curScore,newScore,usdmxnChg,spxChg,vix,subMXN_cur,subMXN_new,subSPX_cur,subSPX_new\n";
const csv = header + rows.map((r) =>
  [r.date, r.curScore, r.newScore, r.r.mxn?.toFixed(3) ?? "", r.r.spx?.toFixed(3) ?? "", r.r.vix?.toFixed(2) ?? "",
   Math.round(r.curSubs.mxn ?? 0), Math.round(r.newSubs.mxn ?? 0),
   Math.round(r.curSubs.spx ?? 0), Math.round(r.newSubs.spx ?? 0)].join(",")
).join("\n");
writeFileSync(OUT_CSV, csv);
console.log(`\n✓ CSV completo: ${OUT_CSV}`);
console.log(`  Parámetros nuevo método: N_WINDOW=${N_WINDOW}, k=${K_LOGIT}, anclas=${JSON.stringify(ANCHOR)}`);

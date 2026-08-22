// scripts/calibrate-scale-floor.mjs
// Calibración del PISO DE ESCALA para señales de NIVEL + validación predictiva.
//
// Problema (detectado 2026-07-13): para señales de nivel (MOVE, MXN vol, VIX)
// el método dinámico usa escala = MAD rodante de 60 días, que mide la
// ESTABILIDAD reciente y no la distancia plausible al ancla de largo plazo.
// En regímenes tranquilos lejos del ancla el z explota y la logística satura
// (MOVE clavado en sub 100 desde 2026-06-25: z=-9.2 con MAD60=3.3).
//
// Fix propuesto: escala = max(MAD60, PISO) donde PISO = MAD de TODA la
// historia (5 años) de la serie — la dispersión estructural del nivel.
// El MAD rodante sigue mandando en pánico (crece por encima del piso).
//
// Este script: (1) calcula los pisos, (2) compara OLD (rampa fija) / PROD
// (método en producción) / FLOOR (propuesto) en saturación y distribución,
// (3) re-calibra cortes de banda por quantile-matching, y (4) VALIDA la
// capacidad predictiva de cada método contra el retorno forward del USD/MXN
// a 1/5/10 días (IC de Spearman + retornos promedio por banda + hit rate).
//
// Uso: node scripts/calibrate-scale-floor.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const N_WINDOW = 60, K_LOGIT = 1.1, WARMUP = 60;
const ANCHOR = { vix: 17.5, move: 100, mxnvol: 9, ret: 0 };

async function fetchDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      if (!r) throw new Error("no result");
      const ts = r.timestamp ?? [], closes = r.indicators?.quote?.[0]?.close ?? [];
      // La fecha de la barra es la LOCAL de la bolsa, no la UTC. Yahoo estampa
      // MXN=X en Europe/London (abre 23:00 UTC) → sin gmtoffset TODA la serie del
      // peso queda etiquetada un día ANTES contra la rejilla de ^GSPC, y las
      // ventanas fwd5 salen corridas una sesión. Es el mismo bug que
      // lib/forwardReturns.js:29 corrigió el 2026-07-31 y que nunca se propagó a
      // los scripts de backtest (auditoría 2026-08-21). Sin esto, la banda
      // RISK-OFF "acierta" 76% en vez de 58.3%.
      const off = r.meta?.gmtoffset ?? 0;
      const map = new Map();
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (c == null || isNaN(c)) continue;
        map.set(new Date((ts[i] + off) * 1000).toISOString().slice(0, 10), c);
      }
      return map;
    } catch (e) {
      if (attempt === 2) { console.error(`  ✗ ${symbol}: ${e.message}`); return new Map(); }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const madScale = (w) => { const m = median(w); return 1.4826 * median(w.map((v) => Math.abs(v - m))); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lin = (v, at0, at100) => clamp(((v - at0) / (at100 - at0)) * 100, 0, 100);
const logistic = (z, k) => 100 / (1 + Math.exp(-k * z));

// Spearman: Pearson sobre rangos (empates → rango promedio)
function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const spearman = (a, b) => pearson(ranks(a), ranks(b));
const tStat = (ic, n) => ic * Math.sqrt((n - 2) / (1 - ic * ic));

const SIGNALS = [
  { key: "vix",    w: 20, at0: 28,  at100: 12,  sign: -1, kind: "level", anchor: ANCHOR.vix },
  { key: "mxn",    w: 18, at0: 0.5, at100: -0.5, sign: -1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "spx",    w: 15, at0: -1,  at100: 1,   sign: +1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "mxnvol", w: 10, at0: 14,  at100: 6,   sign: -1, kind: "level", anchor: ANCHOR.mxnvol },
  { key: "move",   w: 8,  at0: 140, at100: 60,  sign: -1, kind: "level", anchor: ANCHOR.move },
  { key: "btc",    w: 7,  at0: -3,  at100: 3,   sign: +1, kind: "ret",  anchor: ANCHOR.ret },
  { key: "gold",   w: 5,  at0: 1,   at100: -1,  sign: -1, kind: "ret",  anchor: ANCHOR.ret },
];
const SLOW = [
  { key: "carry", w: 10, at0: 0, at100: 7, value: 5.5 },
  { key: "curve", w: 7, at0: -0.5, at100: 1.0, value: 0.3 },
];
const SLOW_W = SLOW.reduce((a, s) => a + s.w, 0);
const SLOW_WEIGHTED = SLOW.reduce((a, s) => a + lin(s.value, s.at0, s.at100) * s.w, 0);

function realizedVol(logrets, n = 21) {
  const w = logrets.slice(-n);
  if (w.length < 6) return null;
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const varr = w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1);
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

// ── 1. Datos ──────────────────────────────────────────────────────────────────
const SYMBOLS = { vix: "^VIX", move: "^MOVE", mxn: "MXN=X", spx: "^GSPC", btc: "BTC-USD", gold: "GC=F" };
console.log("Descargando 5 años de historia diaria…");
const maps = {};
for (const [k, sym] of Object.entries(SYMBOLS)) {
  maps[k] = await fetchDaily(sym);
  console.log(`  ✓ ${sym.padEnd(8)} ${maps[k].size} días`);
}
const dates = [...maps.spx.keys()].sort();
const ff = (map, d, last) => map.get(d) ?? last;
const lvl = { vix: [], move: [], mxnPrice: [], spx: [], btc: [], gold: [] };
const last = {};
for (const d of dates) {
  last.vix = ff(maps.vix, d, last.vix); last.move = ff(maps.move, d, last.move);
  last.mxn = ff(maps.mxn, d, last.mxn); last.spx = ff(maps.spx, d, last.spx);
  last.btc = ff(maps.btc, d, last.btc); last.gold = ff(maps.gold, d, last.gold);
  lvl.vix.push(last.vix); lvl.move.push(last.move); lvl.mxnPrice.push(last.mxn);
  lvl.spx.push(last.spx); lvl.btc.push(last.btc); lvl.gold.push(last.gold);
}
const pctChg = (arr, i) => (i > 0 && arr[i - 1] ? ((arr[i] - arr[i - 1]) / arr[i - 1]) * 100 : null);
const series = dates.map((d, i) => {
  const lr = [];
  for (let j = Math.max(1, i - 30); j <= i; j++) {
    if (lvl.mxnPrice[j] && lvl.mxnPrice[j - 1]) lr.push(Math.log(lvl.mxnPrice[j] / lvl.mxnPrice[j - 1]));
  }
  return {
    date: d, vix: lvl.vix[i], move: lvl.move[i], mxnvol: realizedVol(lr, 21),
    mxn: pctChg(lvl.mxnPrice, i), spx: pctChg(lvl.spx, i), btc: pctChg(lvl.btc, i), gold: pctChg(lvl.gold, i),
  };
});
const inputSeries = {};
for (const s of SIGNALS) inputSeries[s.key] = series.map((r) => r[s.key]);

// ── 2. PISOS: MAD de toda la historia por señal de nivel ─────────────────────
console.log("\n▸ CALIBRACIÓN DE PISOS (MAD de 5 años del nivel)");
const FLOORS = {};
for (const s of SIGNALS.filter((x) => x.kind === "level")) {
  const all = inputSeries[s.key].filter((x) => x != null && !isNaN(x));
  FLOORS[s.key] = madScale(all);
  console.log(`  ${s.key.padEnd(7)} mediana ${median(all).toFixed(1).padStart(6)} · MAD5y (piso) ${FLOORS[s.key].toFixed(2)}`);
}

// ── 3. Los tres métodos por día ───────────────────────────────────────────────
const rows = [];
for (let i = WARMUP; i < series.length; i++) {
  const r = series[i];
  const make = (mode) => {
    let num = SLOW_WEIGHTED, W = SLOW_W;
    const subs = {};
    for (const s of SIGNALS) {
      const v = r[s.key];
      if (v == null || isNaN(v)) continue;
      let sub;
      if (mode === "old") sub = lin(v, s.at0, s.at100);
      else {
        const w = inputSeries[s.key].slice(i - N_WINDOW, i).filter((x) => x != null && !isNaN(x));
        if (w.length < 20) sub = lin(v, s.at0, s.at100);
        else {
          let scale = madScale(w) || 1e-9;
          if (mode === "floor" && FLOORS[s.key]) scale = Math.max(scale, FLOORS[s.key]);
          sub = logistic(s.sign * ((v - s.anchor) / scale), K_LOGIT);
        }
      }
      subs[s.key] = sub; num += sub * s.w; W += s.w;
    }
    return { score: Math.round(num / W), subs };
  };
  rows.push({ date: r.date, i, r, old: make("old"), prod: make("prod"), floor: make("floor") });
}

// ── 4. Saturación por señal (sub ≥95 o ≤5): PROD vs FLOOR ────────────────────
console.log("\n▸ % DE DÍAS SATURADOS POR SEÑAL (sub ≥95 o ≤5)");
const satTable = {};
for (const s of SIGNALS) {
  const pct = (key) => 100 * rows.filter((r) => r[key].subs[s.key] >= 95 || r[key].subs[s.key] <= 5).length / rows.length;
  satTable[s.key] = { "PROD %": +pct("prod").toFixed(1), "FLOOR %": +pct("floor").toFixed(1), peso: s.w, tipo: s.kind };
}
console.table(satTable);

// ── 5. Bandas: quantile-matching FLOOR contra los cortes PROD 29/48/72 ───────
const sortedProd = rows.map((r) => r.prod.score).sort((a, b) => a - b);
const sortedFloor = rows.map((r) => r.floor.score).sort((a, b) => a - b);
const pctOf = (sorted, val) => sorted.filter((x) => x <= val).length / sorted.length;
const valAt = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
console.log("\n▸ CORTES DE BANDA (quantile-matching sobre los cortes en producción 29/48/72)");
const recal = [29, 48, 72].map((c) => {
  const p = pctOf(sortedProd, c);
  return { cortePROD: c, percentil: +(100 * p).toFixed(1), corteFLOOR: valAt(sortedFloor, p) };
});
console.table(recal);
const CUTS = recal.map((r) => r.corteFLOOR);
const bandOf = (score) => (score <= CUTS[0] ? "RISK-OFF" : score <= CUTS[1] ? "DEFENSIVE" : score <= CUTS[2] ? "CONSTRUCTIVE" : "RISK-ON");

// ── 6. VALIDACIÓN PREDICTIVA vs USD/MXN forward ──────────────────────────────
// fwd k días: retorno % del USD/MXN de i a i+k (negativo = peso se apreció).
const fwd = (i, k) => {
  const a = lvl.mxnPrice[i], b = lvl.mxnPrice[i + k];
  return a && b ? ((b - a) / a) * 100 : null;
};
console.log("\n▸ IC DE SPEARMAN — score hoy vs retorno USD/MXN forward (esperado NEGATIVO: score alto → peso se aprecia)");
const icTable = {};
for (const k of [1, 5, 10]) {
  const sample = rows.map((r) => ({ ...r, y: fwd(r.i, k) })).filter((r) => r.y != null);
  const row = {};
  for (const m of ["old", "prod", "floor"]) {
    const ic = spearman(sample.map((r) => r[m].score), sample.map((r) => r.y));
    row[`IC ${m}`] = +ic.toFixed(3);
  }
  // t-stat naive del FLOOR (ventanas >1d se traslapan → n efectivo menor; ver no-traslape abajo)
  const icF = spearman(sample.map((r) => r.floor.score), sample.map((r) => r.y));
  row["t(floor) naive"] = +tStat(icF, sample.length).toFixed(1);
  row.n = sample.length;
  icTable[`fwd ${k}d`] = row;
}
console.table(icTable);

// Robustez: muestras NO traslapadas para 5d (cada 5º día)
const nov = rows.filter((_, idx) => idx % 5 === 0).map((r) => ({ s: r.floor.score, y: fwd(r.i, 5) })).filter((r) => r.y != null);
const icNov = spearman(nov.map((r) => r.s), nov.map((r) => r.y));
console.log(`  Robustez fwd5 sin traslape (n=${nov.length}): IC floor ${icNov.toFixed(3)}, t ${tStat(icNov, nov.length).toFixed(1)}`);

// ── 7. Retornos forward promedio por banda (método FLOOR, cortes recalibrados) ─
console.log("\n▸ USD/MXN FORWARD PROMEDIO POR BANDA (método FLOOR — negativo = peso se apreció)");
const bandStats = {};
for (const b of ["RISK-OFF", "DEFENSIVE", "CONSTRUCTIVE", "RISK-ON"]) {
  const days = rows.filter((r) => bandOf(r.floor.score) === b);
  const f5 = days.map((r) => fwd(r.i, 5)).filter((x) => x != null);
  const f10 = days.map((r) => fwd(r.i, 10)).filter((x) => x != null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const hit = (a) => (a.length ? (100 * a.filter((x) => x < 0).length) / a.length : null);
  bandStats[b] = {
    "días": days.length,
    "fwd5 prom %": avg(f5) == null ? "—" : +avg(f5).toFixed(3),
    "fwd10 prom %": avg(f10) == null ? "—" : +avg(f10).toFixed(3),
    "% peso gana (5d)": hit(f5) == null ? "—" : +hit(f5).toFixed(0),
  };
}
const allF5 = rows.map((r) => fwd(r.i, 5)).filter((x) => x != null);
bandStats["(base 5y)"] = {
  "días": allF5.length,
  "fwd5 prom %": +(allF5.reduce((a, b) => a + b, 0) / allF5.length).toFixed(3),
  "fwd10 prom %": "",
  "% peso gana (5d)": +((100 * allF5.filter((x) => x < 0).length) / allF5.length).toFixed(0),
};
console.table(bandStats);

// ── 8. Hoy con cada método ────────────────────────────────────────────────────
const t = rows[rows.length - 1];
console.log(`\n▸ ÚLTIMO DÍA (${t.date}) — score OLD ${t.old.score} · PROD ${t.prod.score} · FLOOR ${t.floor.score}`);
console.log("  subs FLOOR:", Object.fromEntries(Object.entries(t.floor.subs).map(([k, v]) => [k, Math.round(v)])));
console.log("  subs PROD :", Object.fromEntries(Object.entries(t.prod.subs).map(([k, v]) => [k, Math.round(v)])));

// CSV
// Antes apuntaba al scratchpad de una sesión muerta: el CSV fallaba al escribir
// y la calibración no quedaba archivada (auditoría 2026-08-21).
const OUT_DIR = path.join(process.cwd(), "data", "backtest");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "calibrate-floor.csv");
writeFileSync(OUT, "date,old,prod,floor,fwd5\n" + rows.map((r) => [r.date, r.old.score, r.prod.score, r.floor.score, fwd(r.i, 5)?.toFixed(3) ?? ""].join(",")).join("\n"));
console.log(`\n✓ CSV: ${OUT}`);
console.log(`  PISOS calibrados: ${JSON.stringify(Object.fromEntries(Object.entries(FLOORS).map(([k, v]) => [k, +v.toFixed(2)])))}`);

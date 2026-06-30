// scripts/backtest-taindex.mjs
// Backtest PREDICTIVO del Índice Técnico Risk On (ITR). Valida si la DIRECCIÓN
// del índice (lib/taIndex.js, el MISMO código que corre en vivo) anticipa el
// retorno futuro, sobre 5 años de historia diaria y una canasta multi-activo.
//
// Métricas:
//   • IC (Spearman) score↔retorno futuro, por activo y promedio, h=5/10/20d.
//   • Deciles: retorno futuro estandarizado por decil de score (¿escalera?).
//   • Hit-rate por banda (Venta fuerte … Compra fuerte).
//   • Estrategia long/short por bandas → Sharpe/CAGR/maxDD vs buy&hold.
//   • Estabilidad: IC en la mitad vieja (in-sample) vs la reciente (OOS).
//
// La capa de CONVICCIÓN/eventos NO se valida aquí (eventImpact=0): esto aísla
// el poder direccional. Uso:  node scripts/backtest-taindex.mjs
import { buildDailyBundle, computeDirection, taBand } from "../lib/taIndex.js";

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HORIZONS = [5, 10, 20];
const WARMUP = 220;          // velas para EMA200 + pendiente
const STRATEGY_H = 1;        // la estrategia usa el retorno del día siguiente

const ASSETS = {
  "USD/MXN": "MXN=X", "S&P 500": "^GSPC", "Nasdaq": "^IXIC", "IPC México": "^MXX",
  "Oro": "GC=F", "WTI": "CL=F", "Bitcoin": "BTC-USD", "EUR/USD": "EURUSD=X",
  "Apple": "AAPL", "US 10Y": "^TNX",
};

// ── Descarga OHLC diario alineado ─────────────────────────────────────────────
async function fetchOHLC(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0] ?? {};
      const dates = [], closes = [], highs = [], lows = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close?.[i];
        if (c == null || isNaN(c)) continue;
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        closes.push(c); highs.push(q.high?.[i] ?? c); lows.push(q.low?.[i] ?? c);
      }
      return { dates, closes, highs, lows };
    } catch (e) {
      if (attempt === 2) { console.error(`  ✗ ${symbol}: ${e.message}`); return null; }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

// ── Estadística ───────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function rank(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avg = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) r[idx[k][1]] = avg;
    i = j;
  }
  return r;
}
function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
const spearman = (a, b) => pearson(rank(a), rank(b));

// ── 1. Descargar ──────────────────────────────────────────────────────────────
console.log("Descargando 5 años de historia diaria (Yahoo)…");
const data = {};
for (const [name, sym] of Object.entries(ASSETS)) {
  const d = await fetchOHLC(sym);
  if (d && d.closes.length > WARMUP + 30) { data[name] = d; console.log(`  ✓ ${name.padEnd(11)} ${d.closes.length} días`); }
  else console.log(`  ✗ ${name.padEnd(11)} insuficiente`);
}

// ── 2. Calcular score + retornos futuros por activo (sin lookahead) ───────────
// obs: { date, asset, score, band, fwd:{5,10,20}, nextRet }
const obs = [];
for (const [name, d] of Object.entries(data)) {
  const { dates, closes, highs, lows } = d;
  const maxH = Math.max(...HORIZONS);
  for (let t = WARMUP; t < closes.length - maxH; t++) {
    const bundle = buildDailyBundle(closes.slice(0, t + 1), highs.slice(0, t + 1), lows.slice(0, t + 1));
    if (!bundle) continue;
    const dir = computeDirection(bundle);
    const fwd = {};
    for (const h of HORIZONS) fwd[h] = (closes[t + h] / closes[t] - 1) * 100;
    obs.push({
      date: dates[t], asset: name, score: dir.score, band: taBand(dir.score).key,
      fwd, nextRet: (closes[t + STRATEGY_H] / closes[t] - 1) * 100,
    });
  }
  process.stdout.write(`  · ${name} procesado (${closes.length - WARMUP - maxH} obs)\n`);
}
console.log(`\nTotal observaciones: ${obs.length}`);

// ── 3. IC (Spearman) por activo y horizonte ───────────────────────────────────
console.log("\n" + "═".repeat(72));
console.log("▸ INFORMATION COEFFICIENT (Spearman score↔retorno futuro)");
console.log("═".repeat(72));
const icTable = {};
const icByH = { 5: [], 10: [], 20: [] };
for (const name of Object.keys(data)) {
  const rows = obs.filter((o) => o.asset === name);
  const row = {};
  for (const h of HORIZONS) {
    const ic = spearman(rows.map((o) => o.score), rows.map((o) => o.fwd[h]));
    row[`IC ${h}d`] = +ic.toFixed(3);
    icByH[h].push(ic);
  }
  icTable[name] = row;
}
console.table(icTable);
for (const h of HORIZONS) {
  const m = mean(icByH[h]);
  const t = (m / (std(icByH[h]) / Math.sqrt(icByH[h].length))).toFixed(2);
  console.log(`  IC medio ${h}d: ${m.toFixed(3)}   (t-stat ${t}, n=${icByH[h].length} activos)`);
}

// ── 4. Deciles: retorno futuro 10d estandarizado por activo, agrupado por score ─
console.log("\n▸ MONOTONICIDAD POR DECIL (retorno 10d estandarizado por activo)");
const H = 10;
// estandarizar fwd dentro de cada activo
const byAsset = {};
for (const o of obs) (byAsset[o.asset] ??= []).push(o);
const stdObs = [];
for (const rows of Object.values(byAsset)) {
  const f = rows.map((o) => o.fwd[H]); const m = mean(f), s = std(f) || 1;
  rows.forEach((o) => stdObs.push({ score: o.score, zfwd: (o.fwd[H] - m) / s, raw: o.fwd[H], band: o.band }));
}
const sortedByScore = [...stdObs].sort((a, b) => a.score - b.score);
const dec = {};
for (let i = 0; i < 10; i++) {
  const slice = sortedByScore.slice(i * sortedByScore.length / 10, (i + 1) * sortedByScore.length / 10);
  dec[`D${i + 1}`] = {
    "score medio": +mean(slice.map((o) => o.score)).toFixed(0),
    "fwd z": +mean(slice.map((o) => o.zfwd)).toFixed(3),
    "fwd % crudo": +mean(slice.map((o) => o.raw)).toFixed(2),
  };
}
console.table(dec);

// ── 5. Hit-rate por banda ─────────────────────────────────────────────────────
console.log("\n▸ HIT-RATE POR BANDA (retorno 10d)");
const bandStats = {};
for (const key of ["STRONG_SELL", "SELL", "NEUTRAL", "BUY", "STRONG_BUY"]) {
  const rows = obs.filter((o) => o.band === key);
  if (!rows.length) continue;
  bandStats[key] = {
    "n días": rows.length,
    "fwd medio %": +mean(rows.map((o) => o.fwd[H])).toFixed(2),
    "% positivos": +(100 * rows.filter((o) => o.fwd[H] > 0).length / rows.length).toFixed(0),
  };
}
console.table(bandStats);

// ── 6. Estrategias long/short (retorno del día siguiente) ─────────────────────
console.log("\n▸ ESTRATEGIAS (retorno del día siguiente, portafolio equiponderado)");
const sgnMom  = (o) => (o.score > 60 ? 1 : o.score < 40 ? -1 : 0);  // seguir
const sgnFade = (o) => -sgnMom(o);                                   // fadear (contrarian)
const byDate = {};
for (const o of obs) (byDate[o.date] ??= []).push(o);
const dts = Object.keys(byDate).sort();
const sharpe = (rets) => (mean(rets) * 252) / (std(rets) * Math.sqrt(252) || 1);
const yrs = dts.length / 252;
function runStrat(sgn) {
  let eq = 1, peak = 1, dd = 0; const rets = [];
  for (const dt of dts) {
    const r = mean(byDate[dt].map((o) => sgn(o) * o.nextRet)) / 100;
    rets.push(r); eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1);
  }
  return { "CAGR %": +(100 * (eq ** (1 / yrs) - 1)).toFixed(1), "Sharpe": +sharpe(rets).toFixed(2), "maxDD %": +(100 * dd).toFixed(1) };
}
const retsB = dts.map((dt) => mean(byDate[dt].map((o) => o.nextRet)) / 100);
console.table({
  "Seguir (score>60 largo)":   runStrat(sgnMom),
  "Fadear (score>60 corto)":   runStrat(sgnFade),
  "Buy & hold":                { "CAGR %": +(100 * ((retsB.reduce((a, r) => a * (1 + r), 1)) ** (1 / yrs) - 1)).toFixed(1), "Sharpe": +sharpe(retsB).toFixed(2), "maxDD %": "—" },
});

// Regime-aware: en cada activo, fadear si su IC histórico es negativo (rangueante)
// y seguir si es positivo (tendencial). Usa el IC 10d ya calculado por activo.
const assetIC = Object.fromEntries(Object.keys(data).map((name) => {
  const rows = obs.filter((o) => o.asset === name);
  return [name, spearman(rows.map((o) => o.score), rows.map((o) => o.fwd[10]))];
}));
const sgnRegime = (o) => (assetIC[o.asset] >= 0 ? sgnMom(o) : sgnFade(o));
console.log("  Regime-aware (seguir si IC>0, fadear si IC<0):");
console.table({ "Regime-aware": runStrat(sgnRegime) });
console.log("  Clasificación por activo:", Object.fromEntries(Object.entries(assetIC).map(([k, v]) => [k, v >= 0 ? "seguir" : "fadear"])));

// ── 7. Estabilidad: in-sample (mitad vieja) vs OOS (mitad reciente) ───────────
console.log("\n▸ ESTABILIDAD IC 10d — mitad vieja (IS) vs reciente (OOS)");
const allDates = [...new Set(obs.map((o) => o.date))].sort();
const splitDate = allDates[Math.floor(allDates.length / 2)];
const half = (recent) => {
  const ics = [];
  for (const name of Object.keys(data)) {
    const rows = obs.filter((o) => o.asset === name && (recent ? o.date >= splitDate : o.date < splitDate));
    if (rows.length > 30) ics.push(spearman(rows.map((o) => o.score), rows.map((o) => o.fwd[H])));
  }
  return mean(ics);
};
console.log(`  Split en ${splitDate}`);
console.log(`  IC medio 10d IN-SAMPLE (viejo): ${half(false).toFixed(3)}`);
console.log(`  IC medio 10d OUT-OF-SAMPLE   : ${half(true).toFixed(3)}`);
console.log("\n(IC>0 ⇒ score alto precede retorno alto. En TA, |IC| 0.03–0.06 con t-stat sólido ya es señal real.)");

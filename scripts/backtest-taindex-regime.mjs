// scripts/backtest-taindex-regime.mjs
// Research del ÍNDICE TÉCNICO regime-aware (causal, sin lookahead).
// Idea: el efecto direccional es CONTINUACIÓN en activos tendenciales y
// REVERSIÓN en rangueantes. Detectamos el régimen con ADX (que en el día t solo
// usa datos ≤ t) → seguir si ADX>umbral, fadear si no. Posición continua por
// convicción, costos de transacción, y split walk-forward IS/OOS.
//
//   pos_t = regime_t · (score_t − 50)/50      regime = +1 si ADX>TH, −1 si no
//   P&L_t = pos_t · ret_{t+1} − costo·|Δpos|
//
// Uso: node scripts/backtest-taindex-regime.mjs
import { buildDailyBundle, computeDirection } from "../lib/taIndex.js";

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const WARMUP = 220;
const ADX_TH = 22;          // umbral de régimen (fijo y estándar → sin tuning)
const COST_BPS = 2;         // costo por unidad de turnover (2 pb)

const ASSETS = {
  "USD/MXN": "MXN=X", "S&P 500": "^GSPC", "Nasdaq": "^IXIC", "IPC México": "^MXX",
  "Oro": "GC=F", "WTI": "CL=F", "Bitcoin": "BTC-USD", "EUR/USD": "EURUSD=X",
  "Apple": "AAPL", "US 10Y": "^TNX",
};

async function fetchOHLC(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json())?.chart?.result?.[0];
      const ts = r?.timestamp ?? [], q = r?.indicators?.quote?.[0] ?? {};
      const dates = [], closes = [], highs = [], lows = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close?.[i]; if (c == null || isNaN(c)) continue;
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        closes.push(c); highs.push(q.high?.[i] ?? c); lows.push(q.low?.[i] ?? c);
      }
      return { dates, closes, highs, lows };
    } catch (e) { if (a === 2) { console.error(`  ✗ ${symbol}: ${e.message}`); return null; } await new Promise((r) => setTimeout(r, 800)); }
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const sharpe = (r) => r.length ? (mean(r) * 252) / (std(r) * Math.sqrt(252) || 1) : 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Descargar + construir series por activo (score, adx, nextRet) ─────────────
console.log("Descargando 5 años…");
const series = {};   // asset -> [{date, score, adx, nextRet}]
for (const [name, sym] of Object.entries(ASSETS)) {
  const d = await fetchOHLC(sym);
  if (!d || d.closes.length < WARMUP + 30) { console.log(`  ✗ ${name}`); continue; }
  const { dates, closes, highs, lows } = d;
  const rows = [];
  for (let t = WARMUP; t < closes.length - 1; t++) {
    const b = buildDailyBundle(closes.slice(0, t + 1), highs.slice(0, t + 1), lows.slice(0, t + 1));
    if (!b || b.adx == null) continue;
    rows.push({ date: dates[t], score: computeDirection(b).score, adx: b.adx, nextRet: closes[t + 1] / closes[t] - 1 });
  }
  series[name] = rows;
  console.log(`  ✓ ${name.padEnd(11)} ${rows.length} días`);
}

// ── Estrategias (posición causal, por activo) ─────────────────────────────────
const STRATS = {
  "Seguir":            (r) => (r.score - 50) / 50,
  "Fadear":            (r) => -(r.score - 50) / 50,
  "Regime L/S":        (r) => (r.adx > ADX_TH ? 1 : -1) * (r.score - 50) / 50,
  "Regime long-only":  (r) => Math.max(0, (r.adx > ADX_TH ? 1 : -1) * (r.score - 50) / 50),
};

// Construye P&L diario equiponderado entre activos, con costos de turnover.
function backtest(stratFn, filterFn = () => true) {
  const byDate = {};
  for (const [name, rows] of Object.entries(series)) {
    let prevPos = 0;
    for (const r of rows) {
      if (!filterFn(r.date)) { prevPos = stratFn(r); continue; }
      const pos = clamp(stratFn(r), -1, 1);
      const turnover = Math.abs(pos - prevPos);
      const pnl = pos * r.nextRet - turnover * COST_BPS / 10000;
      (byDate[r.date] ??= []).push(pnl);
      prevPos = pos;
    }
  }
  const dts = Object.keys(byDate).sort();
  const rets = dts.map((d) => mean(byDate[d]));
  let eq = 1, peak = 1, dd = 0;
  for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const yrs = rets.length / 252;
  return { sharpe: +sharpe(rets).toFixed(2), cagr: +(100 * (eq ** (1 / yrs) - 1)).toFixed(1), maxDD: +(100 * dd).toFixed(1), n: rets.length };
}

// Buy & hold equiponderado de referencia
function buyhold(filterFn = () => true) {
  const byDate = {};
  for (const rows of Object.values(series)) for (const r of rows) if (filterFn(r.date)) (byDate[r.date] ??= []).push(r.nextRet);
  const rets = Object.keys(byDate).sort().map((d) => mean(byDate[d]));
  let eq = 1; for (const r of rets) eq *= 1 + r;
  return { sharpe: +sharpe(rets).toFixed(2), cagr: +(100 * (eq ** (252 / rets.length) - 1)).toFixed(1), maxDD: "—", n: rets.length };
}

// Split walk-forward
const allDates = [...new Set(Object.values(series).flat().map((r) => r.date))].sort();
const splitDate = allDates[Math.floor(allDates.length / 2)];
const isOld = (d) => d < splitDate, isNew = (d) => d >= splitDate;

console.log("\n" + "═".repeat(74));
console.log(`▸ ESTRATEGIAS — full sample  (ADX_TH=${ADX_TH}, costo=${COST_BPS}pb, equiponderado)`);
console.log("═".repeat(74));
const full = {};
for (const [name, fn] of Object.entries(STRATS)) full[name] = backtest(fn);
full["Buy & hold"] = buyhold();
console.table(full);

console.log(`\n▸ WALK-FORWARD  (split ${splitDate})`);
const wf = {};
for (const [name, fn] of Object.entries(STRATS)) {
  wf[name] = { "Sharpe IS": backtest(fn, isOld).sharpe, "Sharpe OOS": backtest(fn, isNew).sharpe };
}
wf["Buy & hold"] = { "Sharpe IS": buyhold(isOld).sharpe, "Sharpe OOS": buyhold(isNew).sharpe };
console.table(wf);

console.log("\n▸ SENSIBILIDAD AL UMBRAL ADX (Regime L/S, full sample)");
const sens = {};
for (const th of [15, 18, 22, 25, 30]) {
  const fn = (r) => (r.adx > th ? 1 : -1) * (r.score - 50) / 50;
  sens[`ADX>${th}`] = backtest(fn);
}
console.table(sens);

console.log("\n▸ SHARPE POR ACTIVO (Regime L/S, full sample)");
const perAsset = {};
for (const [name, rows] of Object.entries(series)) {
  let prevPos = 0, eq = 1; const rets = [];
  for (const r of rows) {
    const pos = clamp((r.adx > ADX_TH ? 1 : -1) * (r.score - 50) / 50, -1, 1);
    rets.push(pos * r.nextRet - Math.abs(pos - prevPos) * COST_BPS / 10000); prevPos = pos;
  }
  perAsset[name] = { Sharpe: +sharpe(rets).toFixed(2), "% tendencia": +(100 * rows.filter((r) => r.adx > ADX_TH).length / rows.length).toFixed(0) };
}
console.table(perAsset);
console.log("\n(OOS es el número que vale. Si Regime L/S no supera buy&hold OOS con costos, no es 'más cabrón' todavía.)");

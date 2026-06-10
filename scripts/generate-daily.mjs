// scripts/generate-daily.mjs
// Genera el borrador del día en /content a partir de datos de mercado en vivo
// (mismas fuentes que app/api/market/route.js): Yahoo Finance + Frankfurter.
// Calcula score del índice Risk On, soporte/resistencia USD/MXN y deja
// listos title/summary/watch como placeholders para editar a mano.
//
// Uso: node scripts/generate-daily.mjs
// Pensado para correr vía GitHub Actions todos los días 7am hora CDMX.

import fs from "fs";
import path from "path";

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta ?? {};
    const rawQuote = result.indicators?.quote?.[0] ?? {};
    const closes = [], highs = [], lows = [];
    const rawC = rawQuote.close ?? [], rawH = rawQuote.high ?? [], rawL = rawQuote.low ?? [];
    for (let i = 0; i < rawC.length; i++) {
      const c = rawC[i];
      if (c == null || isNaN(c)) continue;
      closes.push(c);
      highs.push(rawH[i] ?? c);
      lows.push(rawL[i] ?? c);
    }
    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;

    let chgPct = null;
    if (closes.length >= 2) {
      const prev = closes[closes.length - 2];
      const last = closes[closes.length - 1];
      if (prev) chgPct = ((last - prev) / prev) * 100;
    }
    return { price, chgPct, closes, highs, lows };
  } catch {
    return null;
  }
}

function rollingLevels(highs, lows, period = 10) {
  if (!highs?.length || !lows?.length || highs.length < 2) return null;
  const n = Math.min(period, highs.length);
  return {
    support:    Math.round(Math.min(...lows.slice(-n))  * 10000) / 10000,
    resistance: Math.round(Math.max(...highs.slice(-n)) * 10000) / 10000,
  };
}

function realizedVol(closes) {
  if (!closes || closes.length < 6) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

async function fxRate(base, quote) {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
    const d = await res.json();
    return d?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

// ── Risk index (mirrors lib/riskIndex.js) ──────────────────────────────────
const WEIGHTS = { vix: 0.35, dxy: 0.22, move: 0.18, us10y: 0.15, mxn: 0.10 };
const RANGES = {
  vix:   { calm: 12,  panic: 35  },
  move:  { calm: 70,  panic: 140 },
  dxy:   { weak: 99,  strong: 108 },
  mxn:   { calm: 7,   panic: 16  },
  us10y: { calm: 3.5, panic: 5.0 },
};
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const fearGauge = (v, calm, panic) => clamp(100 - ((v - calm) / (panic - calm)) * 100);
const dollarGauge = (v, weak, strong) => clamp(100 - ((v - weak) / (strong - weak)) * 100);

function computeScore({ vix, move, dxy, mxnVol, us10y }) {
  const comp = {
    vix:   fearGauge(vix, RANGES.vix.calm, RANGES.vix.panic),
    move:  fearGauge(move, RANGES.move.calm, RANGES.move.panic),
    dxy:   dollarGauge(dxy, RANGES.dxy.weak, RANGES.dxy.strong),
    mxn:   fearGauge(mxnVol, RANGES.mxn.calm, RANGES.mxn.panic),
    us10y: fearGauge(us10y ?? 4.3, RANGES.us10y.calm, RANGES.us10y.panic),
  };
  return Math.round(
    comp.vix * WEIGHTS.vix + comp.dxy * WEIGHTS.dxy + comp.move * WEIGHTS.move +
    comp.us10y * WEIGHTS.us10y + comp.mxn * WEIGHTS.mxn
  );
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const SYMBOLS = {
    vix: "^VIX", move: "^MOVE", dxy: "DX-Y.NYB", us10y: "^TNX",
    usdmxnChart: "MXN=X",
  };
  const keys = Object.keys(SYMBOLS);
  const [charts, usdmxn] = await Promise.all([
    Promise.all(keys.map((k) => yahooChart(SYMBOLS[k]))),
    fxRate("USD", "MXN"),
  ]);
  const c = {};
  keys.forEach((key, i) => { c[key] = charts[i] ?? {}; });

  const vix    = c.vix?.price    ?? 13.4;
  const move   = c.move?.price   ?? 98;
  const dxy    = c.dxy?.price    ?? 104.3;
  const us10y  = c.us10y?.price  ?? 4.3;
  const mxnVol = realizedVol(c.usdmxnChart?.closes) ?? 9.1;
  const levels = rollingLevels(c.usdmxnChart?.highs, c.usdmxnChart?.lows);

  const score = computeScore({ vix, move, dxy, mxnVol, us10y });
  const usdmxnPrice = usdmxn ?? c.usdmxnChart?.price ?? null;

  // Fecha de hoy en zona horaria de Ciudad de México (UTC-6 fijo desde 2022)
  const now = new Date();
  const cdmx = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);

  const dir = path.join(process.cwd(), "content");
  const file = path.join(dir, `${cdmx}.md`);

  if (fs.existsSync(file)) {
    console.log(`${file} ya existe — no se sobreescribe.`);
    return;
  }

  const fm = [
    "---",
    `date: "${cdmx}"`,
    `title_es: "TODO — titulo del dia"`,
    `title_en: "TODO — today's title"`,
    `score: ${score}`,
    `summary_es: "TODO — resumen de una linea"`,
    `summary_en: "TODO — one-line summary"`,
    `support: ${levels?.support ?? "null"}`,
    `resistance: ${levels?.resistance ?? "null"}`,
    "watch_es:",
    `  - "TODO"`,
    "watch_en:",
    `  - "TODO"`,
    "---",
    "",
    "<!-- Datos auto-generados:",
    `VIX ${vix?.toFixed?.(1)} · MOVE ${Math.round(move)} · DXY ${dxy?.toFixed?.(2)} · US10Y ${us10y?.toFixed?.(2)}% · MXN vol ${mxnVol.toFixed(1)}%`,
    `USD/MXN ${usdmxnPrice?.toFixed?.(4) ?? "—"} · score ${score}`,
    "-->",
    "",
    "TODO — lead: una linea con el veredicto del dia, tono trader casual.",
    "",
    "### El dato",
    "",
    "TODO — que paso y por que importa.",
    "",
    "### El peso",
    "",
    "TODO — USD/MXN, niveles tecnicos, volatilidad.",
    "",
    "### Lectura del indice",
    "",
    "TODO — score y que lo esta moviendo.",
    "",
  ].join("\n");

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, fm);
  console.log(`Creado ${file}`);
}

main();

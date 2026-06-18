// app/api/country-risk/route.js
// Score de tensión 0-100 por país (0 = calma/verde, 100 = estrés/rojo), en vivo.
// Fuente: Yahoo Finance v8 chart (gratis). Para cada país EM se combina:
//   - volatilidad realizada de su divisa vs USD (riesgo estructural)
//   - depreciación reciente de la divisa (USD/local a 20d)
//   - caída reciente de su bolsa (20d)
// EE.UU. usa VIX + S&P 500. Si falta data de un país, cae al valor curado.

export const revalidate = 3600;

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// fx = par USD/local (sube = divisa local más débil = más tensión)
const COUNTRIES = [
  { id: "mx", fx: "MXN=X", eq: "^MXX",      fallback: 62 },
  { id: "br", fx: "BRL=X", eq: "^BVSP",     fallback: 65 },
  { id: "tr", fx: "TRY=X", eq: "XU100.IS",  fallback: 88 },
  { id: "cn", fx: "CNY=X", eq: "000001.SS", fallback: 70 },
  { id: "us", fx: null,    eq: "^GSPC",     vix: "^VIX", fallback: 48 },
];

async function closes(symbol) {
  if (!symbol) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" }, next: { revalidate } });
    if (!res.ok) return [];
    const r = (await res.json())?.chart?.result?.[0];
    return (r?.indicators?.quote?.[0]?.close ?? []).filter((c) => c != null && !isNaN(c));
  } catch {
    return [];
  }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const norm = (x, lo, hi) => clamp01((x - lo) / (hi - lo));

function chgPct(arr, n) {
  if (arr.length < n + 1) return null;
  const a = arr[arr.length - 1 - n], b = arr[arr.length - 1];
  return a ? ((b - a) / a) * 100 : null;
}

function realizedVol(arr) {
  if (arr.length < 6) return null;
  const rets = [];
  for (let i = 1; i < arr.length; i++) rets.push(Math.log(arr[i] / arr[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

async function tensionFor(c) {
  if (c.id === "us") {
    const [vix, spx] = await Promise.all([closes(c.vix), closes(c.eq)]);
    const vixLast = vix[vix.length - 1];
    const spxChg = chgPct(spx, 20);
    if (vixLast == null && spxChg == null) return c.fallback;
    const t = 0.6 * norm(vixLast ?? 15, 12, 30) + 0.4 * norm(-(spxChg ?? 0), -6, 8);
    return Math.round(t * 100);
  }
  const [fx, eq] = await Promise.all([closes(c.fx), closes(c.eq)]);
  const fxVol = realizedVol(fx);
  const fxDep = chgPct(fx, 20);   // USD/local 20d: + = divisa local más débil
  const eqChg = chgPct(eq, 20);   // bolsa 20d: − = tensión
  if (fxVol == null && fxDep == null && eqChg == null) return c.fallback;
  const t =
    0.45 * norm(fxVol ?? 8, 4, 22) +
    0.30 * norm(fxDep ?? 0, -3, 6) +
    0.25 * norm(-(eqChg ?? 0), -6, 8);
  return Math.round(t * 100);
}

export async function GET() {
  const vals = await Promise.all(COUNTRIES.map(tensionFor));
  const scores = {};
  COUNTRIES.forEach((c, i) => { scores[c.id] = Math.max(0, Math.min(100, vals[i])); });
  return Response.json(
    { asOf: new Date().toISOString(), scores },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
}

// app/api/market/route.js
// ---------------------------------------------------------------------------
// Obtiene datos de mercado para alimentar el indice Risk On.
// Usa fuentes GRATUITAS con posible retraso (ok para un boletin diario).
//
// - FX (USD/MXN, EUR/USD, DXY proxy): Frankfurter (frankfurter.app) -> gratis, sin API key
// - VIX, MOVE, indices: Stooq (stooq.com) -> CSV gratis, sin API key
//
// Si una fuente falla, se usa un valor de respaldo razonable para que el sitio
// nunca se rompa. Cachea 1h (revalidate) para no saturar las APIs gratis.
// ---------------------------------------------------------------------------

export const revalidate = 3600; // 1 hora

// Lee el ultimo cierre de un simbolo en Stooq (CSV gratis)
async function stooqLast(symbol) {
  try {
    const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, { next: { revalidate } });
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    const close = parseFloat(cols[6]);
    return isNaN(close) ? null : close;
  } catch {
    return null;
  }
}

// FX via Frankfurter (gratis, sin key)
async function fxRate(base, quote) {
  try {
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}`;
    const res = await fetch(url, { next: { revalidate } });
    const data = await res.json();
    return data?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Lanzamos todo en paralelo
  const [usdmxn, eurusd, vixRaw, moveRaw, dxyRaw, spxRaw, ndxRaw] = await Promise.all([
    fxRate("USD", "MXN"),
    fxRate("EUR", "USD"),
    stooqLast("^vix"),
    stooqLast("^move"),
    stooqLast("^dxy") || stooqLast("dx.f"),
    stooqLast("^spx"),
    stooqLast("^ndx"),
  ]);

  // Valores de respaldo (si la fuente gratuita falla en ese momento)
  const data = {
    asOf: new Date().toISOString(),
    delayed: true,
    usdmxn: usdmxn ?? 18.42,
    eurusd: eurusd ?? 1.084,
    vix: vixRaw ?? 13.4,
    move: moveRaw ?? 98,
    dxy: dxyRaw ?? 104.3,
    spx: spxRaw ?? 5412,
    ndx: ndxRaw ?? 17890,
    // La vol implicita de USDMXN no esta en fuentes gratis directas;
    // se aproxima o se captura manual. Editable.
    mxnVol: 9.1,
  };

  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}

// app/api/market/route.js
// Fuente: Yahoo Finance v8 chart endpoint — el mismo que ya usa /api/history.
// La v7 quote API empezó a exigir autenticación ("crumb"/cookie) y devuelve
// 401 Unauthorized desde servidores; v8 chart sigue siendo público y trae
// regularMarketPrice + chartPreviousClose (de ahí derivamos el % de cambio).
// FX: Frankfurter (gratis, sin clave).

export const revalidate = 60;

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta     = result.meta ?? {};
    const rawQuote = result.indicators?.quote?.[0] ?? {};

    // Construir arrays alineados (solo candles donde close es válido)
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

    // % de cambio diario = último cierre vs el anterior. OJO: meta.chartPreviousClose
    // no es fiable con range != "1d" (regresa el cierre de hace ~N días, no el de ayer),
    // así que lo derivamos de los cierres diarios — funciona con cualquier rango.
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

// Soporte y resistencia: rolling high/low de los últimos `period` candles.
// Da niveles técnicos actualizados sin depender de inputs manuales.
function rollingLevels(highs, lows, period = 10) {
  if (!highs?.length || !lows?.length || highs.length < 2) return null;
  const n = Math.min(period, highs.length);
  return {
    support:    Math.round(Math.min(...lows.slice(-n))  * 10000) / 10000,
    resistance: Math.round(Math.max(...highs.slice(-n)) * 10000) / 10000,
  };
}

async function fxRate(base, quote) {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${base}&to=${quote}`,
      { next: { revalidate } }
    );
    const d = await res.json();
    return d?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

// Volatilidad realizada anualizada (%) a partir de cierres diarios — proxy
// libre de la volatilidad implícita (para la que no existe fuente gratuita).
function realizedVol(closes) {
  if (!closes || closes.length < 6) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export async function GET() {
  const SYMBOLS = {
    spx: "^GSPC", ndx: "^IXIC", vix: "^VIX", move: "^MOVE", dxy: "DX-Y.NYB",
    aapl: "AAPL", tsla: "TSLA", nvda: "NVDA", btc: "BTC-USD", eth: "ETH-USD",
    ipc: "^MXX", wti: "CL=F", gold: "GC=F",
    usdjpy: "JPY=X", us10y: "^TNX",
    usdmxnChart: "MXN=X",
    eurusdChart: "EURUSD=X",
    eurmxnChart: "EURMXN=X",
  };
  const keys = Object.keys(SYMBOLS);

  const [charts, usdmxn, eurusd] = await Promise.all([
    Promise.all(keys.map((k) => yahooChart(SYMBOLS[k]))),
    fxRate("USD", "MXN"),
    fxRate("EUR", "USD"),
  ]);

  const c = {};
  keys.forEach((key, i) => { c[key] = charts[i] ?? {}; });

  const mxnLevels = rollingLevels(c.usdmxnChart?.highs, c.usdmxnChart?.lows);

  const data = {
    asOf: new Date().toISOString(),
    delayed: false,
    // FX — precio y cambio diario (Yahoo primero: misma fuente que las gráficas
    // de /api/history, así no hay discrepancia entre las tarjetas y el chart)
    usdmxn:    c.usdmxnChart?.price ?? usdmxn ?? 18.42,
    usdmxnChg: c.usdmxnChart?.chgPct ?? null,
    eurusd:    c.eurusdChart?.price ?? eurusd ?? 1.084,
    eurusdChg: c.eurusdChart?.chgPct ?? null,
    eurmxn:    c.eurmxnChart?.price ?? null,
    eurmxnChg: c.eurmxnChart?.chgPct ?? null,
    // Soportes y resistencias USD/MXN (rolling 10-day high/low, se actualiza con el mercado)
    mxnS1: mxnLevels?.support    ?? null,
    mxnR1: mxnLevels?.resistance ?? null,
    // Indices
    spx:     c.spx?.price  ?? 5412,
    spxChg:  c.spx?.chgPct ?? null,
    ndx:     c.ndx?.price  ?? 17890,
    ndxChg:  c.ndx?.chgPct ?? null,
    // Volatilidad
    vix:     c.vix?.price  ?? 13.4,
    move:    c.move?.price ?? 98,
    dxy:     c.dxy?.price  ?? 104.3,
    // Acciones
    aapl:    c.aapl?.price  ?? null,
    aaplChg: c.aapl?.chgPct ?? null,
    tsla:    c.tsla?.price  ?? null,
    tslaChg: c.tsla?.chgPct ?? null,
    nvda:    c.nvda?.price  ?? null,
    nvdaChg: c.nvda?.chgPct ?? null,
    // Cripto
    btc:     c.btc?.price  ?? null,
    btcChg:  c.btc?.chgPct ?? null,
    eth:     c.eth?.price  ?? null,
    ethChg:  c.eth?.chgPct ?? null,
    // IPC + commodities
    ipc:     c.ipc?.price  ?? null,
    ipcChg:  c.ipc?.chgPct ?? null,
    wti:     c.wti?.price  ?? null,
    wtiChg:  c.wti?.chgPct ?? null,
    gold:    c.gold?.price ?? null,
    goldChg: c.gold?.chgPct ?? null,
    usdjpy:    c.usdjpy?.price  ?? null,
    usdjpyChg: c.usdjpy?.chgPct ?? null,
    us10y:    c.us10y?.price  ?? null,
    us10yChg: c.us10y?.chgPct ?? null,
    // Volatilidad realizada USD/MXN (proxy automático de la implícita)
    mxnVol: realizedVol(c.usdmxnChart?.closes) ?? 9.1,
  };

  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
  });
}

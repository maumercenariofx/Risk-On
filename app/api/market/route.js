// app/api/market/route.js
// Fuente: Yahoo Finance v8 chart endpoint — el mismo que ya usa /api/history.
// La v7 quote API empezó a exigir autenticación ("crumb"/cookie) y devuelve
// 401 Unauthorized desde servidores; v8 chart sigue siendo público y trae
// regularMarketPrice + chartPreviousClose (de ahí derivamos el % de cambio).
// FX: Frankfurter (gratis, sin clave).

export const revalidate = 60;

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// `live` (lo usa solo la generación del view diario vía ?live=1): trae el dato
// fresco al instante (cache: "no-store") en vez de la versión cacheada 60s, para
// que el correo de las 6:58 cite el mercado EXACTO de ese momento.
async function yahooChart(symbol, { range = "1mo", interval = "1d", live = false } = {}) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      ...(live ? { cache: "no-store" } : { next: { revalidate } }),
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

async function fxRate(base, quote, { live = false } = {}) {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${base}&to=${quote}`,
      live ? { cache: "no-store" } : { next: { revalidate } }
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

// Spot USD/MXN intradía (último candle de 1 minuto) — el más fiel al nivel real
// de ese instante. Solo se usa en modo live; si falla, GET cae al spot diario.
async function usdmxnIntradaySpot() {
  const chart = await yahooChart("MXN=X", { range: "1d", interval: "1m", live: true });
  const closes = chart?.closes;
  if (!closes?.length) return null;
  return Math.round(closes[closes.length - 1] * 10000) / 10000;
}

export async function GET(request) {
  // ?live=1 → datos frescos al instante (sin caché), para la generación del view
  // diario. Sin el parámetro, la ruta mantiene su caché de 60s/SWR para el sitio.
  const live = new URL(request.url).searchParams.get("live") === "1";

  const SYMBOLS = {
    spx: "^GSPC", esfut: "ES=F", ndx: "^IXIC", vix: "^VIX", move: "^MOVE", dxy: "DX-Y.NYB",
    aapl: "AAPL", tsla: "TSLA", nvda: "NVDA", btc: "BTC-USD", eth: "ETH-USD",
    ipc: "^MXX", wti: "CL=F", gold: "GC=F",
    usdjpy: "JPY=X", us10y: "^TNX",
    usdmxnChart: "MXN=X",
    eurusdChart: "EURUSD=X",
    eurmxnChart: "EURMXN=X",
  };
  const keys = Object.keys(SYMBOLS);

  // range=6mo: necesitamos ~126 cierres diarios para la ventana rodante de 60
  // días que usa la normalización dinámica del índice (lib/riskScore.js).
  const [charts, usdmxn, eurusd, liveSpot] = await Promise.all([
    Promise.all(keys.map((k) => yahooChart(SYMBOLS[k], { range: "6mo", live }))),
    fxRate("USD", "MXN", { live }),
    fxRate("EUR", "USD", { live }),
    live ? usdmxnIntradaySpot() : Promise.resolve(null),
  ]);

  const c = {};
  keys.forEach((key, i) => { c[key] = charts[i] ?? {}; });

  const mxnLevels = rollingLevels(c.usdmxnChart?.highs, c.usdmxnChart?.lows);

  // Último cierre diario (mismo campo que usa /api/history) redondeado igual,
  // para que las tarjetas y el ticker muestren el mismo número que la gráfica
  // de Mercados en vez del spot intradía (meta.regularMarketPrice), que puede
  // diferir ligeramente del último candle.
  const lastClose = (chart) => {
    const closes = chart?.closes;
    if (!closes?.length) return null;
    return Math.round(closes[closes.length - 1] * 10000) / 10000;
  };

  // ── Series rodantes para la normalización dinámica del índice ───────────────
  // El score (lib/riskScore.js) normaliza cada señal con un z-score robusto sobre
  // una ventana de ~60 días; aquí mandamos la serie de insumos diarios que necesita
  // (recortada a 70 puntos, redondeada). Si una serie viene corta/vacía, el índice
  // cae solo a su rampa fija.
  const round3 = (v) => (v == null || isNaN(v) ? null : Math.round(v * 1000) / 1000);
  const tail = (arr, n = 70) => (Array.isArray(arr) ? arr.slice(-n).map(round3) : []);
  const dailyPct = (closes) => {
    if (!closes?.length) return [];
    const out = [];
    for (let i = 1; i < closes.length; i++) {
      const p = closes[i - 1];
      out.push(p ? ((closes[i] - p) / p) * 100 : null);
    }
    return out;
  };
  // Vol realizada anualizada (%) rodante a `win` días, un valor por día.
  const rollingVol = (closes, win = 21) => {
    if (!closes?.length) return [];
    const lr = [];
    for (let i = 1; i < closes.length; i++) {
      lr.push(closes[i] && closes[i - 1] ? Math.log(closes[i] / closes[i - 1]) : null);
    }
    const out = [];
    for (let i = 0; i < lr.length; i++) {
      const w = lr.slice(Math.max(0, i - win + 1), i + 1).filter((x) => x != null);
      if (w.length < 6) { out.push(null); continue; }
      const m = w.reduce((a, b) => a + b, 0) / w.length;
      const v = w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1);
      out.push(Math.sqrt(v) * Math.sqrt(252) * 100);
    }
    return out;
  };
  const mxnVolSeries = rollingVol(c.usdmxnChart?.closes);
  const mxnVolNow = mxnVolSeries.length ? mxnVolSeries[mxnVolSeries.length - 1] : null;

  const data = {
    asOf: new Date().toISOString(),
    delayed: false,
    // FX — último cierre diario (misma fuente que /api/history, así no hay
    // discrepancia entre las tarjetas/ticker y el chart de Mercados)
    usdmxn:    lastClose(c.usdmxnChart) ?? c.usdmxnChart?.price ?? usdmxn ?? 18.42,
    usdmxnChg: c.usdmxnChart?.chgPct ?? null,
    // Spot en vivo — lo usa el view premarket para citar el nivel exacto del
    // USD/MXN. En modo live es el último candle de 1 minuto (lo más fiel al
    // instante); si no, regularMarketPrice → último cierre diario → Frankfurter.
    usdmxnSpot: liveSpot ?? c.usdmxnChart?.price ?? lastClose(c.usdmxnChart) ?? usdmxn ?? null,
    eurusd:    lastClose(c.eurusdChart) ?? c.eurusdChart?.price ?? eurusd ?? 1.084,
    eurusdChg: c.eurusdChart?.chgPct ?? null,
    eurmxn:    lastClose(c.eurmxnChart) ?? c.eurmxnChart?.price ?? null,
    eurmxnChg: c.eurmxnChart?.chgPct ?? null,
    // Soportes y resistencias USD/MXN (rolling 10-day high/low, se actualiza con el mercado)
    mxnS1: mxnLevels?.support    ?? null,
    mxnR1: mxnLevels?.resistance ?? null,
    // Indices
    spx:     c.spx?.price  ?? 5412,
    spxChg:  c.spx?.chgPct ?? null,
    // Futuros S&P (ES=F) — cotizan ~24h; a las 7am CST (cash cerrado) reflejan el
    // movimiento premarket real, a diferencia de ^GSPC que aún trae el cierre de
    // ayer. Es la señal de acciones del Risk On score (lib/riskScore.js).
    spxFut:    c.esfut?.price  ?? null,
    spxFutChg: c.esfut?.chgPct ?? null,
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
    // Volatilidad realizada USD/MXN (proxy automático de la implícita), 21 días
    mxnVol: mxnVolNow ?? realizedVol(c.usdmxnChart?.closes) ?? 9.1,
    // ── Series rodantes (insumos de la normalización dinámica del índice) ──────
    vixSeries:        tail(c.vix?.closes),
    moveSeries:       tail(c.move?.closes),
    mxnVolSeries:     tail(mxnVolSeries),
    usdmxnChgSeries:  tail(dailyPct(c.usdmxnChart?.closes)),
    spxChgSeries:     tail(dailyPct(c.spx?.closes)),
    btcChgSeries:     tail(dailyPct(c.btc?.closes)),
    goldChgSeries:    tail(dailyPct(c.gold?.closes)),
  };

  return Response.json(data, {
    headers: {
      "Cache-Control": live
        ? "no-store"
        : "s-maxage=60, stale-while-revalidate=300",
    },
  });
}

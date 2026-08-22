// app/api/market/route.js
// Fuente: Yahoo Finance v8 chart endpoint — el mismo que ya usa /api/history.
// La v7 quote API empezó a exigir autenticación ("crumb"/cookie) y devuelve
// 401 Unauthorized desde servidores; v8 chart sigue siendo público y trae
// regularMarketPrice + chartPreviousClose (de ahí derivamos el % de cambio).
// FX: Frankfurter (gratis, sin clave).

import { levels } from "../../../lib/technicals";

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
    const closes = [], highs = [], lows = [], ts = [];
    const rawC = rawQuote.close ?? [], rawH = rawQuote.high ?? [], rawL = rawQuote.low ?? [];
    const rawT = result.timestamp ?? [];
    for (let i = 0; i < rawC.length; i++) {
      const c = rawC[i];
      if (c == null || isNaN(c)) continue;
      closes.push(c);
      highs.push(rawH[i] ?? c);
      lows.push(rawL[i] ?? c);
      ts.push(rawT[i] ?? null);
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

    return { price, chgPct, closes, highs, lows, ts };
  } catch {
    return null;
  }
}

// ── Cierre previo FX confiable ───────────────────────────────────────────────
// El 24-jul-2026 la vela DIARIA del jueves en Yahoo quedó congelada cerca de su
// apertura (17.4009 vs cierre real ~17.51 según el intradía) y el view publicó
// "sube 9 centavos" falso. Las velas horarias sí traían el dato bueno, así que
// el cierre previo ahora se deriva del intradía (frontera de sesión = medianoche
// de Londres, el MISMO roll que usan las velas diarias FX de Yahoo) y se cruza
// contra el diario; si difieren más de la tolerancia gana el intradía y la vela
// diaria sospechosa se sana para todo lo que se calcula de ella. Aplica a
// USD/MXN y a los pares EUR (mismo bug latente de velas congeladas).
const TOL_PREV = 0.03; // USD/MXN: 3 centavos (~0.17% del nivel)

const londonWeekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" });
const londonClockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
});

// Timestamp (segundos) de la medianoche de Londres más reciente.
function lastLondonMidnightSec(nowMs = Date.now()) {
  const p = {};
  for (const { type, value } of londonClockFmt.formatToParts(new Date(nowMs))) p[type] = value;
  const secs = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return Math.floor(nowMs / 1000) - secs;
}

// Último close horario ANTES del roll más reciente, saltando velas de fin de
// semana en horario Londres (madrugada de lunes → cierre real del viernes).
function prevCloseFromHourly(hourly, boundarySec) {
  const { closes, ts } = hourly ?? {};
  if (!closes?.length || !ts?.length) return null;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (ts[i] == null || ts[i] >= boundarySec) continue;
    const wd = londonWeekdayFmt.format(new Date(ts[i] * 1000));
    if (wd === "Sat" || wd === "Sun") continue;
    return closes[i];
  }
  return null;
}

// Máximo/mínimo de la sesión [startSec, endSec) según las velas horarias —
// para sanar high/low de una vela diaria congelada.
function sessionHighLow(hourly, startSec, endSec) {
  const { highs, lows, ts } = hourly ?? {};
  if (!highs?.length || !ts?.length) return null;
  let hi = -Infinity, lo = Infinity;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] == null || ts[i] < startSec || ts[i] >= endSec) continue;
    if (highs[i] != null) hi = Math.max(hi, highs[i]);
    if (lows[i] != null) lo = Math.min(lo, lows[i]);
  }
  return isFinite(hi) && isFinite(lo) ? { hi, lo } : null;
}

// Resuelve el cierre previo confiable de un par FX: cruza la vela diaria contra
// el intradía horario y, si la diaria está congelada, gana el intradía y la
// vela se sana IN PLACE (closes/highs/lows) para que nada herede basura.
// tol = desacuerdo máximo tolerado, en unidades del par (~0.2% del nivel).
function resolvePrevClose(dChart, hourly, boundarySec, tol, label) {
  // Última vela diaria COMPLETA = la última con ts anterior al roll de hoy
  // (la vela de hoy y el tick vivo que Yahoo apenda quedan fuera).
  let dPrevIdx = -1;
  if (dChart?.closes?.length && dChart?.ts?.length) {
    for (let i = dChart.closes.length - 1; i >= 0; i--) {
      if (dChart.ts[i] != null && dChart.ts[i] < boundarySec) { dPrevIdx = i; break; }
    }
  }
  const dPrev = dPrevIdx >= 0 ? dChart.closes[dPrevIdx] : null;
  const hPrev = prevCloseFromHourly(hourly, boundarySec);
  if (dPrev != null && hPrev != null) {
    if (Math.abs(dPrev - hPrev) <= tol) return { prevClose: dPrev, verified: true };
    console.log(`[market] cierre previo ${label}: diario ${dPrev.toFixed(4)} vs intradía ${hPrev.toFixed(4)} — vela diaria sospechosa, usando intradía`);
    dChart.closes[dPrevIdx] = hPrev;
    const sessionEnd = Math.min(dChart.ts[dPrevIdx + 1] ?? boundarySec, boundarySec);
    const hl = sessionHighLow(hourly, dChart.ts[dPrevIdx], sessionEnd);
    if (hl) { dChart.highs[dPrevIdx] = hl.hi; dChart.lows[dPrevIdx] = hl.lo; }
    return { prevClose: hPrev, verified: true };
  }
  if (dPrev != null || hPrev != null) {
    // Una sola fuente disponible: se usa, pero queda marcada como no verificada
    // (el view NO debe afirmar movimiento sobre dato sin contraste).
    console.log(`[market] cierre previo ${label} sin contraste (diario=${dPrev?.toFixed?.(4) ?? "s/d"}, intradía=${hPrev?.toFixed?.(4) ?? "s/d"}) — no verificado`);
    return { prevClose: dPrev ?? hPrev, verified: false };
  }
  return { prevClose: null, verified: false };
}

// rollingLevels() vivía aquí y era una copia byte a byte de levels() en
// lib/technicals.js salvo por la ventana por defecto — de ahí que el correo
// publicara niveles de 10 días y /analisis de 20 bajo la MISMA etiqueta
// (auditoría 2026-08-21). Ahora hay una sola implementación, con la ventana
// canónica en technicals.LEVELS_PERIOD.

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
  const [charts, usdmxn, eurusd, liveSpot, usdmxnHourly, eurusdHourly, eurmxnHourly] = await Promise.all([
    Promise.all(keys.map((k) => yahooChart(SYMBOLS[k], { range: "6mo", live }))),
    fxRate("USD", "MXN", { live }),
    fxRate("EUR", "USD", { live }),
    live ? usdmxnIntradaySpot() : Promise.resolve(null),
    yahooChart("MXN=X", { range: "5d", interval: "1h", live }),
    yahooChart("EURUSD=X", { range: "5d", interval: "1h", live }),
    yahooChart("EURMXN=X", { range: "5d", interval: "1h", live }),
  ]);

  const c = {};
  keys.forEach((key, i) => { c[key] = charts[i] ?? {}; });

  // ── Cierre previo FX: diario cruzado contra intradía (ver nota arriba) ──────
  const boundarySec = lastLondonMidnightSec();
  const { prevClose: usdmxnPrevClose, verified: usdmxnPrevVerified } =
    resolvePrevClose(c.usdmxnChart, usdmxnHourly, boundarySec, TOL_PREV, "USD/MXN");
  const { prevClose: eurusdPrevClose, verified: eurusdPrevVerified } =
    resolvePrevClose(c.eurusdChart, eurusdHourly, boundarySec, 0.002, "EUR/USD");
  const { prevClose: eurmxnPrevClose, verified: eurmxnPrevVerified } =
    resolvePrevClose(c.eurmxnChart, eurmxnHourly, boundarySec, 0.04, "EUR/MXN");

  const mxnLevels = levels(c.usdmxnChart?.highs, c.usdmxnChart?.lows);

  // Último cierre diario (mismo campo que usa /api/history) redondeado igual,
  // para que las tarjetas y el ticker muestren el mismo número que la gráfica
  // de Mercados en vez del spot intradía (meta.regularMarketPrice), que puede
  // diferir ligeramente del último candle.
  const lastClose = (chart) => {
    const closes = chart?.closes;
    if (!closes?.length) return null;
    return Math.round(closes[closes.length - 1] * 10000) / 10000;
  };

  // % de cambio de un par FX contra su cierre previo verificado; si no hubo
  // cierre utilizable, cae al derivado de velas diarias (comportamiento viejo).
  const fxChg = (chart, prevClose) => {
    const spotNow = chart?.price ?? lastClose(chart);
    if (prevClose != null && spotNow != null) return ((spotNow - prevClose) / prevClose) * 100;
    return chart?.chgPct ?? null;
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
    // % de cambio contra el cierre previo VERIFICADO (spot vivo si hay, si no
    // el último precio); fallback al derivado de velas diarias si no hubo
    // cierre previo utilizable.
    usdmxnChg: (() => {
      const spotNow = liveSpot ?? c.usdmxnChart?.price ?? lastClose(c.usdmxnChart);
      if (usdmxnPrevClose != null && spotNow != null) {
        return ((spotNow - usdmxnPrevClose) / usdmxnPrevClose) * 100;
      }
      return c.usdmxnChart?.chgPct ?? null;
    })(),
    // Cierre previo explícito + bandera de verificación (contraste diario vs
    // intradía). computeNotables (lib/dailyView.js) los usa para el claim en
    // centavos: sin verificación, mejor cifra omitida que cifra falsa.
    usdmxnPrevClose: usdmxnPrevClose != null ? Math.round(usdmxnPrevClose * 10000) / 10000 : null,
    usdmxnPrevVerified,
    // Spot en vivo — lo usa el view premarket para citar el nivel exacto del
    // USD/MXN. En modo live es el último candle de 1 minuto (lo más fiel al
    // instante); si no, regularMarketPrice → último cierre diario → Frankfurter.
    usdmxnSpot: liveSpot ?? c.usdmxnChart?.price ?? lastClose(c.usdmxnChart) ?? usdmxn ?? null,
    eurusd:    lastClose(c.eurusdChart) ?? c.eurusdChart?.price ?? eurusd ?? 1.084,
    // % EUR contra cierre previo verificado (mismo contraste que USD/MXN);
    // fallback al derivado de velas diarias si no hubo cierre utilizable.
    eurusdChg: fxChg(c.eurusdChart, eurusdPrevClose),
    eurusdPrevVerified,
    eurmxn:    lastClose(c.eurmxnChart) ?? c.eurmxnChart?.price ?? null,
    eurmxnChg: fxChg(c.eurmxnChart, eurmxnPrevClose),
    eurmxnPrevVerified,
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
    // Series para el ranking de ÁNGULOS del view diario (lib/dailyView.js):
    // qué movimiento de hoy es más inusual vs su propia historia.
    wtiChgSeries:     tail(dailyPct(c.wti?.closes)),
    ipcChgSeries:     tail(dailyPct(c.ipc?.closes)),
    us10ySeries:      tail(c.us10y?.closes),
  };

  return Response.json(data, {
    headers: {
      "Cache-Control": live
        ? "no-store"
        : "s-maxage=60, stale-while-revalidate=300",
    },
  });
}

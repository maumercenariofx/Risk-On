// app/api/ta/route.js
// Motor de análisis técnico bajo demanda: el usuario elige un símbolo y este
// endpoint jala el OHLCV de Yahoo (diario + intradía), calcula los indicadores
// con lib/technicals.js y devuelve un veredicto + señal accionable (ES/EN).
import {
  ema, rsi, macd, atr, bollinger, vwap, pivots, levels, verdict,
} from "../../../lib/technicals";
import { buildDailyBundle, computeTAIndex, taReading } from "../../../lib/taIndex";
import { eventImpact } from "../../../lib/events";

export const revalidate = 60;

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Trae OHLCV alineado (incluye open y volume, que /api/market descarta).
async function ohlcv(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta ?? {};
  const q = result.indicators?.quote?.[0] ?? {};
  const rawC = q.close ?? [], rawH = q.high ?? [], rawL = q.low ?? [], rawV = q.volume ?? [];
  const closes = [], highs = [], lows = [], volumes = [];
  for (let i = 0; i < rawC.length; i++) {
    const c = rawC[i];
    if (c == null || isNaN(c)) continue;
    closes.push(c);
    highs.push(rawH[i] ?? c);
    lows.push(rawL[i] ?? c);
    volumes.push(rawV[i] ?? 0);
  }
  return {
    closes, highs, lows, volumes,
    price: meta.regularMarketPrice ?? closes[closes.length - 1] ?? null,
    currency: meta.currency ?? null,
    exchange: meta.fullExchangeName ?? null,
  };
}

export async function GET(request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") || "MXN=X").trim();
  if (!/^[A-Za-z0-9.\-=^]{1,15}$/.test(symbol)) {
    return Response.json({ error: "símbolo inválido" }, { status: 400 });
  }

  let daily, intraday;
  try {
    [daily, intraday] = await Promise.all([
      ohlcv(symbol, "1y", "1d"), // ~252 velas: suficiente para la EMA200
      ohlcv(symbol, "1d", "1m").catch(() => null), // intradía es opcional
    ]);
  } catch (e) {
    return Response.json({ error: "no se pudo obtener data del símbolo", symbol }, { status: 502 });
  }
  if (!daily || daily.closes.length < 30) {
    return Response.json({ error: "datos insuficientes para este símbolo", symbol }, { status: 404 });
  }

  const { closes, highs, lows } = daily;
  const n = closes.length;

  // Precio vivo: intradía si lo hay, si no el último cierre diario.
  const price = intraday?.price ?? daily.price ?? closes[n - 1];
  // % de cambio = vs cierre del día previo (cierre diario).
  const prevDayClose = closes[n - 2];
  const chgPct = prevDayClose ? ((price - prevDayClose) / prevDayClose) * 100 : null;

  // VWAP: solo si el intradía trae volumen real (FX spot no tiene → null).
  const intraVolSum = (intraday?.volumes ?? []).reduce((a, b) => a + (b || 0), 0);
  const hasVolume = intraVolSum > 0;
  const vwapVal = hasVolume
    ? vwap(intraday.highs, intraday.lows, intraday.closes, intraday.volumes)
    : null;

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const macdV = macd(closes);
  const rsiV = rsi(closes);
  const atrV = atr(highs, lows, closes);
  const bbV = bollinger(closes);

  const piv = pivots(highs[n - 2], lows[n - 2], closes[n - 2]);
  const lvl = levels(highs, lows, 20);

  const v = verdict({ price, ema20, ema50, ema200, macd: macdV, rsi: rsiV });

  // ── Índice Técnico Risk On (oscilador de estiramiento + convicción) ──────────
  const ev = eventImpact();
  const dailyVol = daily.volumes ?? [];
  const dvSum = dailyVol.slice(-20).reduce((a, b) => a + (b || 0), 0);
  const volRatio = dvSum > 0 ? dailyVol[dailyVol.length - 1] / (dvSum / 20) : null;
  const bundle = buildDailyBundle(closes, highs, lows, {
    price, vwap: vwapVal, hasVolume, volRatio, eventImpact: ev.impact,
  });
  const itr = computeTAIndex(bundle, { eventImpact: ev.impact });

  // Decimales según magnitud (FX 4, índices/cripto 2).
  const dp = price >= 1000 ? 2 : price >= 50 ? 2 : 4;
  const f = (x) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);

  const signal = buildSignal({ bias: v.bias, price, piv, lvl, vwap: vwapVal, atr: atrV, rsi: rsiV, dp });

  return Response.json({
    ok: true,
    symbol,
    price: f(price),
    chgPct: chgPct == null ? null : Math.round(chgPct * 100) / 100,
    currency: daily.currency,
    exchange: daily.exchange,
    hasVolume,
    decimals: dp,
    indicators: {
      ema20: f(ema20), ema50: f(ema50), ema200: f(ema200),
      rsi: rsiV, macd: macdV, atr: atrV, bollinger: bbV, vwap: vwapVal,
    },
    levels: { pivots: piv, ...lvl, prevHigh: f(highs[n - 2]), prevLow: f(lows[n - 2]) },
    verdict: v,
    index: itr ? {
      posture: itr.direction,
      conviction: itr.conviction,
      band: itr.band,
      reading: taReading(itr.direction),
      factors: itr.factors,
      event: ev,
    } : null,
    signal,
    asOf: new Date().toISOString(),
  });
}

// ── Señal rule-based (instantánea, sin IA). La capa IA de los destacados se
// monta encima de estos mismos números en una fase posterior. ─────────────────
function buildSignal({ bias, price, piv, lvl, vwap, atr, rsi, dp }) {
  const fmt = (x) => (x == null ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  // Soporte inmediato debajo del precio, resistencia inmediata arriba.
  const sup = piv ? (price > piv.pp ? piv.pp : piv.s1) : lvl?.support;
  const res = piv ? (price < piv.pp ? piv.pp : piv.r1) : lvl?.resistance;

  if (bias === "bull") {
    return {
      es: `Sesgo alcista mientras aguante ${fmt(sup)}. Objetivo inmediato ${fmt(res)}${vwap ? ` (con el VWAP en ${fmt(vwap)} como pivote intradía)` : ""}. Se invalida con cierre por debajo de ${fmt(piv?.s2 ?? lvl?.support)}.`,
      en: `Bullish bias while it holds ${fmt(sup)}. Immediate target ${fmt(res)}${vwap ? ` (VWAP at ${fmt(vwap)} as intraday pivot)` : ""}. Invalidated on a close below ${fmt(piv?.s2 ?? lvl?.support)}.`,
    };
  }
  if (bias === "bear") {
    return {
      es: `Sesgo bajista mientras no recupere ${fmt(res)}. Objetivo inmediato ${fmt(sup)}${vwap ? ` (VWAP en ${fmt(vwap)} como techo intradía)` : ""}. Se invalida con cierre por arriba de ${fmt(piv?.r2 ?? lvl?.resistance)}.`,
      en: `Bearish bias while it stays below ${fmt(res)}. Immediate target ${fmt(sup)}${vwap ? ` (VWAP at ${fmt(vwap)} as intraday cap)` : ""}. Invalidated on a close above ${fmt(piv?.r2 ?? lvl?.resistance)}.`,
    };
  }
  return {
    es: `Rango / sin tendencia clara. Operar entre soporte ${fmt(sup)} y resistencia ${fmt(res)}; esperar ruptura para tomar dirección. RSI en ${rsi ?? "—"}.`,
    en: `Range / no clear trend. Trade between support ${fmt(sup)} and resistance ${fmt(res)}; wait for a breakout to take direction. RSI at ${rsi ?? "—"}.`,
  };
}

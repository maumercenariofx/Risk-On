// lib/technicals.js
// Motor de análisis técnico — funciones puras (sin estado, client-safe).
// Trabajan sobre arrays de OHLCV alineados (mismo largo, orden cronológico).
// Todo es determinista: mismos datos → mismo resultado. No usa fuentes externas.

const round = (v, d = 4) =>
  v == null || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

// ── Medias ───────────────────────────────────────────────────────────────────
export function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// EMA → devuelve la serie completa (para encadenar MACD).
export function emaSeries(values, period) {
  if (!values || values.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  // Semilla = SMA de los primeros `period`.
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function ema(values, period) {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] ?? null : null;
}

// ── RSI (Wilder) ──────────────────────────────────────────────────────────────
export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return round(100 - 100 / (1 + rs), 1);
}

// ── MACD ──────────────────────────────────────────────────────────────────────
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastE[i] != null && slowE[i] != null) macdLine.push(fastE[i] - slowE[i]);
  }
  const signalE = emaSeries(macdLine, signal);
  const m = macdLine[macdLine.length - 1];
  const s = signalE[signalE.length - 1];
  if (m == null || s == null) return null;
  // Cruce: ¿el histograma cambió de signo en la última vela?
  const prevHist = macdLine[macdLine.length - 2] - (signalE[signalE.length - 2] ?? s);
  const hist = m - s;
  return {
    macd: round(m, 5),
    signal: round(s, 5),
    histogram: round(hist, 5),
    cross: prevHist <= 0 && hist > 0 ? "bull" : prevHist >= 0 && hist < 0 ? "bear" : null,
    rising: hist > prevHist,
  };
}

// ── ATR (Wilder) ──────────────────────────────────────────────────────────────
export function atr(highs, lows, closes, period = 14) {
  if (!highs || highs.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  if (tr.length < period) return null;
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return round(a, 5);
}

// ── ADX (Wilder) — fuerza de tendencia (0-100, no direccional) ────────────────
export function adx(highs, lows, closes, period = 14) {
  if (!highs || highs.length < period * 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  // Suavizado de Wilder
  const wilder = (arr) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; out.push(s); }
    return out;
  };
  const trS = wilder(tr), pS = wilder(plusDM), mS = wilder(minusDM);
  const dx = [];
  for (let i = 0; i < trS.length; i++) {
    const pDI = 100 * pS[i] / trS[i];
    const mDI = 100 * mS[i] / trS[i];
    const sum = pDI + mDI;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum);
  }
  if (dx.length < period) return round(dx[dx.length - 1], 1);
  // ADX = media suavizada del DX
  let a = dx.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < dx.length; i++) a = (a * (period - 1) + dx[i]) / period;
  return round(a, 1);
}

// ── ROC — rate of change a n periodos (%) ─────────────────────────────────────
export function roc(closes, period = 10) {
  if (!closes || closes.length < period + 1) return null;
  const prev = closes[closes.length - 1 - period];
  if (!prev) return null;
  return round(((closes[closes.length - 1] - prev) / prev) * 100, 3);
}

// ── Bollinger ─────────────────────────────────────────────────────────────────
export function bollinger(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: round(mid + mult * sd, 4),
    mid: round(mid, 4),
    lower: round(mid - mult * sd, 4),
    // Squeeze: ancho de banda relativo (vs mediana histórica lo evalúa el caller).
    width: round((2 * mult * sd) / mid, 4),
  };
}

// ── VWAP intradía (cumulativo de la sesión) ───────────────────────────────────
// Requiere volumen. En FX spot Yahoo no da volumen → devuelve null.
export function vwap(highs, lows, closes, volumes) {
  if (!volumes || !volumes.length) return null;
  let pv = 0, vol = 0;
  for (let i = 0; i < closes.length; i++) {
    const v = volumes[i];
    if (v == null || isNaN(v) || v <= 0) continue;
    const typical = (highs[i] + lows[i] + closes[i]) / 3;
    pv += typical * v;
    vol += v;
  }
  return vol > 0 ? round(pv / vol, 4) : null;
}

// ── Pivots clásicos (del OHLC de la sesión previa) ────────────────────────────
export function pivots(prevHigh, prevLow, prevClose) {
  if (prevHigh == null || prevLow == null || prevClose == null) return null;
  const pp = (prevHigh + prevLow + prevClose) / 3;
  const range = prevHigh - prevLow;
  return {
    pp: round(pp, 4),
    r1: round(2 * pp - prevLow, 4),
    r2: round(pp + range, 4),
    s1: round(2 * pp - prevHigh, 4),
    s2: round(pp - range, 4),
  };
}

// ── Soporte / resistencia (rolling high/low) ──────────────────────────────────
export function levels(highs, lows, period = 20) {
  if (!highs?.length || !lows?.length) return null;
  const n = Math.min(period, highs.length);
  return {
    support: round(Math.min(...lows.slice(-n)), 4),
    resistance: round(Math.max(...highs.slice(-n)), 4),
  };
}

// ── Veredicto por confluencia ─────────────────────────────────────────────────
// Combina tendencia (precio vs EMAs), MACD y RSI en un sesgo único con razones.
export function verdict({ price, ema20, ema50, ema200, macd: m, rsi: r }) {
  let score = 0;
  const reasons = [];

  if (price != null && ema50 != null) {
    if (price > ema50) { score += 1; reasons.push({ k: "ema50", dir: "bull" }); }
    else { score -= 1; reasons.push({ k: "ema50", dir: "bear" }); }
  }
  if (price != null && ema200 != null) {
    if (price > ema200) { score += 1; reasons.push({ k: "ema200", dir: "bull" }); }
    else { score -= 1; reasons.push({ k: "ema200", dir: "bear" }); }
  }
  if (ema50 != null && ema200 != null) {
    // Golden / death cross (estructura de largo plazo).
    if (ema50 > ema200) { score += 1; reasons.push({ k: "cross", dir: "bull" }); }
    else { score -= 1; reasons.push({ k: "cross", dir: "bear" }); }
  }
  if (m?.histogram != null) {
    if (m.histogram > 0) { score += 1; reasons.push({ k: "macd", dir: "bull" }); }
    else { score -= 1; reasons.push({ k: "macd", dir: "bear" }); }
  }
  if (r != null) {
    if (r >= 70) { score -= 1; reasons.push({ k: "rsi", dir: "overbought" }); }
    else if (r <= 30) { score += 1; reasons.push({ k: "rsi", dir: "oversold" }); }
    else reasons.push({ k: "rsi", dir: "neutral" });
  }

  const bias = score >= 2 ? "bull" : score <= -2 ? "bear" : "neutral";
  return { bias, score, reasons };
}

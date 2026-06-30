// lib/taIndex.js
// ÍNDICE TÉCNICO RISK ON (ITR) — fuente única de verdad. Client-safe.
// Dos capas, por activo:
//   • DIRECCIÓN  (0-100, 50 = neutral): sesgo técnico venta↔compra.
//   • CONVICCIÓN (0-100%): cuánto confiar en ese sesgo hoy (baja con eventos,
//     señales en conflicto y vol comprimida).
//
// Diseño: las variables se agrupan en FACTORES ORTOGONALES (tendencia, momentum,
// posición, volumen) para no contar el mismo factor varias veces. Cada señal se
// normaliza por ATR (unidades de volatilidad) + logística → comparable entre
// activos, sin topes duros. Los pesos iniciales son económicamente sensatos y se
// RECALIBRAN con el backtest predictivo (scripts/backtest-taindex.mjs).
import { ema, emaSeries, rsi, macd, atr, bollinger, adx, roc, levels } from "./technicals.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// Logística a 0-100. x en "unidades de volatilidad" (z); k = pendiente.
const L = (x, k = 1) => 100 / (1 + Math.exp(-k * x));

// ── Pesos (suman 100 sobre los factores disponibles; se renormaliza) ──────────
export const FACTOR_WEIGHTS = { trend: 40, momentum: 30, position: 15, volume: 15 };

// ── Bundle de features diarios (lo usan IGUAL el backtest y el API) ───────────
// Recibe arrays OHLC alineados (orden cronológico). volume/vwap son opcionales
// (se inyectan en vivo; el backtest diario corre sin ellos).
export function buildDailyBundle(closes, highs, lows, extra = {}) {
  if (!closes || closes.length < 60) return null;
  const n = closes.length;
  const price = extra.price ?? closes[n - 1];
  const a = atr(highs, lows, closes, 14);
  if (!a || a <= 0) return null;

  const e50series = emaSeries(closes, 50);
  const ema50 = e50series[e50series.length - 1] ?? null;
  const ema50Prev = e50series[e50series.length - 11] ?? ema50; // pendiente a 10 velas
  const ema200 = ema(closes, 200);
  const bb = bollinger(closes, 20, 2);
  const lvl = levels(highs, lows, 20);
  const pctB = bb && bb.upper !== bb.lower ? (price - bb.lower) / (bb.upper - bb.lower) : 0.5;
  const posInRange = lvl && lvl.resistance !== lvl.support
    ? (price - lvl.support) / (lvl.resistance - lvl.support) : 0.5;

  return {
    price, atr: a, ema20: ema(closes, 20), ema50, ema50Prev, ema200,
    macdHist: macd(closes)?.histogram ?? null,
    rsi: rsi(closes, 14),
    roc10: roc(closes, 10),
    adx: adx(highs, lows, closes, 14),
    pctB, posInRange, bollWidth: bb?.width ?? null,
    // Opcionales en vivo:
    vwap: extra.vwap ?? null, hasVolume: !!extra.hasVolume, volRatio: extra.volRatio ?? null,
    eventImpact: extra.eventImpact ?? 0, // 0 ninguno · 1 medio · 2 alto (Fed/CPI/Banxico)
  };
}

// ── DIRECCIÓN ─────────────────────────────────────────────────────────────────
export function computeDirection(b) {
  const z = (x) => x / b.atr; // distancia en unidades de ATR
  const atrPct = (b.atr / b.price) * 100;

  // FACTOR TENDENCIA
  const tEma50  = L(z(b.price - b.ema50), 0.6);
  const tEma200 = b.ema200 != null ? L(z(b.price - b.ema200), 0.45) : null;
  const tStruct = b.ema200 != null ? L(z(b.ema50 - b.ema200), 0.5) : null;
  const tSlope  = L(z(b.ema50 - b.ema50Prev), 0.5);
  const trend = wavg([[tEma50, 30], [tEma200, 30], [tStruct, 20], [tSlope, 20]]);

  // FACTOR MOMENTUM
  const mMacd = b.macdHist != null ? L(z(b.macdHist), 0.9) : null;
  const mRsi  = b.rsi != null ? L((b.rsi - 50) / 12, 1) : null;
  // ROC ajustado por vol: retorno esperado típico a 10d ≈ atrPct*sqrt(10)
  const mRoc  = b.roc10 != null && atrPct > 0 ? L(b.roc10 / (atrPct * Math.sqrt(10)), 0.9) : null;
  const momentum = wavg([[mMacd, 40], [mRsi, 30], [mRoc, 30]]);

  // FACTOR POSICIÓN / REVERSIÓN (contrario: penaliza sobreextensión)
  const pB     = L(-(b.pctB - 0.5) * 4, 0.7);       // %B alto → empuja a la baja
  const pRange = L(-(b.posInRange - 0.5) * 4, 0.6); // pegado a resistencia → capado
  const position = wavg([[pB, 50], [pRange, 50]]);

  // FACTOR VOLUMEN (solo en vivo, si hay volumen real)
  let volume = null;
  if (b.hasVolume && b.vwap != null) {
    const vVwap = L(z(b.price - b.vwap), 0.7);
    const vConf = b.volRatio != null ? L((b.volRatio - 1) * 1.2, 0.8) : 50;
    volume = wavg([[vVwap, 70], [vConf, 30]]);
  }

  const factors = { trend, momentum, position, volume };
  const score = wavg(
    Object.entries(FACTOR_WEIGHTS).map(([k, w]) => [factors[k], w]).filter(([s]) => s != null)
  );
  return {
    score: Math.round(score),
    factors: round1(factors),
    subs: round1({ tEma50, tEma200, tStruct, tSlope, mMacd, mRsi, mRoc, pB, pRange }),
  };
}

// ── CONVICCIÓN ────────────────────────────────────────────────────────────────
export function computeConviction(b, dir) {
  const fs = [dir.factors.trend, dir.factors.momentum, dir.factors.position, dir.factors.volume]
    .filter((x) => x != null).map((s) => (s - 50) / 50); // centrado [-1,1]
  // |media| captura alineación Y fuerza: si concuerdan y son fuertes → grande;
  // si se contradicen → se cancela; si son tibios → chico.
  const agree = 100 * Math.abs(fs.reduce((a, c) => a + c, 0) / Math.max(fs.length, 1));
  // ADX: mercado en tendencia → confiar más en la dirección.
  const adxF = b.adx != null ? clamp((b.adx - 15) / 20, 0, 1) : 0.5;
  const base = 0.6 * agree + 0.4 * (100 * adxF);
  // Multiplicador por evento de alto impacto (Fed/CPI/Banxico) → el chart es
  // poco fiable hoy.
  const evMult = b.eventImpact >= 2 ? 0.45 : b.eventImpact === 1 ? 0.7 : 1;
  return { score: Math.round(clamp(base * evMult)), parts: { agree: +agree.toFixed(0), adxF: +adxF.toFixed(2), evMult } };
}

export function computeTAIndex(bundle, opts = {}) {
  if (!bundle) return null;
  const b = { ...bundle, eventImpact: opts.eventImpact ?? bundle.eventImpact ?? 0 };
  const direction = computeDirection(b);
  const conviction = computeConviction(b, direction);
  return { direction: direction.score, conviction: conviction.score, band: taBand(direction.score), factors: direction.factors, subs: direction.subs, convictionParts: conviction.parts };
}

// ── Bandas de ESTIRAMIENTO ────────────────────────────────────────────────────
// El backtest (scripts/backtest-taindex*.mjs) mostró que un score técnico alto
// NO predice continuación al alza — al contrario, a 1-4 semanas REVIERTE (IC −0.08,
// t −3, estable fuera de muestra). Por eso el índice NO es un meter de compra/venta:
// es un OSCILADOR DE ESTIRAMIENTO. Alto = estirado al alza (sobrecompra → riesgo de
// corrección); bajo = estirado a la baja (sobreventa → posible rebote). Paleta
// divergente: extremos altos en rojo (cautela), bajos en verde (oportunidad).
export const TA_BANDS = [
  { max: 20, key: "OVERSOLD",     es: "Muy estirado a la baja", en: "Deeply oversold",  color: "#00C805" },
  { max: 40, key: "WEAK",         es: "Estirado a la baja",     en: "Stretched down",   color: "#5BC88A" },
  { max: 60, key: "BALANCED",     es: "En equilibrio",          en: "Balanced",         color: "#9CA3AF" },
  { max: 80, key: "STRONG",       es: "Estirado al alza",       en: "Stretched up",     color: "#F59E0B" },
  { max: 100, key: "OVERBOUGHT",  es: "Muy estirado al alza",   en: "Deeply overbought", color: "#FF5000" },
];
export function taBand(score) {
  return TA_BANDS.find((b) => score <= b.max) ?? TA_BANDS[TA_BANDS.length - 1];
}

// Lectura honesta basada en el efecto validado (reversión a la media en extremos).
export function taReading(score) {
  const k = taBand(score).key;
  if (k === "OVERBOUGHT") return {
    es: "Técnicamente muy fuerte, pero estirado. El histórico favorece consolidación o corrección a 1-4 semanas. No es señal de compra: cuidado con perseguir.",
    en: "Technically very strong but stretched. History favors consolidation or a pullback over 1-4 weeks. Not a buy signal: careful chasing.",
  };
  if (k === "STRONG") return {
    es: "Sesgo técnico al alza, algo extendido. Momentum a favor, pero vigila agotamiento en los extremos.",
    en: "Upward technical bias, somewhat extended. Momentum is supportive, but watch for exhaustion at the extremes.",
  };
  if (k === "BALANCED") return {
    es: "Postura técnica equilibrada, sin estiramiento claro. Sin sesgo de reversión; manda la estructura de niveles.",
    en: "Balanced technical posture, no clear stretch. No reversion bias; levels structure dominates.",
  };
  if (k === "WEAK") return {
    es: "Sesgo técnico a la baja, algo sobrevendido. Debilidad presente, pero atento a rebotes técnicos.",
    en: "Downward technical bias, somewhat oversold. Weakness present, but watch for technical bounces.",
  };
  return {
    es: "Técnicamente muy débil y sobrevendido. El histórico favorece un rebote a 1-4 semanas. No es señal de venta: el riesgo es a contra.",
    en: "Technically very weak and oversold. History favors a bounce over 1-4 weeks. Not a sell signal: risk is to the upside.",
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function wavg(pairs) {
  let s = 0, w = 0;
  for (const [v, weight] of pairs) { if (v == null || isNaN(v)) continue; s += v * weight; w += weight; }
  return w ? s / w : null;
}
function round1(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = v == null ? null : Math.round(v * 10) / 10;
  return out;
}

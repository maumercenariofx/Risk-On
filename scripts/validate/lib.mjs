// scripts/validate/lib.mjs
// Base común de la suite de validación. Lee la serie CONGELADA
// (data/backtest/history.csv) — nunca la red — para que dos corridas del mismo
// commit den exactamente el mismo número. Ese era el defecto de fondo de los
// backtests viejos: descargaban `range=5y` en vivo y la ventana se corría un
// día por día, así que ningún resultado se podía reproducir.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const CSV = path.join(process.cwd(), "data", "backtest", "history.csv");

export function loadHistory() {
  if (!existsSync(CSV)) {
    console.error(`falta ${CSV} — corre primero: node scripts/build-history.mjs`);
    process.exit(1);
  }
  const lines = readFileSync(CSV, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const rows = lines.slice(1).map((l) => {
    const c = l.split(",");
    const o = {};
    head.forEach((h, i) => {
      const v = c[i];
      o[h] = h === "date" || h === "band" ? v : (v === "" ? null : Number(v));
    });
    return o;
  }).filter((r) => r.score != null && r.mxn_close != null);
  return rows;
}

// ── Retornos forward ─────────────────────────────────────────────────────────
// close(i) → close(i+n), en %. null si no hay n sesiones por delante.
export function forwardReturns(rows, n = 5) {
  return rows.map((_, i) => {
    if (i + n >= rows.length) return null;
    const a = rows[i].mxn_close, b = rows[i + n].mxn_close;
    return a ? ((b - a) / a) * 100 : null;
  });
}

// ── Estiramiento — MISMA definición que lib/posturaPrior.js:26 ───────────────
// No se reimplementa "parecido": si una cambia, la otra cambia en el mismo
// commit, y el propio código lo advierte.
export function stretchSeries(rows) {
  const closes = rows.map((r) => r.mxn_close);
  return closes.map((_, i) => {
    if (i < 20) return null;
    const xs = closes.slice(0, i + 1);
    const last = xs[xs.length - 1];
    const w20 = xs.slice(-20);
    const ma20 = w20.reduce((s, v) => s + v, 0) / 20;
    const diffs = [];
    for (let k = xs.length - 14; k < xs.length; k++) diffs.push(Math.abs(xs[k] - xs[k - 1]));
    const atr = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    if (!atr || !isFinite(atr)) return null;
    return (last - ma20) / atr;
  });
}

// ── Reglas de postura, parametrizadas ────────────────────────────────────────
// Los parámetros son argumentos, NO constantes: es lo que permite barrer la
// superficie de estabilidad sin tocar el código de la regla.
export const RULES = {
  // "Siempre pro-peso": la alternativa trivial contra la que todo se mide.
  base: () => () => "pro-peso",

  // Banda extrema manda, resto pro-peso.
  banda: ({ off = 32, on = 67 } = {}) => (r) =>
    r.score <= off ? "pro-peso" : r.score > on ? "pro-dolar" : "pro-peso",

  // Estiramiento: par estirado sobre su media → reversión → pro-peso.
  estiramiento: ({ th = 1 } = {}) => (r, i, ctx) => {
    const s = ctx.stretch[i];
    if (s == null) return "pro-peso";
    return s > th ? "pro-peso" : s < -th ? "pro-dolar" : "pro-peso";
  },

  // Híbrida: la banda extrema manda; si no, el estiramiento.
  hibrida: ({ off = 32, on = 67, th = 1 } = {}) => (r, i, ctx) => {
    if (r.score <= off) return "pro-peso";
    if (r.score > on) return "pro-dolar";
    const s = ctx.stretch[i];
    if (s == null) return "pro-peso";
    return s > th ? "pro-peso" : s < -th ? "pro-dolar" : "pro-peso";
  },
};

// ── Evaluación ───────────────────────────────────────────────────────────────
// Convención declarada UNA vez: señal formada con el cierre de t, entrada al
// cierre de t, salida al cierre de t+n. Es la misma que usa el marcador
// público, así que backtest y track record miden lo mismo.
export function evaluate(rows, rule, { horizon = 5, from = 0, to = null, ctx = null } = {}) {
  const end = to ?? rows.length;
  const fwd = ctx?.fwd ?? forwardReturns(rows, horizon);
  const c = ctx ?? { stretch: stretchSeries(rows), fwd };
  const trades = [];
  for (let i = from; i < end; i++) {
    const f = fwd[i];
    if (f == null) continue;
    const bias = rule(rows[i], i, c);
    // Retorno A FAVOR de la postura: positivo = la postura ganó.
    const ret = bias === "pro-peso" ? -f : bias === "pro-dolar" ? f : 0;
    const hit = bias === "pro-peso" ? f < 0 : bias === "pro-dolar" ? f > 0 : Math.abs(f) <= 0.35;
    trades.push({ i, date: rows[i].date, bias, fwd: f, ret, hit });
  }
  return trades;
}

// ── Métricas ─────────────────────────────────────────────────────────────────
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export const std = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
export const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

export function metrics(trades, { horizon = 5 } = {}) {
  if (!trades.length) return null;
  const rets = trades.map((t) => t.ret);
  const m = mean(rets), sd = std(rets);
  // Anualización por solapamiento: con ventanas de `horizon` días sobre
  // observaciones diarias hay ~252/horizon periodos independientes al año.
  const perYear = 252 / horizon;
  const sharpe = sd ? (m / sd) * Math.sqrt(perYear) : null;
  const neg = rets.filter((r) => r < 0);
  const dd = std(neg) ? (m / std(neg)) * Math.sqrt(perYear) : null;
  const gan = rets.filter((r) => r > 0).reduce((s, v) => s + v, 0);
  const per = Math.abs(rets.filter((r) => r < 0).reduce((s, v) => s + v, 0));
  // Curva de capital con exposición 1/horizon (posiciones solapadas).
  let eq = 0, peak = 0, maxDD = 0;
  for (const r of rets) {
    eq += r / horizon;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
  }
  return {
    n: trades.length,
    hit: (100 * trades.filter((t) => t.hit).length) / trades.length,
    mediaRet: m,
    medianaRet: median(rets),
    sharpe,
    sortino: dd,
    profitFactor: per ? gan / per : null,
    maxDD,
    equity: eq,
    calmar: maxDD ? eq / maxDD : null,
  };
}

export const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "—" : v.toFixed(d));
export const pct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);

// PRNG reproducible: sin semilla fija, dos corridas del mismo commit darían
// números distintos y volveríamos al problema que este directorio existe para
// resolver.
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

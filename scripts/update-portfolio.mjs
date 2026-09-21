// scripts/update-portfolio.mjs
// Portafolio simulado de 1 MDP con las posturas PUBLICADAS:
// public/data/portafolio.json, que lee /indice (components/PortafolioRecord).
//
// REGLA (versión 2, 2026-09-21 — ver docs/context/results.md)
//   · 5 tramos de 200,000 MXN. Cada postura abre un tramo con el primer tramo
//     libre; neutral = ese tramo en caja.
//   · Entrada: 7:00 CDMX (13:00 UTC) del día de publicación — apertura de la
//     vela horaria de Yahoo MXN=X. Es el primer instante en que el lector puede
//     actuar.
//   · Salida: 7:00 CDMX del 5º día hábil, cuando se publica el view que la
//     reemplaza.
//   · STOP DE CATÁSTROFE: si a las 7:00 de un día el par va en contra más de
//     3 ATR (ATR = media de |Δ| de 14 días de precios de las 7:00, medido el día
//     anterior a la entrada), el tramo sale a ese precio y queda en caja hasta
//     su vencimiento. Es la única variante que pasó la regla fijada de antemano
//     en scripts/validate/07-salidas-tamano.mjs (mejor Sharpe y menor caída en
//     21 años sin empeorar 2014-20 ni 2021-26) y casi no toca los días normales:
//     saltó 3 veces en las primeras 42 posturas. Es regla de RIESGO de la
//     simulación, no un nivel que se publique por postura (compliance: sesgo sí,
//     niveles operativos no).
//   · NO se usa la condición de invalidación del redactor: sus 4 formas de
//     ejecutarla rindieron menos que mantener (+$17.1k–19.8k vs +$22.5k), y el
//     SL 1 / TP 1.5 ATR dejó el track en +$8.6k.
//   · Costo: 0.02% ida y vuelta cuando el tramo cambia de lado o reentra tras
//     un stop. Carry: Banxico − Fed de la última fila de history.csv, a días
//     naturales / 360; pro-peso lo cobra, pro-dólar lo paga.
//   · REFERENCIA: "siempre pro-peso" con la misma ejecución y el mismo stop. La
//     diferencia entre las dos curvas es lo que aporta el redactor.
//   · NO se usa el cierre diario (interval=1d) de Yahoo para MXN=X: es una foto
//     a hora variable (el 14-sep marcó 16.9756 con el par arriba de 17.10).
//
// INMUTABILIDAD. Una operación cerrada guarda entrada, salida y motivo, y no se
// recalcula nunca, aunque Yahoo revise la vela o la ventana de 2 años de datos
// horarios ya no la alcance. Si cambia REGLA_VERSION se recalcula todo desde
// cero: el 21-sep la v1 (sin stop) vivió unas horas antes de pasar a la v2.
//
// Best-effort: corre DESPUÉS del envío y jamás tumba el workflow.
//
// Uso:  node scripts/update-portfolio.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DRY = process.argv.includes("--dry");
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "data", "portafolio.json");
const REGLA_VERSION = 2;
const H = 5;
const TRAMO = 200_000;
const CAPITAL = H * TRAMO;
const COSTO_RT = 0.02; // %
const STOP_ATR = 3;
const HORA_UTC = 13; // 7:00 CDMX
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function carryActual() {
  const lines = readFileSync(path.join(ROOT, "data", "backtest", "history.csv"), "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const k = head.indexOf("r_carry");
  for (let i = lines.length - 1; i > 0; i--) {
    const v = parseFloat(lines[i].split(",")[k]);
    if (!isNaN(v)) return v;
  }
  throw new Error("history.csv sin r_carry");
}

// Precio de las 7:00 CDMX por fecha, desde velas horarias.
async function precios7am() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/MXN=X?range=2y&interval=60m";
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Yahoo MXN=X 60m: HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp?.length || !q) throw new Error("Yahoo MXN=X 60m: respuesta vacía");
  const p7 = {};
  let ultimo = null;
  r.timestamp.forEach((ts, i) => {
    if (q.close[i] != null) ultimo = { ts, px: q.close[i] };
    if (q.open[i] == null) return;
    const d = new Date(ts * 1000);
    if (d.getUTCHours() === HORA_UTC) p7[d.toISOString().slice(0, 10)] = q.open[i];
  });
  return { p7, ultimo };
}

function leerPosturas() {
  return readdirSync(path.join(ROOT, "content"))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => ({ slug: f.slice(0, 10), bias: matter(readFileSync(path.join(ROOT, "content", f), "utf8")).data.postura_bias }))
    .filter((p) => p.bias)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

function leerAnterior() {
  const vacio = { trades: {}, trades_base: {}, daily: [] };
  if (!existsSync(OUT)) return vacio;
  try {
    const j = JSON.parse(readFileSync(OUT, "utf8"));
    if (j.regla?.version !== REGLA_VERSION) {
      console.log(`[portafolio] regla v${j.regla?.version ?? 1} → v${REGLA_VERSION}: se recalcula desde cero`);
      return vacio;
    }
    return { trades: j.trades ?? {}, trades_base: j.trades_base ?? {}, daily: j.daily ?? [] };
  } catch (e) {
    // Ilegible = no se sobrescribe: perder operaciones congeladas es peor que un día sin actualizar.
    console.error(`[portafolio] ${OUT} ilegible (${e?.message ?? e}) — NO se toca`);
    process.exit(0);
  }
}

const sign = (b) => (b === "pro-peso" ? -1 : b === "pro-dolar" ? 1 : 0);
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const r2 = (v) => Math.round(v * 100) / 100;
// Vencimiento estimado de una postura abierta: 5 días de lunes a viernes (Yahoo
// cotiza FX en feriados mexicanos, así que el calendario real es ese).
function masHabiles(slug, n) {
  const d = new Date(`${slug}T12:00:00Z`);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) n--; }
  return d.toISOString().slice(0, 10);
}

// ATR del día anterior a la entrada: media de |Δ| de 14 precios de las 7:00.
function atrAntesDe(cal, p7, slug) {
  const i = cal.indexOf(slug);
  if (i < 16) return null;
  let s = 0;
  for (let k = i - 14; k <= i - 1; k++) s += Math.abs(p7[cal[k]] - p7[cal[k - 1]]);
  return s / 14;
}

// Simula la escalera día por día. `frozen` son las operaciones ya cerradas en
// corridas anteriores: mandan sobre cualquier recálculo.
function simular({ posturas, p7, cal, frozen, carry, spot }) {
  const tramos = Array.from({ length: H }, () => ({ cap: TRAMO, lado: null, abierta: null }));
  const trades = {};

  const ops = [];
  for (const p of posturas) {
    const f = frozen[p.slug];
    const i = cal.indexOf(p.slug);
    const S0 = f?.S0 ?? p7[p.slug];
    if (S0 == null) { console.error(`[portafolio] ${p.slug}: sin precio de 7:00, se omite`); continue; }
    const vence = f?.vence ?? (i !== -1 ? cal[i + H] ?? null : null);
    ops.push({
      slug: p.slug, bias: p.bias, s: sign(p.bias), S0, vence,
      atr: f?.atr ?? atrAntesDe(cal, p7, p.slug),
      cierre: f ? { d: f.exit, px: f.S1, motivo: f.motivo } : null,
    });
  }

  const pnlDe = (o, px, d) => {
    if (o.s === 0) return 0;
    return (o.s * (px - o.S0)) / o.S0 - (o.s * carry / 100) * dias(o.slug, d) / 360;
  };
  const liquidar = (t, o, d, px, motivo) => {
    const ret = pnlDe(o, px, d) - o.costo / 100;
    const pnl = t.cap * ret;
    trades[o.slug] = {
      bias: o.bias, S0: +o.S0.toFixed(4), exit: d, S1: +px.toFixed(4), vence: o.vence, motivo,
      atr: o.atr == null ? null : +o.atr.toFixed(5), ret_pct: +(100 * ret).toFixed(4), pnl: r2(pnl),
    };
    t.cap += pnl;
    o.liquidada = true;
    if (motivo === "stop") t.lado = null; // reentrar tras un stop sí cruza el spread
  };

  const porFecha = Object.fromEntries(ops.map((o) => [o.slug, o]));
  const daily = [];
  let peak = CAPITAL, maxDD = 0;
  for (const d of cal.filter((x) => x >= ops[0].slug)) {
    const px = p7[d];
    for (const t of tramos) {
      const o = t.abierta;
      if (!o) continue;
      if (!o.liquidada) {
        const congelada = o.cierre && o.cierre.d === d;
        if (congelada) liquidar(t, o, d, o.cierre.px, o.cierre.motivo);
        else if (!o.cierre && o.vence === d) liquidar(t, o, d, px, "tiempo");
        else if (!o.cierre && o.s !== 0 && o.atr && o.s * (px - o.S0) <= -STOP_ATR * o.atr) liquidar(t, o, d, px, "stop");
      }
      if (o.vence === d) t.abierta = null; // el tramo se libera en su vencimiento original
    }
    const o = porFecha[d];
    if (o) {
      const t = tramos.find((x) => !x.abierta);
      if (!t) console.error(`[portafolio] ${d}: sin tramo libre, se omite`);
      else {
        o.costo = o.s !== 0 && o.s !== t.lado ? COSTO_RT : 0;
        if (o.s !== 0) t.lado = o.s;
        t.abierta = o;
      }
    }
    const v = tramos.reduce((acc, t) => {
      const a = t.abierta;
      return acc + (a && !a.liquidada ? t.cap * (1 + pnlDe(a, px, d)) : t.cap);
    }, 0);
    peak = Math.max(peak, v);
    maxDD = Math.max(maxDD, (peak - v) / peak);
    daily.push({ d, v: Math.round(v), px: +px.toFixed(4) });
  }

  // Posiciones abiertas, marcadas al último precio horario.
  const hoy = new Date(spot.ts * 1000).toISOString().slice(0, 10);
  const abiertas = tramos.filter((t) => t.abierta).map((t) => {
    const o = t.abierta;
    return {
      slug: o.slug, bias: o.bias, S0: +o.S0.toFixed(4), vence: o.vence ?? masHabiles(o.slug, H),
      capital: r2(t.cap), pnl: o.liquidada ? 0 : r2(t.cap * pnlDe(o, spot.px, hoy)),
      stop: o.liquidada ? trades[o.slug]?.exit ?? null : null,
    };
  }).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const cerrado = tramos.reduce((a, t) => a + t.cap, 0);
  const valorHoy = cerrado + abiertas.reduce((a, x) => a + x.pnl, 0);

  return { trades, daily, abiertas, cerrado, valorHoy, maxDD };
}

function mensual(daily) {
  const out = [];
  let prevFin = CAPITAL, prevBase = CAPITAL;
  for (const d of daily) {
    const m = d.d.slice(0, 7);
    let row = out[out.length - 1];
    if (!row || row.mes !== m) { row = { mes: m, inicio: prevFin, inicioB: prevBase }; out.push(row); }
    row.fin = d.v; row.finB = d.b;
    prevFin = d.v; prevBase = d.b;
  }
  return out.map((r) => ({
    mes: r.mes,
    pnl: Math.round(r.fin - r.inicio),
    ret_pct: +((100 * (r.fin - r.inicio)) / r.inicio).toFixed(2),
    pnl_base: r.finB == null ? null : Math.round(r.finB - r.inicioB),
  }));
}

const main = async () => {
  const posturas = leerPosturas();
  if (!posturas.length) { console.log("[portafolio] sin posturas publicadas"); return; }
  const prev = leerAnterior();
  const carry = carryActual();
  const { p7, ultimo } = await precios7am();
  const cal = Object.keys(p7).filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())).sort();

  const sim = simular({ posturas, p7, cal, frozen: prev.trades, carry, spot: ultimo });
  // Referencia: las mismas fechas, siempre pro-peso, misma ejecución y stop.
  const base = simular({
    posturas: posturas.map((p) => ({ slug: p.slug, bias: "pro-peso" })),
    p7, cal, frozen: prev.trades_base, carry, spot: ultimo,
  });

  // Puntos diarios que Yahoo ya no cubre: se conservan del archivo anterior.
  const bPorFecha = Object.fromEntries(base.daily.map((x) => [x.d, x.v]));
  const nuevos = sim.daily.map((x) => ({ ...x, b: bPorFecha[x.d] ?? null }));
  const daily = [...prev.daily.filter((x) => x.d < nuevos[0].d), ...nuevos];
  const trades = { ...sim.trades, ...prev.trades }; // lo congelado manda
  const trades_base = { ...base.trades, ...prev.trades_base };

  const cerradas = Object.values(trades).filter((t) => t.bias !== "neutral");
  const gan = cerradas.filter((t) => t.pnl > 0), per = cerradas.filter((t) => t.pnl <= 0);
  const media = (a) => (a.length ? a.reduce((s, t) => s + t.pnl, 0) / a.length : null);
  const habiles = daily.length - 1;
  const ret = sim.valorHoy / CAPITAL - 1;

  const out = {
    regla: {
      version: REGLA_VERSION,
      capital: CAPITAL, tramos: H, tramo: TRAMO, horizonte_dias: H,
      entrada: "7:00 CDMX del día de publicación", salida: "7:00 CDMX del 5º día hábil",
      stop_atr: STOP_ATR, costo_rt_pct: COSTO_RT, carry_pct: carry,
      fuente: "Yahoo Finance · MXN=X, velas de 1 hora",
    },
    generado: new Date().toISOString(),
    spot: { px: +ultimo.px.toFixed(4), ts: new Date(ultimo.ts * 1000).toISOString() },
    resumen: {
      desde: posturas[0].slug,
      valor: Math.round(sim.valorHoy),
      pnl: Math.round(sim.valorHoy - CAPITAL),
      ret_pct: +(100 * ret).toFixed(2),
      pnl_cerrado: Math.round(sim.cerrado - CAPITAL),
      dias_habiles: habiles,
      // Anualizado compuesto; la UI lo muestra con la advertencia de muestra chica.
      anualizado_pct: habiles > 0 ? +(100 * ((1 + ret) ** (252 / habiles) - 1)).toFixed(1) : null,
      max_dd_pct: +(100 * sim.maxDD).toFixed(2),
      cerradas: cerradas.length,
      ganadoras: gan.length,
      stops: cerradas.filter((t) => t.motivo === "stop").length,
      ganancia_media: media(gan) == null ? null : Math.round(media(gan)),
      perdida_media: media(per) == null ? null : Math.round(media(per)),
      base_valor: Math.round(base.valorHoy),
      base_pnl: Math.round(base.valorHoy - CAPITAL),
      ventaja: Math.round(sim.valorHoy - base.valorHoy),
    },
    mensual: mensual(daily),
    abiertas: sim.abiertas,
    daily,
    trades,
    trades_base,
  };

  const r = out.resumen;
  console.log(
    `[portafolio] ${posturas.length} posturas · ${r.cerradas} direccionales cerradas (${r.stops} por stop) · ` +
    `valor $${r.valor.toLocaleString("en-US")} (${r.ret_pct}%) · siempre pro-peso $${r.base_valor.toLocaleString("en-US")} · ` +
    `ventaja ${r.ventaja >= 0 ? "+" : ""}$${r.ventaja.toLocaleString("en-US")} · ${sim.abiertas.length} abiertas`
  );
  if (DRY) { console.log("[portafolio] --dry: no se escribió nada"); return; }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`[portafolio] escrito ${OUT}`);
};

main().catch((e) => {
  console.error(`[portafolio] falló (se ignora): ${e?.message ?? e}`);
  process.exit(0);
});

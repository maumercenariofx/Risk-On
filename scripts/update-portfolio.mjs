// scripts/update-portfolio.mjs
// Portafolio simulado de 1 MDP con las posturas PUBLICADAS:
// public/data/portafolio.json, que lee /indice (components/PortafolioRecord).
//
// REGLA DE EJECUCIÓN (decidida 2026-09-21, ver docs/context/results.md)
//   · 5 tramos de 200,000 MXN. Cada postura abre un tramo con el primer tramo
//     libre; neutral = ese tramo en caja.
//   · Entrada: 7:00 CDMX (13:00 UTC) del día de publicación — apertura de la
//     vela horaria de Yahoo MXN=X. Es el primer instante en que el lector puede
//     actuar.
//   · Salida: 7:00 CDMX del 5º día hábil. Es el instante en que se publica el
//     view que reemplaza a la postura, así que el tramo rola sin hueco.
//   · Sin salida anticipada por la condición de invalidación. Se probaron
//     cuatro variantes (cierre → 7:00, dos cierres, cierre → cierre, toque
//     intradía) y las cuatro rindieron MENOS que mantener 5 días sobre las 42
//     posturas direccionales del 10-jul al 21-sep: +$22.5k sin condición vs
//     +$17.1k a +$19.8k con ella. Las condiciones cortaban más ganadoras que
//     perdedoras.
//   · Costo: 0.02% ida y vuelta cuando el tramo cambia de lado al rolar.
//   · Carry: Banxico − Fed de la última fila de data/backtest/history.csv, a
//     días naturales / 360. Pro-peso lo cobra, pro-dólar lo paga.
//   · NO se usa el cierre diario (interval=1d) de Yahoo para MXN=X: es una foto
//     a hora variable. El 14-sep marcó 16.9756 con el par todo el día arriba
//     de 17.10 en sus propias velas horarias (2026-09-21).
//
// INMUTABILIDAD. Igual que el ledger: una operación cerrada guarda su precio de
// entrada y de salida y no se recalcula nunca, aunque Yahoo revise la vela o
// la ventana de 2 años de datos horarios ya no la alcance. Los puntos diarios
// de fechas que Yahoo ya no cubre se conservan del archivo anterior.
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
const H = 5;
const TRAMO = 200_000;
const CAPITAL = H * TRAMO;
const COSTO_RT = 0.02; // %
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
  if (!existsSync(OUT)) return { trades: {}, daily: [] };
  try {
    const j = JSON.parse(readFileSync(OUT, "utf8"));
    return { trades: j.trades ?? {}, daily: j.daily ?? [] };
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

function simular({ posturas, p7, cal, prev, carry, spot }) {
  const tramos = Array.from({ length: H }, () => ({ cap: TRAMO, libre: "", lado: null, abierta: null }));
  const trades = {};
  const ops = []; // en orden de apertura: { slug, bias, s, S0, salida, S1, cap, costo }

  for (const p of posturas) {
    const frozen = prev.trades[p.slug];
    const i = cal.indexOf(p.slug);
    const S0 = frozen?.S0 ?? p7[p.slug];
    if (S0 == null) { console.error(`[portafolio] ${p.slug}: sin precio de 7:00, se omite`); continue; }
    const salida = frozen?.exit ?? (i !== -1 ? cal[i + H] ?? null : null);
    const S1 = frozen?.S1 ?? (salida ? p7[salida] ?? null : null);
    ops.push({ slug: p.slug, bias: p.bias, s: sign(p.bias), S0, salida, S1 });
  }

  // Valuación diaria. Cada día, primero vencen los tramos que salen a las 7:00
  // de hoy y luego se abre la postura de hoy en el primer tramo libre.
  const valor = (d, px) => tramos.reduce((acc, t) => {
    const o = t.abierta;
    if (!o || o.s === 0) return acc + t.cap;
    const fx = (o.s * (px - o.S0)) / o.S0;
    const c = (-o.s * carry / 100) * dias(o.slug, d) / 360;
    return acc + t.cap * (1 + fx + c);
  }, 0);

  const porFecha = Object.fromEntries(ops.map((o) => [o.slug, o]));
  const fechas = cal.filter((d) => d >= ops[0].slug);
  const daily = [];
  let peak = CAPITAL, maxDD = 0;
  for (const d of fechas) {
    for (const t of tramos) {
      const o = t.abierta;
      if (o && o.salida === d) {
        const fx = (o.s * (o.S1 - o.S0)) / o.S0;
        const c = (-o.s * carry / 100) * dias(o.slug, o.salida) / 360;
        const ret = o.s === 0 ? 0 : fx + c - o.costo / 100;
        const pnl = t.cap * ret;
        trades[o.slug] = {
          bias: o.bias, S0: +o.S0.toFixed(4), exit: o.salida, S1: +o.S1.toFixed(4),
          ret_pct: +(100 * ret).toFixed(4), pnl: r2(pnl),
        };
        t.cap += pnl;
        t.abierta = null;
      }
    }
    const o = porFecha[d];
    if (o) {
      const t = tramos.find((x) => !x.abierta);
      if (!t) { console.error(`[portafolio] ${d}: sin tramo libre, se omite`); }
      else {
        o.costo = o.s !== 0 && o.s !== t.lado ? COSTO_RT : 0;
        o.cap0 = t.cap;
        t.lado = o.s;
        t.abierta = o;
      }
    }
    const v = valor(d, p7[d]);
    peak = Math.max(peak, v);
    maxDD = Math.max(maxDD, (peak - v) / peak);
    daily.push({ d, v: Math.round(v), px: +p7[d].toFixed(4) });
  }

  // Posiciones abiertas, marcadas al último precio horario.
  const hoy = new Date(spot.ts * 1000).toISOString().slice(0, 10);
  const abiertas = tramos.filter((t) => t.abierta).map((t) => {
    const o = t.abierta;
    const fx = o.s === 0 ? 0 : (o.s * (spot.px - o.S0)) / o.S0;
    const c = o.s === 0 ? 0 : (-o.s * carry / 100) * dias(o.slug, hoy) / 360;
    return {
      slug: o.slug, bias: o.bias, S0: +o.S0.toFixed(4), vence: o.salida ?? masHabiles(o.slug, H),
      capital: r2(t.cap), pnl: r2(t.cap * (fx + c)),
    };
  }).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const cerrado = tramos.reduce((a, t) => a + t.cap, 0);
  const valorHoy = cerrado + abiertas.reduce((a, x) => a + x.pnl, 0);

  return { trades, daily, abiertas, cerrado, valorHoy, maxDD };
}

function mensual(daily) {
  const out = [];
  let prevFin = CAPITAL;
  for (const d of daily) {
    const m = d.d.slice(0, 7);
    let row = out[out.length - 1];
    if (!row || row.mes !== m) { row = { mes: m, inicio: prevFin }; out.push(row); }
    row.fin = d.v;
    prevFin = d.v;
  }
  return out.map((r) => ({ mes: r.mes, pnl: Math.round(r.fin - r.inicio), ret_pct: +((100 * (r.fin - r.inicio)) / r.inicio).toFixed(2) }));
}

const main = async () => {
  const posturas = leerPosturas();
  if (!posturas.length) { console.log("[portafolio] sin posturas publicadas"); return; }
  const prev = leerAnterior();
  const carry = carryActual();
  const { p7, ultimo } = await precios7am();
  const cal = Object.keys(p7).filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())).sort();

  const sim = simular({ posturas, p7, cal, prev, carry, spot: ultimo });

  // Puntos diarios que Yahoo ya no cubre: se conservan del archivo anterior.
  const cubiertas = new Set(sim.daily.map((x) => x.d));
  const daily = [...prev.daily.filter((x) => !cubiertas.has(x.d) && x.d < sim.daily[0].d), ...sim.daily];
  const trades = { ...sim.trades, ...prev.trades }; // lo congelado manda

  const cerradas = Object.values(trades).filter((t) => t.bias !== "neutral");
  const gan = cerradas.filter((t) => t.pnl > 0), per = cerradas.filter((t) => t.pnl <= 0);
  const media = (a) => (a.length ? a.reduce((s, t) => s + t.pnl, 0) / a.length : null);
  const habiles = daily.length - 1;
  const ret = sim.valorHoy / CAPITAL - 1;

  const out = {
    regla: {
      capital: CAPITAL, tramos: H, tramo: TRAMO, horizonte_dias: H,
      entrada: "7:00 CDMX del día de publicación", salida: "7:00 CDMX del 5º día hábil",
      costo_rt_pct: COSTO_RT, carry_pct: carry, fuente: "Yahoo Finance · MXN=X, velas de 1 hora",
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
      ganancia_media: media(gan) == null ? null : Math.round(media(gan)),
      perdida_media: media(per) == null ? null : Math.round(media(per)),
    },
    mensual: mensual(daily),
    abiertas: sim.abiertas,
    daily,
    trades,
  };

  const r = out.resumen;
  console.log(`[portafolio] ${posturas.length} posturas · ${r.cerradas} direccionales cerradas · valor $${r.valor.toLocaleString("en-US")} (${r.ret_pct}%) · ${sim.abiertas.length} abiertas`);
  if (DRY) { console.log("[portafolio] --dry: no se escribió nada"); return; }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`[portafolio] escrito ${OUT}`);
};

main().catch((e) => {
  console.error(`[portafolio] falló (se ignora): ${e?.message ?? e}`);
  process.exit(0);
});

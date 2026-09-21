// scripts/validate/07-salidas-tamano.mjs
// Prueba 7: ¿mejora el portafolio de 1 MDP si en vez de salir a los 5 días se
// sale por stop / take-profit con ATR, o si el tamaño se ajusta a la vol?
// Propuesta externa del 2026-09-21 ("vende por TP, SL o BE, con R:B ≥ 1.5 y
// tamaño por volatilidad").
//
// Variantes (misma escalera 5 × 200k, señal de t−1, entrada al fixing de t):
//   A  5 días, sin stop                                   (referencia actual)
//   B  stop de catástrofe a 3 ATR                          (solo corta colas)
//   C  SL 1 ATR · TP 1.5 ATR · tope de tiempo 5 días        (la propuesta)
//   D  5 días, tamaño por vol: peso = min(VOL_OBJ / vol20, TOPE)
//   E  B + D
// Un tramo que sale antes queda en caja hasta su vencimiento original.
// Stops y TP se evalúan al fixing diario (la serie no tiene máximos/mínimos):
// es la versión "al cierre", no la de toque intradía.
//
// Regla de decisión FIJADA ANTES de ver resultados: gana la variante que
// mejore Sharpe Y caída máxima contra A en 21 años, sin empeorar el Sharpe en
// ninguno de los dos tramos 2014-20 y 2021-26.
//
// Uso:  node scripts/validate/07-salidas-tamano.mjs

import { loadHistory, mean, std, fmt } from "./lib.mjs";

const H = 5, CAP = 1_000_000, COSTO = 0.02, VOL_OBJ = 10, TOPE = 1.5;
const rows = loadHistory();
const px = rows.map((r) => r.mxn_close);
const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// ATR de cierres (misma definición que stretchSeries: media de |Δ| 14 días) y
// vol realizada anualizada de 20 días, en %.
const atr = px.map((_, i) => {
  if (i < 15) return null;
  let s = 0; for (let k = i - 13; k <= i; k++) s += Math.abs(px[k] - px[k - 1]);
  return s / 14;
});
const vol = px.map((_, i) => {
  if (i < 21) return null;
  const r = []; for (let k = i - 19; k <= i; k++) r.push(Math.log(px[k] / px[k - 1]));
  return std(r) * Math.sqrt(252) * 100;
});

const REGLAS = {
  "Siempre pro-peso": () => -1,
  "Seguir el índice": (r) => (r.score >= 50 ? -1 : 1),
};
const VARIANTES = {
  A: { sl: null, tp: null, vt: false },
  B: { sl: 3, tp: null, vt: false },
  C: { sl: 1, tp: 1.5, vt: false },
  D: { sl: null, tp: null, vt: true },
  E: { sl: 3, tp: null, vt: true },
};

// Una operación: abre en t con la señal de t−1; sale en el primer fixing que
// toca SL/TP o en t+5. Devuelve la ruta diaria de su retorno para el MTM.
function operacion(t, s, v, cobra = true) {
  const S0 = px[t], a = atr[t - 1];
  const w = v.vt && vol[t - 1] ? Math.min(VOL_OBJ / vol[t - 1], TOPE) : 1;
  const carry = rows[t - 1].r_carry ?? 0;
  const ruta = [];
  let fin = t + H, motivo = "tiempo";
  for (let k = t + 1; k <= t + H; k++) {
    const mov = s * (px[k] - S0); // a favor de la postura, en pesos por dólar
    const r = w * (s * (px[k] - S0) / S0 - s * carry / 100 * dias(rows[t].date, rows[k].date) / 360);
    ruta.push(r);
    if (a && v.sl && mov <= -v.sl * a) { fin = k; motivo = "sl"; break; }
    if (a && v.tp && mov >= v.tp * a) { fin = k; motivo = "tp"; break; }
  }
  // Costo solo si el tramo cambia de lado o reentra tras un stop: rolar la misma
  // postura no cruza el spread.
  const ret = ruta[ruta.length - 1] - (cobra ? w * COSTO / 100 : 0);
  return { t, fin, ret, ruta, motivo, w };
}

function simula(regla, v, desde, hasta) {
  const i0 = rows.findIndex((r) => r.date >= desde);
  let i1 = rows.findIndex((r) => r.date > hasta); if (i1 === -1) i1 = rows.length;
  const tramos = Array.from({ length: H }, () => ({ cap: CAP / H, op: null, lado: null, motivo: null }));
  const ops = [], eq = [];
  for (let t = Math.max(i0, 30); t < i1; t++) {
    // Liquida lo que salió (por tiempo o por stop) y libera el tramo en t+5.
    for (const tr of tramos) {
      if (tr.op && tr.op.fin === t) { tr.cap *= 1 + tr.op.ret; ops.push(tr.op); tr.op = { ...tr.op, cerrada: true }; }
      if (tr.op && tr.op.t + H === t) tr.op = null;
    }
    if (t + H < i1) {
      const tr = tramos.find((x) => !x.op);
      if (tr) {
        const lado = REGLAS[regla](rows[t - 1]);
        tr.op = operacion(t, lado, v, lado !== tr.lado || tr.motivo !== "tiempo");
        tr.lado = lado; tr.motivo = tr.op.motivo;
      }
    }
    const valor = tramos.reduce((acc, tr) => {
      const o = tr.op;
      if (!o || o.cerrada || t === o.t) return acc + tr.cap;
      return acc + tr.cap * (1 + o.ruta[Math.min(t - o.t, o.ruta.length) - 1]);
    }, 0);
    eq.push(valor);
  }
  const rd = eq.slice(1).map((v, i) => v / eq[i] - 1);
  let pk = eq[0], dd = 0; for (const v of eq) { pk = Math.max(pk, v); dd = Math.max(dd, (pk - v) / pk); }
  const años = (i1 - Math.max(i0, 30)) / 252;
  const rs = ops.map((o) => o.ret * 100);
  const gan = rs.filter((x) => x > 0), per = rs.filter((x) => x <= 0);
  return {
    total: eq[eq.length - 1] / CAP - 1,
    cagr: (eq[eq.length - 1] / CAP) ** (1 / años) - 1,
    sharpe: mean(rd) / std(rd) * Math.sqrt(252),
    dd, n: ops.length, hit: gan.length / rs.length,
    gan: mean(gan), per: mean(per), E: mean(rs),
    sl: ops.filter((o) => o.motivo === "sl").length, tp: ops.filter((o) => o.motivo === "tp").length,
  };
}

const fin = rows[rows.length - 1].date;
const menos = (a) => `${+fin.slice(0, 4) - a}${fin.slice(4)}`;
const VENTANAS = [
  ["YTD", `${fin.slice(0, 4)}-01-01`, fin],
  ["1 año", menos(1), fin],
  ["3 años", menos(3), fin],
  ["5 años", menos(5), fin],
  ["21 años", rows[0].date, fin],
  ["2014-20", "2014-01-01", "2020-12-31"],
  ["2021-26", "2021-01-01", fin],
];
const pct = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(100 * v).toFixed(d) + "%";

console.log(`\nSerie ${rows[0].date} → ${fin} · vol objetivo ${VOL_OBJ}% (tope ${TOPE}x) · costo ${COSTO}% al cambiar de lado o reentrar`);
const res = {};
for (const regla of Object.keys(REGLAS)) {
  console.log(`\n══ ${regla} ══`);
  console.log("ventana   var   total     CAGR   Sharpe  caída máx  acierto  gana/op  pierde/op   E/op   SL/TP");
  for (const [nom, d, h] of VENTANAS) {
    for (const [k, v] of Object.entries(VARIANTES)) {
      const m = simula(regla, v, d, h);
      res[`${regla}|${nom}|${k}`] = m;
      console.log(
        nom.padEnd(9) + k.padStart(4) + pct(m.total).padStart(9) + pct(m.cagr).padStart(9) + fmt(m.sharpe).padStart(8) +
        ("−" + (100 * m.dd).toFixed(1) + "%").padStart(10) + ((100 * m.hit).toFixed(1) + "%").padStart(9) +
        (fmt(m.gan, 2) + "%").padStart(9) + (fmt(m.per, 2) + "%").padStart(10) + (fmt(m.E, 3) + "%").padStart(9) +
        `${m.sl}/${m.tp}`.padStart(9)
      );
    }
    console.log();
  }
}

console.log("── VEREDICTO (regla fijada de antemano) ──");
for (const regla of Object.keys(REGLAS)) {
  const A = (v) => res[`${regla}|${v}|A`];
  for (const k of ["B", "C", "D", "E"]) {
    const X = (v) => res[`${regla}|${v}|${k}`];
    const c1 = X("21 años").sharpe > A("21 años").sharpe;
    const c2 = X("21 años").dd < A("21 años").dd;
    const c3 = X("2014-20").sharpe >= A("2014-20").sharpe && X("2021-26").sharpe >= A("2021-26").sharpe;
    console.log(`  ${c1 && c2 && c3 ? "PASA " : "FALLA"} ${regla.padEnd(18)} ${k}  Sharpe21 ${c1 ? "✓" : "✗"} · caída21 ${c2 ? "✓" : "✗"} · ambos tramos ${c3 ? "✓" : "✗"}`);
  }
}
console.log();

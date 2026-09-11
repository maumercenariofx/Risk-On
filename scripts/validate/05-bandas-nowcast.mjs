// scripts/validate/05-bandas-nowcast.mjs
// Prueba 5 del marco: ¿las bandas del índice describen regímenes que ocurren,
// y ese régimen dice algo de la volatilidad que viene?
//
// POR QUÉ (todo.md, 2026-09-10). Desde la recalibración del 13-jul-2026 el
// score publicado vivió entre 40 y 66: cero días RISK-OFF en toda la historia
// en vivo, cero RISK-ON desde julio y 30 views seguidos en CONSTRUCTIVE. El
// explicador promete cuatro regímenes y el lector solo ha visto dos. Antes de
// mover cortes hay que saber si eso es un defecto de las bandas o un verano
// tranquilo, y eso lo dicen los 21 años congelados, no 73 views.
//
// Segunda mitad: el producto dice que el score es un NOWCAST del régimen (la
// dirección ya se probó en 01-03 y no hay edge). Si lo es, la banda al publicar
// tiene que ordenar la volatilidad realizada del USD/MXN que viene y decir algo
// que la vol pasada no diga ya. Si con la vol de 20 días en la mano la banda no
// agrega nada, la banda es la vol pasada con otro nombre.
//
// CONVENCIONES (declaradas una vez)
//   · Banda formada con el cierre de t: la de history.csv, cortes de BAND_CUTS
//     (réplica de lib/riskScore.js). El score no se recalcula.
//   · |ret5| = |cierre(t+5)/cierre(t) − 1| en %, la serie de forwardReturns().
//   · RV_h hacia adelante = √(252 · media de r²) sobre t+1..t+h, r logarítmico,
//     en % anual. Sin restar la media: con 5 retornos, estimarla cuesta un grado
//     de libertad para quitar un término que en FX diario es ruido.
//   · Benchmark ingenuo = el MISMO estimador sobre t−19..t: la vol que ya se
//     conocía al cierre con que se formó la banda. Mismo estimador de los dos
//     lados, para que la comparación no la gane una definición.
//   · Muestra: wsum ≥ 83. Fuera las primeras 39 sesiones de 2005, en que las
//     ventanas dinámicas no estaban llenas y el score salía de 1-3 señales (hay
//     días con score 100 y wsum 7). El nowcast pide además 20 sesiones de
//     historia y 20 por delante.
//   · IC95 por bootstrap de BLOQUES MÓVILES (60 sesiones, 2000 réplicas,
//     semilla fija). Bloques largos porque las ventanas hacia adelante se
//     traslapan hasta 20 días y la vol se agrupa por meses: con remuestreo iid,
//     160 días RISK-OFF que son un puñado de episodios pasarían por 160
//     observaciones independientes. Por eso también se cuentan los episodios.
//   · Episodios (2008-09, 2011, …): son censos, no muestras — conteo exacto,
//     sin IC.
//
// CRITERIOS DE DECISIÓN
//   · ORDENA: OFF > DEF > CON > ON en la RV20 futura, con las tres diferencias
//     adyacentes > 0 e IC95 fuera del cero.
//   · AGREGA: con la vol20 pasada en la regresión, el modelo con banda baja el
//     error cuadrático FUERA de muestra con IC95 fuera del cero. Prueba 2014-26,
//     reajustando cada año con toda la historia previa y purga de 20 sesiones
//     (la etiqueta RV20 de las últimas filas del ajuste cae dentro del año de
//     prueba). Un ΔR² dentro de muestra no basta.
//   · ESTABLE: el orden de las medias se sostiene en los tres tramos.
//
// Solo lee archivos locales (history.csv y, para A5, el front-matter de
// content/); ninguna red. Dos corridas del mismo commit dan la misma salida.
//
// Uso:  node scripts/validate/05-bandas-nowcast.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadHistory, forwardReturns, mean, median, fmt, rng } from "./lib.mjs";
import { BAND_CUTS, bandOf, WEIGHTS } from "../lib/histScore.mjs";

const BANDAS = ["RISK-OFF", "DEFENSIVE", "CONSTRUCTIVE", "RISK-ON"];
const AB = ["OFF", "DEF", "CON", "ON"];
const WSUM_MIN = 83;
const BLOQUE = 60, REPS = 2000, SEMILLA = 42;
const HUECO_EPISODIO = 10; // sesiones sin la banda que parten un episodio en dos
const OOS_DESDE = 2014, PURGA = 20;

const TRAMOS = [
  ["2005-13", "2005-01-01", "2013-12-31"],
  ["2014-20", "2014-01-01", "2020-12-31"],
  ["2021-26", "2021-01-01", "2026-12-31"],
];
// Ventanas elegidas por el evento, no por el score. Picos verificados en la
// propia serie (DEXMXUS de history.csv).
const EPISODIOS = [
  ["GFC 2008-09", "2008-09-01", "2009-03-31"], // Lehman → pico de 15.41 el 2-mar-2009
  ["2011", "2011-08-01", "2011-12-30"],        // degradación de EE.UU. + deuda europea
  ["Taper 2013", "2013-05-22", "2013-09-18"],  // testimonio de Bernanke → "no taper"
  ["Trump 2016", "2016-09-01", "2017-01-31"],  // debates → pico de 21.89 el 19-ene-2017
  ["Covid 2020", "2020-02-20", "2020-05-29"],  // pico de 25.13 el 24-mar-2020
  ["2022", "2022-01-03", "2022-12-30"],        // Fed de 0.25 a 4.5, Ucrania, curva invertida
  ["Verano 2026", "2026-06-01", "2026-08-21"], // mismo tramo que los views en vivo (la serie acaba el 21-ago)
  ["Desde 13-jul", "2026-07-13", "2026-08-21"], // desde la recalibración de cortes
];
// Largo de la historia en vivo al 2026-09-11: 45 views desde el 13-jul (ninguno
// RISK-OFF ni RISK-ON) y 73 desde el 2-jun (ninguno RISK-OFF).
const VENTANAS_VIVO = [45, 73];

// ── Utilidades ───────────────────────────────────────────────────────────────
const srt = (a) => Float64Array.from(a).sort();
const q = (s, p) => {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
};
const f1 = (v) => fmt(v, 1);
const sg = (v, d = 2) => (v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d));
const icS = (c, d = 1, signo = false) => `[${signo ? sg(c[0], d) : fmt(c[0], d)}, ${signo ? sg(c[1], d) : fmt(c[1], d)}]`;
const L = (s, w) => String(s).padEnd(w);
const R = (s, w) => String(s).padStart(w);
const tramoDe = (d) => (d < "2014-01-01" ? 0 : d < "2021-01-01" ? 1 : 2);
const col = (M, k) => M.map((r) => r[k]);

// ── Bootstrap por bloques móviles ────────────────────────────────────────────
// El plan (inicios de bloque) depende solo de n y de la semilla, así que todas
// las estadísticas de una misma muestra se remuestrean con los MISMOS bloques:
// las diferencias entre bandas salen de réplicas pareadas.
function plan(n) {
  const Lb = Math.min(BLOQUE, n), nb = Math.ceil(n / Lb), r = rng(SEMILLA);
  const starts = new Int32Array(REPS * nb);
  for (let k = 0; k < starts.length; k++) starts[k] = Math.floor(r() * (n - Lb + 1));
  return { n, Lb, nb, starts, buf: new Int32Array(n) };
}
function replica(p, b) {
  let m = 0;
  for (let k = 0; k < p.nb && m < p.n; k++) {
    const s = p.starts[b * p.nb + k];
    for (let j = 0; j < p.Lb && m < p.n; j++) p.buf[m++] = s + j;
  }
  return p.buf;
}
function boot(p, stat) {
  const out = [];
  for (let b = 0; b < REPS; b++) out.push(stat(replica(p, b)));
  return out;
}
const ic95 = (vals) => {
  const v = srt(vals.filter(Number.isFinite));
  return v.length ? [q(v, 0.025), q(v, 0.975)] : [NaN, NaN];
};

// ── OLS por ecuaciones normales ──────────────────────────────────────────────
// X plano (n·p). Una columna sin variación en la réplica (una banda que el
// remuestreo no tocó) sale del sistema y su coeficiente queda NaN.
function ols(X, p, y, idx = null) {
  const A = new Float64Array(p * p), v = new Float64Array(p);
  let m = 0, sy = 0, syy = 0;
  const n = idx ? idx.length : y.length;
  for (let t = 0; t < n; t++) {
    const j = idx ? idx[t] : t, o = j * p, yj = y[j];
    for (let a = 0; a < p; a++) {
      const xa = X[o + a];
      if (xa === 0) continue;
      v[a] += xa * yj;
      for (let c = a; c < p; c++) A[a * p + c] += xa * X[o + c];
    }
    m++; sy += yj; syy += yj * yj;
  }
  const act = [];
  for (let a = 0; a < p; a++) if (A[a * p + a] > 1e-9) act.push(a);
  const k = act.length;
  const M = act.map((a) => [...act.map((c) => (c >= a ? A[a * p + c] : A[c * p + a])), v[a]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-10) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let cc = c; cc <= k; cc++) M[r][cc] -= f * M[c][cc];
    }
  }
  const beta = new Array(p).fill(NaN);
  act.forEach((a, r) => (beta[a] = M[r][k] / M[r][r]));
  let bxy = 0;
  for (const a of act) bxy += beta[a] * v[a];
  return { beta, r2: 1 - (syy - bxy) / (syy - (sy * sy) / m) };
}
// Una banda que no apareció en el ajuste no tiene coeficiente: predice como la
// referencia (CONSTRUCTIVE) en vez de propagar NaN.
const predice = (beta, X, p, j) => {
  let s = 0;
  for (let a = 0; a < p; a++) if (X[j * p + a] && isFinite(beta[a])) s += beta[a] * X[j * p + a];
  return s;
};

// Diseños: vol20 sola, + dummies de banda (CONSTRUCTIVE de referencia), + score
// continuo, + VIX, + VIX y banda. `tf` transforma objetivo y vol pasada (log o nada).
function diseno(sub, bi, tipo, tf = (x) => x) {
  const cols = {
    base: (s) => [1, tf(s.p20)],
    banda: (s, k) => [1, tf(s.p20), bi[k] === 0 ? 1 : 0, bi[k] === 1 ? 1 : 0, bi[k] === 3 ? 1 : 0],
    score: (s) => [1, tf(s.p20), s.score],
    vix: (s) => [1, tf(s.p20), tf(s.vix)],
    vixbanda: (s, k) => [1, tf(s.p20), tf(s.vix), bi[k] === 0 ? 1 : 0, bi[k] === 1 ? 1 : 0, bi[k] === 3 ? 1 : 0],
  }[tipo];
  const p = cols(sub[0], 0).length, X = new Float64Array(sub.length * p);
  sub.forEach((s, k) => X.set(cols(s, k), k * p));
  return { X, p };
}

// ── Datos ────────────────────────────────────────────────────────────────────
const CSV = path.join(process.cwd(), "data", "backtest", "history.csv");
const sha = createHash("sha256").update(readFileSync(CSV)).digest("hex");
const rows = loadHistory();
const N = rows.length;
const lr = new Float64Array(N);
for (let i = 1; i < N; i++) lr[i] = Math.log(rows[i].mxn_close / rows[i - 1].mxn_close);
const rv = (a, b) => {
  if (a < 1 || b >= N) return NaN;
  let s = 0;
  for (let k = a; k <= b; k++) s += lr[k] * lr[k];
  return 100 * Math.sqrt((252 * s) / (b - a + 1));
};
const f5 = forwardReturns(rows, 5);

const V = []; // filas con score válido, en orden temporal
for (let i = 0; i < N; i++) if (rows[i].wsum >= WSUM_MIN) V.push(i);
const bIdx = (b) => BANDAS.indexOf(b);
const bandaV = Int8Array.from(V, (i) => bIdx(rows[i].band));
const scoreDe = (k) => rows[V[k]].score;

// S: muestra del nowcast. `k` = posición en V, para cruzar con esquemas alternativos.
const S = [];
V.forEach((i, k) => {
  if (i < 20 || i + 20 >= N) return;
  S.push({
    i, k, date: rows[i].date, score: rows[i].score, band: bandaV[k],
    a5: Math.abs(f5[i]), rv5: rv(i + 1, i + 5), rv20: rv(i + 1, i + 20), p20: rv(i - 19, i), vix: rows[i].r_vix,
  });
});

console.log(`\nSerie congelada: data/backtest/history.csv · sha256 ${sha.slice(0, 16)}…`);
console.log(`Filas: ${N} (${rows[0].date} → ${rows[N - 1].date}) · con score válido (wsum ≥ ${WSUM_MIN}): ${V.length} desde ${rows[V[0]].date}`);
console.log(`Muestra del nowcast: ${S.length} días (${S[0].date} → ${S[S.length - 1].date})`);
console.log(`Cortes: RISK-OFF ≤ ${BAND_CUTS.off} · DEFENSIVE ≤ ${BAND_CUTS.def} · CONSTRUCTIVE ≤ ${BAND_CUTS.con} · RISK-ON > ${BAND_CUTS.con}`);
const compos = TRAMOS.map(([t, a, b]) => {
  const w = {};
  for (const i of V) if (rows[i].date >= a && rows[i].date <= b) w[rows[i].wsum] = (w[rows[i].wsum] ?? 0) + 1;
  return `${t}: ` + Object.entries(w).map(([k, n]) => `wsum ${k}×${n}`).join(", ");
});
console.log(`Completitud (wsum 83 = sin carry ni BTC · 93 = sin BTC · 100 = 9 señales): ${compos.join(" | ")}`);
console.log(`IC95: bootstrap por bloques móviles de ${BLOQUE} sesiones, ${REPS} réplicas, semilla ${SEMILLA}.`);

// ═════════════════════════════════════════════════════════════════════════════
// A. DISTRIBUCIÓN CON LOS CORTES ACTUALES
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══ A. DISTRIBUCIÓN CON LOS CORTES ACTUALES ══");

const tramoIx = (a, b) => V.map((i, k) => k).filter((k) => rows[V[k]].date >= a && rows[V[k]].date <= b);
const GRUPOS = [["21 años", "2005-01-01", "2026-12-31"], ...TRAMOS];

function reparto(ks, bandas) {
  const bi = Int8Array.from(ks, (k) => bandas[k]);
  const n = bi.length, c = [0, 0, 0, 0];
  for (const b of bi) c[b]++;
  const M = boot(plan(n), (idx) => {
    const cc = [0, 0, 0, 0];
    for (let t = 0; t < idx.length; t++) cc[bi[idx[t]]]++;
    return cc.map((v) => (100 * v) / idx.length);
  });
  return { n, c, pct: c.map((v) => (100 * v) / n), ic: [0, 1, 2, 3].map((b) => ic95(col(M, b))) };
}

console.log("\nA1 · % de días por banda (IC95 por bloques)");
console.log(L("tramo", 10) + R("n", 6) + BANDAS.map((b) => R(b, 21)).join(""));
for (const [t, a, b] of GRUPOS) {
  const r = reparto(tramoIx(a, b), bandaV);
  console.log(L(t, 10) + R(r.n, 6) + r.pct.map((p, k) => R(`${f1(p)} ${icS(r.ic[k])}`, 21)).join(""));
}

console.log("\nA1b · Episodios (censo: conteo exacto de días, sin IC)");
console.log(L("episodio", 14) + L("ventana", 24) + R("n", 5) + AB.map((b) => R(b, 10)).join("") + R("score mín–máx", 15) + R("p50", 6));
for (const [e, a, b] of EPISODIOS) {
  const ks = tramoIx(a, b);
  const c = [0, 0, 0, 0];
  for (const k of ks) c[bandaV[k]]++;
  const sc = srt(ks.map((k) => rows[V[k]].score));
  console.log(
    L(e, 14) + L(`${a}→${b}`, 24) + R(ks.length, 5) +
    c.map((v) => R(`${v} (${Math.round((100 * v) / ks.length)}%)`, 10)).join("") +
    R(`${sc[0]}–${sc[sc.length - 1]}`, 15) + R(q(sc, 0.5), 6)
  );
}

// Percentiles con IC: el score es entero 0-100, así que cada réplica se resume
// en un histograma y los cuantiles salen de ahí (tipo 7, como q()).
const PCTS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
function qHist(h, m, p) {
  const pos = (m - 1) * p, lo = Math.floor(pos), fr = pos - lo;
  const kth = (k) => { let c = 0; for (let v = 0; v <= 100; v++) { c += h[v]; if (c > k) return v; } return 100; };
  const a = kth(lo);
  return fr ? a + (kth(Math.min(lo + 1, m - 1)) - a) * fr : a;
}
console.log("\nA2 · Percentiles del score (IC95 por bloques debajo)");
console.log(L("tramo", 10) + R("n", 6) + PCTS.map((p) => R(`p${Math.round(p * 100)}`, 13)).join(""));
for (const [t, a, b] of GRUPOS) {
  const sc = Int16Array.from(tramoIx(a, b), (k) => rows[V[k]].score);
  const h0 = new Int32Array(101);
  for (const s of sc) h0[s]++;
  const M = boot(plan(sc.length), (idx) => {
    const h = new Int32Array(101);
    for (let t2 = 0; t2 < idx.length; t2++) h[sc[idx[t2]]]++;
    return PCTS.map((p) => qHist(h, idx.length, p));
  });
  console.log(L(t, 10) + R(sc.length, 6) + PCTS.map((p) => R(f1(qHist(h0, sc.length, p)), 13)).join(""));
  console.log(L("", 16) + PCTS.map((p, j) => R(icS(ic95(col(M, j)), 0), 13)).join(""));
}

// Dónde se concentran las colas.
function episodios(ks) {
  const out = [];
  for (const k of ks) {
    const u = out[out.length - 1];
    if (u && k - u.fin <= HUECO_EPISODIO) { u.fin = k; u.n++; } else out.push({ ini: k, fin: k, n: 1 });
  }
  return out;
}
console.log(`\nA3 · Dónde caen las colas (episodio = días de la banda separados por ≤ ${HUECO_EPISODIO} sesiones)`);
for (const b of [0, 3]) {
  const ks = V.map((_, k) => k).filter((k) => bandaV[k] === b);
  const porAno = {};
  for (const k of ks) { const y = rows[V[k]].date.slice(0, 4); porAno[y] = (porAno[y] ?? 0) + 1; }
  const eps = episodios(ks).sort((x, y) => y.n - x.n || x.ini - y.ini);
  const top5 = eps.slice(0, 5).reduce((s, e) => s + e.n, 0);
  console.log(`  ${BANDAS[b]}: ${ks.length} días en ${eps.length} episodios; los 5 mayores juntan ${top5} (${Math.round((100 * top5) / ks.length)}%)`);
  console.log(`    por año: ${Object.entries(porAno).map(([y, n]) => `${y}:${n}`).join(" ")}`);
  console.log(`    mayores: ${eps.slice(0, 6).map((e) => `${rows[V[e.ini]].date}→${rows[V[e.fin]].date} (${e.n})`).join(" · ")}`);
}

// ¿Qué tan raro es lo que se vio en vivo? Ventanas del largo de la historia en
// vivo, contadas por la fecha en que terminan.
console.log("\nA4 · ¿Qué tan raro es el verano en vivo? (ventanas de sesiones consecutivas)");
for (const W of VENTANAS_VIVO) {
  const tot = [0, 0, 0, 0], sinCola = [0, 0, 0, 0], sinOff = [0, 0, 0, 0], cuatro = [0, 0, 0, 0];
  const cnt = [0, 0, 0, 0];
  for (let k = 0; k < V.length; k++) {
    cnt[bandaV[k]]++;
    if (k >= W) cnt[bandaV[k - W]]--;
    if (k < W - 1) continue;
    for (const g of [0, 1 + tramoDe(rows[V[k]].date)]) {
      tot[g]++;
      if (!cnt[0] && !cnt[3]) sinCola[g]++;
      if (!cnt[0]) sinOff[g]++;
      if (cnt.every((c) => c > 0)) cuatro[g]++;
    }
  }
  const pc = (a, g) => `${Math.round((100 * a[g]) / tot[g])}%`;
  console.log(`  W=${W}: ` + ["21 años", ...TRAMOS.map((t) => t[0])].map((t, g) =>
    `${t} (n=${tot[g]}) sin OFF ni ON ${pc(sinCola, g)} · sin OFF ${pc(sinOff, g)} · con las 4 ${pc(cuatro, g)}`).join("  |  "));
}
{
  const rachas = [];
  let ini = null;
  for (let k = 0; k <= V.length; k++) {
    const esCon = k < V.length && bandaV[k] === 2;
    if (esCon && ini == null) ini = k;
    if (!esCon && ini != null) { rachas.push({ ini, n: k - ini }); ini = null; }
  }
  const largas = rachas.filter((r) => r.n >= 30);
  const maxR = rachas.reduce((m, r) => (r.n > m.n ? r : m));
  const diasEnLargas = largas.reduce((s, r) => s + r.n, 0);
  const porTramo = TRAMOS.map((t, g) => `${t[0]}: ${largas.filter((r) => tramoDe(rows[V[r.ini]].date) === g).length}`).join(", ");
  console.log(`  Rachas CONSTRUCTIVE ≥ 30 sesiones: ${largas.length} (${porTramo}); ${diasEnLargas} de ${bandaV.filter((b) => b === 2).length} días CON viven en ellas. ` +
    `Más larga: ${maxR.n} sesiones desde ${rows[V[maxR.ini]].date}.`);
}
// Dispersión del score en ventanas de W sesiones: la referencia contra la que
// A5 mide la racha en vivo.
function dispersion(W) {
  const sd = [], rg = [];
  for (let k = W - 1; k < V.length; k++) {
    const w = [];
    for (let j = k - W + 1; j <= k; j++) w.push(scoreDe(j));
    const m = mean(w);
    sd.push(Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / (W - 1)));
    rg.push(Math.max(...w) - Math.min(...w));
  }
  return { sd: srt(sd), rg: srt(rg) };
}
{
  const d = dispersion(30);
  console.log(`  Dispersión del score en ventanas de 30 sesiones (n=${d.sd.length}): desv. est. p1 ${f1(q(d.sd, 0.01))} · p5 ${f1(q(d.sd, 0.05))} · p50 ${f1(q(d.sd, 0.5))} · mín ${f1(d.sd[0])}` +
    ` | rango p1 ${q(d.rg, 0.01)} · p5 ${q(d.rg, 0.05)} · p50 ${q(d.rg, 0.5)} · mín ${d.rg[0]}`);
}
{
  // ¿Fue tranquilo? Vol20 del par y VIX del verano contra su propia historia.
  const p20V = V.map((i) => (i >= 20 ? rv(i - 19, i) : NaN));
  const vixV = V.map((i) => rows[i].r_vix);
  const rango = (a, b) => V.map((_, k) => k).filter((k) => rows[V[k]].date >= a && rows[V[k]].date <= b);
  const pr = (arr, x) => (100 * arr.filter((v) => v <= x).length) / arr.filter(Number.isFinite).length;
  for (const [e, a, b] of EPISODIOS.slice(-2)) {
    const ks = rango(a, b);
    const mv = median(ks.map((k) => p20V[k])), mx = median(ks.map((k) => vixV[k]));
    console.log(`  ${e} (n=${ks.length}): vol20 USD/MXN mediana ${f1(mv)}% = percentil ${Math.round(pr(p20V, mv))} de 21 años · VIX mediana ${f1(mx)} = percentil ${Math.round(pr(vixV, mx))}`);
  }
}

// A5 · ¿La réplica representa al score publicado? Si no, la distribución de 21
// años no aplica al número que ve el lector.
console.log("\nA5 · Réplica (history.csv) contra el score publicado (front-matter de content/)");
{
  const dir = path.join(process.cwd(), "content");
  const vivo = !existsSync(dir) ? [] : readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()
    .map((f) => {
      const fm = readFileSync(path.join(dir, f), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const m = fm && fm[1].match(/^score:\s*(\d+(?:\.\d+)?)\s*$/m);
      return m ? { date: f.slice(0, 10), score: Number(m[1]) } : null;
    }).filter(Boolean);
  if (!vivo.length) console.log("  sin content/ — se omite");
  else {
    const vs = vivo.map((v) => v.score);
    console.log(`  views con score: ${vivo.length} (${vivo[0].date} → ${vivo[vivo.length - 1].date}) · rango ${Math.min(...vs)}–${Math.max(...vs)}`);
    const pos = Object.fromEntries(rows.map((r, i) => [r.date, i]));
    const pearson = (x, y) => {
      const mx = mean(x), my = mean(y);
      let a = 0, b = 0, c = 0;
      for (let t = 0; t < x.length; t++) { a += (x[t] - mx) * (y[t] - my); b += (x[t] - mx) ** 2; c += (y[t] - my) ** 2; }
      return a / Math.sqrt(b * c);
    };
    for (const [et, a, b] of [["antes del 13-jul (fórmula sin piso)", "2000-01-01", "2026-07-12"], ["desde el 13-jul (fórmula actual)", "2026-07-13", "2099-12-31"]]) {
      for (const lag of [0, 1]) {
        const pares = vivo.filter((v) => v.date >= a && v.date <= b && pos[v.date] != null && pos[v.date] - lag >= 0)
          .map((v) => [v.score, rows[pos[v.date] - lag].score]);
        if (pares.length < 5) continue;
        const x = pares.map((p) => p[0]), y = pares.map((p) => p[1]);
        const igual = pares.filter(([u, w]) => bandOf(u) === bandOf(w)).length;
        console.log(
          `  ${L(et, 36)} vivo(D) vs réplica(D${lag ? "−1" : ""}): n=${pares.length} · r=${fmt(pearson(x, y))} · ` +
          `media ${f1(mean(x))} vs ${f1(mean(y))} · rango ${Math.min(...x)}–${Math.max(...x)} vs ${Math.min(...y)}–${Math.max(...y)} · ` +
          `misma banda (cortes actuales en ambos) ${igual}/${pares.length}`
        );
      }
    }
    // La racha CONSTRUCTIVE más larga en vivo (con la fórmula actual), medida
    // contra la dispersión de la réplica en ventanas del mismo largo.
    const post = vivo.filter((v) => v.date >= "2026-07-13");
    let mejor = null, ini = 0;
    for (let j = 0; j <= post.length; j++) {
      if (j < post.length && bandOf(post[j].score) === "CONSTRUCTIVE") continue;
      if (!mejor || j - ini > mejor.n) mejor = { ini, n: j - ini };
      ini = j + 1;
    }
    if (mejor && mejor.n >= 5) {
      const w = post.slice(mejor.ini, mejor.ini + mejor.n).map((v) => v.score), m = mean(w);
      const sdv = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / (w.length - 1));
      const rgv = Math.max(...w) - Math.min(...w);
      const d = dispersion(mejor.n);
      const pSd = (100 * d.sd.filter((v) => v <= sdv).length) / d.sd.length;
      const pRg = (100 * d.rg.filter((v) => v <= rgv).length) / d.rg.length;
      console.log(
        `  Racha CONSTRUCTIVE más larga en vivo: ${mejor.n} views (${post[mejor.ini].date} → ${post[mejor.ini + mejor.n - 1].date}), ` +
        `score ${Math.min(...w)}–${Math.max(...w)}, desv. est. ${f1(sdv)}.`
      );
      console.log(
        `  Ventanas de ${mejor.n} sesiones de la réplica (n=${d.sd.length}) con desv. est. ≤ ${f1(sdv)}: ${fmt(pSd, 2)}% · con rango ≤ ${rgv}: ${fmt(pRg, 2)}%`
      );
    }
  }
}

// A6 · Por qué el centro se movió: aporte medio de las señales LENTAS (niveles:
// VIX, MOVE, vol MXN, carry, curva) y RÁPIDAS (retornos diarios) al score.
console.log("\nA6 · De dónde sale el nivel y la dispersión del score (aporte en puntos de score)");
{
  const LENTAS = ["vix", "move", "mxnvol", "carry", "curve"], RAPIDAS = ["mxn", "spx", "btc", "gold"];
  for (const [t, a, b] of TRAMOS) {
    const ks = tramoIx(a, b);
    const aporte = (keys) => ks.map((k) => {
      const r = rows[V[k]];
      let s = 0;
      for (const key of keys) if (r[`s_${key}`] != null) s += r[`s_${key}`] * WEIGHTS[key];
      return s / r.wsum;
    });
    const lent = aporte(LENTAS), rap = aporte(RAPIDAS);
    const va = (x) => { const m = mean(x); return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1); };
    const tot = lent.map((v, j) => v + rap[j]);
    const subs = LENTAS.map((key) => `${key} ${Math.round(mean(ks.map((k) => rows[V[k]][`s_${key}`]).filter((v) => v != null)) ?? NaN)}`).join(", ");
    console.log(
      `  ${t} (n=${ks.length}): lentas ${f1(mean(lent))} + rápidas ${f1(mean(rap))} = ${f1(mean(tot))} · ` +
      `varianza: lentas ${Math.round((100 * va(lent)) / va(tot))}%, rápidas ${Math.round((100 * va(rap)) / va(tot))}% (resto: covarianza) · sub-scores lentos medios: ${subs}`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. NOWCAST DE VOLATILIDAD (cortes actuales)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══ B. NOWCAST DE VOLATILIDAD · cortes actuales ══");

const OBJ = [["a5", "|ret5| %"], ["rv5", "RV5 %"], ["rv20", "RV20 %"]];

function mediasBoot(sub, bi, keys) {
  const p = plan(sub.length);
  const Y = keys.map((key) => Float64Array.from(sub, (s) => s[key]));
  const M = boot(p, (idx) => {
    const s = keys.map(() => [0, 0, 0, 0]), c = [0, 0, 0, 0];
    for (let t = 0; t < idx.length; t++) {
      const j = idx[t], b = bi[j];
      c[b]++;
      for (let u = 0; u < keys.length; u++) s[u][b] += Y[u][j];
    }
    return s.map((row) => row.map((v, b) => (c[b] ? v / c[b] : NaN)));
  });
  const out = {};
  keys.forEach((key, u) => {
    const reps = M.map((m) => m[u]);
    const pt = [0, 1, 2, 3].map((b) => mean(sub.filter((_, j) => bi[j] === b).map((s) => s[key])) ?? NaN);
    out[key] = {
      media: pt,
      ic: [0, 1, 2, 3].map((b) => ic95(reps.map((r) => r[b]))),
      dif: [0, 1, 2].map((b) => ({ pt: pt[b] - pt[b + 1], ic: ic95(reps.map((r) => r[b] - r[b + 1])) })),
      orden: (100 * reps.filter((r) => r[0] > r[1] && r[1] > r[2] && r[2] > r[3]).length) / REPS,
    };
  });
  return out;
}

const biS = Int8Array.from(S, (s) => s.band);
const MB = mediasBoot(S, biS, ["a5", "rv5", "rv20", "p20"]);

// Medianas de |ret5| con IC (lo pide el todo: |mxn5| mediano por banda).
const medA5 = (() => {
  const Y = Float64Array.from(S, (s) => s.a5);
  const reps = boot(plan(S.length), (idx) => {
    const g = [[], [], [], []];
    for (let t = 0; t < idx.length; t++) g[biS[idx[t]]].push(Y[idx[t]]);
    return g.map((a) => (a.length ? median(a) : NaN));
  });
  return [0, 1, 2, 3].map((b) => ({ pt: median(S.filter((s) => s.band === b).map((s) => s.a5)), ic: ic95(col(reps, b)) }));
})();

console.log("\nB1 · Por banda: medias con IC95");
console.log(L("banda", 13) + R("n", 5) + R("epis.", 6) + R("|ret5| media", 21) + R("|ret5| mediana", 21) + R("RV5", 21) + R("RV20", 21) + R("vol20 PASADA", 21));
for (let b = 0; b < 4; b++) {
  const ks = S.map((s, j) => j).filter((j) => biS[j] === b);
  const cel = (key) => `${fmt(MB[key].media[b], key === "a5" ? 2 : 1)} ${icS(MB[key].ic[b], key === "a5" ? 2 : 1)}`;
  console.log(
    L(BANDAS[b], 13) + R(ks.length, 5) + R(episodios(ks).length, 6) + R(cel("a5"), 21) +
    R(`${fmt(medA5[b].pt, 2)} ${icS(medA5[b].ic, 2)}`, 21) + R(cel("rv5"), 21) + R(cel("rv20"), 21) + R(cel("p20"), 21)
  );
}
console.log(`  (epis. = rachas separadas por > ${HUECO_EPISODIO} sesiones; es el n que importa en las colas, no en las bandas centrales.)`);

console.log("\nB2 · ¿Ordena de forma monótona? Diferencias adyacentes con IC95 y % de réplicas con el orden completo");
console.log(L("objetivo", 13) + R("OFF − DEF", 24) + R("DEF − CON", 24) + R("CON − ON", 24) + R("orden completo", 16));
for (const [key, nom] of [...OBJ, ["p20", "vol20 PASADA"]]) {
  const d = MB[key].dif, dd = key === "a5" ? 2 : 1;
  console.log(L(nom, 13) + d.map((x) => R(`${sg(x.pt, dd)} ${icS(x.ic, dd, true)}`, 24)).join("") + R(`${f1(MB[key].orden)}%`, 16));
}

// Spearman con rangos de la muestra completa (fijos en las réplicas).
const rango = (a) => {
  const ix = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Float64Array(a.length);
  for (let j = 0; j < ix.length;) {
    let k = j;
    while (k + 1 < ix.length && ix[k + 1][0] === ix[j][0]) k++;
    for (let m = j; m <= k; m++) r[ix[m][1]] = (j + k) / 2 + 1;
    j = k + 1;
  }
  return r;
};
const corrIdx = (x, y, idx) => {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const len = idx ? idx.length : x.length;
  for (let t = 0; t < len; t++) {
    const j = idx ? idx[t] : t;
    n++; sx += x[j]; sy += y[j]; sxx += x[j] * x[j]; syy += y[j] * y[j]; sxy += x[j] * y[j];
  }
  return (sxy - (sx * sy) / n) / Math.sqrt((sxx - (sx * sx) / n) * (syy - (sy * sy) / n));
};
{
  const pS = plan(S.length);
  const rk = { score: rango(S.map((s) => s.score)), p20: rango(S.map((s) => s.p20)), vix: rango(S.map((s) => s.vix)) };
  console.log("\nB3 · ρ de Spearman con la vol futura (IC95): el score contra el benchmark ingenuo y el VIX");
  for (const [key, nom] of OBJ) {
    const ry = rango(S.map((s) => s[key]));
    const cel = (x) => {
      const reps = boot(pS, (idx) => corrIdx(x, ry, idx));
      return `${sg(corrIdx(x, ry), 3)} ${icS(ic95(reps), 3, true)}`;
    };
    console.log(`  ${L(nom, 10)} score ${cel(rk.score)} · vol20 pasada ${cel(rk.p20)} · VIX ${cel(rk.vix)}`);
  }
}

// ── ¿Agrega información sobre la vol pasada? ─────────────────────────────────
const sP20 = srt(S.map((s) => s.p20));
const T1 = q(sP20, 1 / 3), T2 = q(sP20, 2 / 3);
console.log(`\nB4 · Dentro de terciles de vol20 PASADA (cortes ${f1(T1)}% y ${f1(T2)}%): media de la vol futura por banda (n), IC95 de las comparaciones`);
for (const [key, nom] of [["rv20", "RV20"], ["a5", "|ret5|"]]) {
  const d = key === "a5" ? 2 : 1;
  console.log(`  ${nom}`);
  console.log("  " + L("tercil", 18) + BANDAS.map((b) => R(b, 14)).join("") + R("OFF − CON", 24) + R("DEF − CON", 24) + R("ρ(score, vol futura)", 27));
  [["bajo", -Infinity, T1], ["medio", T1, T2], ["alto", T2, Infinity]].forEach(([nom2, lo, hi]) => {
    // Los días del tercil no son contiguos; los bloques se toman sobre su orden temporal.
    const sub = S.filter((s) => s.p20 > lo && s.p20 <= hi);
    const bi = Int8Array.from(sub, (s) => s.band);
    const mb = mediasBoot(sub, bi, [key])[key];
    const n = [0, 1, 2, 3].map((b) => bi.filter((v) => v === b).length);
    const cel = mb.media.map((v, b) => (n[b] >= 20 ? `${fmt(v, d)} (${n[b]})` : `— (${n[b]})`));
    const pl = plan(sub.length);
    const dif = (b) => {
      if (n[b] < 20) return "—";
      const reps = boot(pl, (idx) => {
        let sa = 0, ca = 0, sc = 0, cc = 0;
        for (let t = 0; t < idx.length; t++) {
          const j = idx[t];
          if (bi[j] === b) { sa += sub[j][key]; ca++; } else if (bi[j] === 2) { sc += sub[j][key]; cc++; }
        }
        return ca && cc ? sa / ca - sc / cc : NaN;
      });
      return `${sg(mb.media[b] - mb.media[2], d)} ${icS(ic95(reps), d, true)}`;
    };
    const rs = rango(sub.map((s) => s.score)), ry = rango(sub.map((s) => s[key]));
    const rho = `${sg(corrIdx(rs, ry), 3)} ${icS(ic95(boot(pl, (idx) => corrIdx(rs, ry, idx))), 3, true)}`;
    console.log("  " + L(`${nom2} (n=${sub.length})`, 18) + cel.map((c) => R(c, 14)).join("") + R(dif(0), 24) + R(dif(1), 24) + R(rho, 27));
  });
}

// Regresión: objetivo ~ vol20 pasada + dummies de banda (CON de referencia).
function regBanda(sub, bi, key, tf = (x) => x) {
  const y = Float64Array.from(sub, (s) => tf(s[key]));
  const d0 = diseno(sub, bi, "base", tf), d1 = diseno(sub, bi, "banda", tf);
  const m0 = ols(d0.X, d0.p, y), m1 = ols(d1.X, d1.p, y);
  const reps = boot(plan(sub.length), (idx) => {
    const a = ols(d0.X, d0.p, y, idx), b = ols(d1.X, d1.p, y, idx);
    return a && b ? [...b.beta, b.r2 - a.r2] : [NaN, NaN, NaN, NaN, NaN, NaN];
  });
  return {
    r2: [m0.r2, m1.r2], beta: m1.beta,
    ic: [2, 3, 4].map((c) => ic95(col(reps, c))), icDR2: ic95(col(reps, 5)), y, d0, d1,
  };
}
// Mejora fuera de muestra, reajuste ANUAL: para cada año de prueba desde
// OOS_DESDE, ambos modelos se ajustan con toda la historia anterior menos una
// purga de PURGA sesiones y predicen ese año sin volver a mirar. Así la banda
// aprende de 2014-20 antes de que se le pida 2021-26 — una sola partición
// 2005-13 → 2014-26 le exigiría transferir un régimen que ya no existe. IC por
// bloques sobre los errores de prueba, con los ajustes fijos.
function oos(sub, bi, key, tf = (x) => x, desde = "0000", hasta = "9999") {
  const y = Float64Array.from(sub, (s) => tf(s[key]));
  const d0 = diseno(sub, bi, "base", tf), d1 = diseno(sub, bi, "banda", tf);
  const e0 = [], e1 = [];
  const ultimo = Number(sub[sub.length - 1].date.slice(0, 4));
  for (let Y = OOS_DESDE; Y <= ultimo; Y++) {
    const j0 = sub.findIndex((s) => s.date >= `${Y}-01-01`);
    if (j0 < 0) break;
    const tr = [];
    for (let j = 0; j < j0 - PURGA; j++) tr.push(j);
    const te = [];
    for (let j = j0; j < sub.length && sub[j].date <= `${Y}-12-31`; j++) if (sub[j].date >= desde && sub[j].date <= hasta) te.push(j);
    if (!te.length) continue;
    const m0 = ols(d0.X, d0.p, y, tr), m1 = ols(d1.X, d1.p, y, tr);
    if (!m0 || !m1) return null;
    for (const j of te) {
      e0.push((y[j] - predice(m0.beta, d0.X, d0.p, j)) ** 2);
      e1.push((y[j] - predice(m1.beta, d1.X, d1.p, j)) ** 2);
    }
  }
  const mej = (idx) => {
    let a = 0, b = 0;
    const n = idx ? idx.length : e0.length;
    for (let t = 0; t < n; t++) { const j = idx ? idx[t] : t; a += e0[j]; b += e1[j]; }
    return 100 * (1 - b / a);
  };
  return { n: e0.length, pt: mej(null), ic: ic95(boot(plan(e0.length), mej)) };
}

console.log("\nB5 · Regresión: objetivo ~ vol20 pasada + banda (referencia CONSTRUCTIVE). Coeficientes en unidades del objetivo, IC95");
console.log(L("objetivo", 16) + R("R² vol20", 9) + R("R² +banda", 10) + R("ΔR² (pp) [IC95]", 22) + R("OFF vs CON", 24) + R("DEF vs CON", 24) + R("ON vs CON", 24));
const lg = (x) => Math.log(x);
// En logaritmos el coeficiente se muestra como 100·(e^β − 1): % de vol de más o
// de menos que un día CONSTRUCTIVE con la misma vol pasada.
const aPct = (v) => 100 * (Math.exp(v) - 1);
for (const [key, nom, tf, d] of [["a5", "|ret5| %", undefined, 2], ["rv5", "RV5 %", undefined, 1], ["rv20", "RV20 %", undefined, 1], ["rv20", "ln RV20 (en %)", lg, 1]]) {
  const r = regBanda(S, biS, key, tf);
  const tr = tf ? aPct : (v) => v;
  console.log(
    L(nom, 16) + R(fmt(r.r2[0], 3), 9) + R(fmt(r.r2[1], 3), 10) +
    R(`${sg(100 * (r.r2[1] - r.r2[0]), 1)} ${icS(r.icDR2.map((v) => 100 * v), 1, true)}`, 22) +
    [2, 3, 4].map((c, u) => R(`${sg(tr(r.beta[c]), d)}${tf ? "%" : ""} ${icS(r.ic[u].map(tr), d, true)}`, 24)).join("")
  );
}

const PARTES_OOS = [["2014-26", "2014-01-01", "9999"], ["2014-20", "2014-01-01", "2020-12-31"], ["2021-26", "2021-01-01", "9999"]];
console.log(`\nB6 · ¿La mejora sobrevive fuera de muestra? Reducción del ECM del modelo con banda contra vol20 sola (%, IC95).`);
console.log(`     Reajuste anual con toda la historia previa, purga de ${PURGA} sesiones.`);
for (const [key, nom, tf] of [["a5", "|ret5| %"], ["rv5", "RV5 %"], ["rv20", "RV20 %"], ["rv20", "ln RV20", lg]]) {
  const partes = PARTES_OOS.map(([t, a, b]) => { const o = oos(S, biS, key, tf, a, b); return `${t} (n=${o.n}) ${sg(o.pt, 1)}% ${icS(o.ic, 1, true)}`; });
  console.log(`  ${L(nom, 10)} ${partes.join("  ·  ")}`);
}

console.log("\nB7 · Contexto: ¿cuánto agrega el score continuo o el VIX solo, en lugar de la banda? (RV20 %, ΔR² en pp, dentro de muestra, IC95)");
{
  const y = Float64Array.from(S, (s) => s.rv20);
  const D = Object.fromEntries(["base", "banda", "score", "vix", "vixbanda"].map((t) => [t, diseno(S, biS, t)]));
  const r2s = (idx) => Object.fromEntries(Object.entries(D).map(([t, d]) => [t, ols(d.X, d.p, y, idx)?.r2 ?? NaN]));
  const inc = (r) => [r.banda - r.base, r.score - r.base, r.vix - r.base, r.vixbanda - r.vix].map((v) => 100 * v);
  const pt = inc(r2s(null)), reps = boot(plan(S.length), (idx) => inc(r2s(idx)));
  const cel = (j) => `${sg(pt[j], 1)} ${icS(ic95(col(reps, j)), 1, true)}`;
  console.log(`  sobre vol20 (R² ${fmt(r2s(null).base, 3)}): +banda ${cel(0)} · +score continuo ${cel(1)} · +VIX ${cel(2)} · banda encima de vol20+VIX ${cel(3)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// C. ESTABILIDAD POR TRAMO
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══ C. ESTABILIDAD POR TRAMO ══");
console.log("\nC1 · Sin ajustar: media por banda (n) y diferencias adyacentes con IC95");
console.log(L("tramo", 9) + L("objetivo", 8) + BANDAS.map((b) => R(b, 14)).join("") + R("OFF − DEF", 24) + R("DEF − CON", 24) + R("CON − ON", 24) + R("orden", 7) + R("réplicas", 10));
const ESTABLE = {};
const AJUSTE = [];
for (const [t, a, b] of TRAMOS) {
  const sub = S.filter((s) => s.date >= a && s.date <= b);
  const bi = Int8Array.from(sub, (s) => s.band);
  const MBt = mediasBoot(sub, bi, ["rv20", "a5"]);
  for (const [key, nom, d] of [["rv20", "RV20", 1], ["a5", "|ret5|", 2]]) {
    const m = MBt[key].media, n = [0, 1, 2, 3].map((x) => bi.filter((v) => v === x).length);
    const ord = m[0] > m[1] && m[1] > m[2] && m[2] > m[3];
    ESTABLE[`${t}-${key}`] = { ord, dif: MBt[key].dif };
    console.log(
      L(t, 9) + L(nom, 8) + m.map((v, x) => R(`${fmt(v, d)} (${n[x]})`, 14)).join("") +
      MBt[key].dif.map((x) => R(`${sg(x.pt, d)} ${icS(x.ic, d, true)}`, 24)).join("") +
      R(ord ? "sí" : "NO", 7) + R(`${f1(MBt[key].orden)}%`, 10)
    );
    AJUSTE.push([t, nom, d, regBanda(sub, bi, key)]);
  }
}
console.log("\nC2 · Ajustado por la vol20 pasada (regresión dentro de cada tramo), IC95");
console.log(L("tramo", 9) + L("objetivo", 8) + R("OFF vs CON", 24) + R("DEF vs CON", 24) + R("ON vs CON", 24) + R("ΔR² pp [IC95]", 22));
for (const [t, nom, d, r] of AJUSTE) {
  console.log(
    L(t, 9) + L(nom, 8) + [2, 3, 4].map((c, u) => R(`${sg(r.beta[c], d)} ${icS(r.ic[u], d, true)}`, 24)).join("") +
    R(`${sg(100 * (r.r2[1] - r.r2[0]), 1)} ${icS(r.icDR2.map((v) => 100 * v), 1, true)}`, 22)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// D. CORTES ALTERNATIVOS (nada de esto toca lib/riskScore.js)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══ D. CORTES ALTERNATIVOS ══");
const MIN_W = 252; // una ventana rodante necesita al menos un año de historia
const scV = Int16Array.from(V, (i) => rows[i].score);
const sV = srt(scV);
const P5 = q(sV, 0.05), P95 = q(sV, 0.95);

function fijo([off, def, con]) {
  const out = Int8Array.from(scV, (s) => (s <= off ? 0 : s <= def ? 1 : s <= con ? 2 : 3));
  return { out, cortes: [off, def, con] };
}
// Cortes = cuantiles del score en las W sesiones ANTERIORES (sin el día, sin
// look-ahead). `centro` fijo conserva el 49 como frontera semántica (sub-scores
// anclados en 50 = neutral) y deja rodar solo las colas.
function rodante(W, { centro = null } = {}) {
  const h = new Int32Array(101);
  let m = 0, cortes = null;
  const out = new Int8Array(V.length).fill(-1);
  for (let k = 0; k < V.length; k++) {
    if (m >= MIN_W) {
      const c = [qHist(h, m, 0.05), centro ?? qHist(h, m, 0.5), qHist(h, m, 0.95)];
      const s = scV[k];
      out[k] = s <= c[0] ? 0 : s > c[2] ? 3 : s <= c[1] ? 1 : 2;
      cortes = c;
    }
    h[scV[k]]++; m++;
    if (m > W) { h[scV[k - W]]--; m--; }
  }
  return { out, cortes };
}
const ESQ = [
  ["actual 32/49/67", fijo([BAND_CUTS.off, BAND_CUTS.def, BAND_CUTS.con])],
  [`fijo p5/49/p95 21a`, fijo([P5, BAND_CUTS.def, P95])],
  ["rodante 1a p5/p50/p95", rodante(252)],
  ["rodante 3a p5/p50/p95", rodante(756)],
  ["rodante 3a colas, 49 fijo", rodante(756, { centro: BAND_CUTS.def })],
];
// Muestra común a todos los esquemas: días en que las ventanas rodantes existen.
const kMin = MIN_W;
const SD = S.filter((s) => s.k >= kMin);
const VD = V.map((_, k) => k).filter((k) => k >= kMin);
console.log(`Muestra común: ${VD.length} días con score desde ${rows[V[kMin]].date} (nowcast: ${SD.length}). ` +
  `p5/p95 de 21 años = ${f1(P5)}/${f1(P95)} (calibración con toda la muestra, como la del 13-jul sobre 5 años).`);

const WV = VENTANAS_VIVO[0];
const K26 = VD.filter((k) => rows[V[k]].date >= "2021-01-01");
console.log(`\nD1 · Distribución (% de días; el tramo 2021-26, n=${K26.length}, con IC95 por bloques) y lo que el lector vería`);
console.log(L("esquema", 27) + R("cortes al 21-ago-26", 21) + R("OFF", 6) + R("DEF", 6) + R("CON", 6) + R("ON", 6) + R("2021-26 OFF", 17) + R("2021-26 ON", 17) + R("verano 26 OFF/ON", 18) + R(`W=${WV} sin OFF ni ON`, 20) + R(`W=${WV} con las 4`, 16));
for (const [nom, e] of ESQ) {
  const c = [0, 0, 0, 0], ver = [0, 0, 0, 0];
  for (const k of VD) {
    const b = e.out[k], d = rows[V[k]].date;
    c[b]++;
    if (d >= "2026-06-01") ver[b]++;
  }
  const r26 = reparto(K26, e.out);
  let tot = 0, sinCola = 0, cuatro = 0;
  const cnt = [0, 0, 0, 0];
  for (let j = 0; j < VD.length; j++) {
    cnt[e.out[VD[j]]]++;
    if (j >= WV) cnt[e.out[VD[j - WV]]]--;
    if (j < WV - 1) continue;
    tot++;
    if (!cnt[0] && !cnt[3]) sinCola++;
    if (cnt.every((x) => x > 0)) cuatro++;
  }
  const pc = (x, n) => f1((100 * x) / n);
  console.log(
    L(nom, 27) + R(e.cortes.map((v) => f1(v)).join("/"), 21) + c.map((x) => R(pc(x, VD.length), 6)).join("") +
    [0, 3].map((b) => R(`${f1(r26.pct[b])} ${icS(r26.ic[b])}`, 17)).join("") +
    R(`${ver[0]}/${ver[3]} de ${ver.reduce((s, v) => s + v, 0)}`, 18) +
    R(`${pc(sinCola, tot)}%`, 20) + R(`${pc(cuatro, tot)}%`, 16)
  );
}

console.log("\nD2 · Nowcast de cada esquema (RV20 %, misma muestra común; ECM fuera de muestra con el reajuste anual de B6)");
console.log(L("esquema", 27) + BANDAS.map((b) => R(b, 14)).join("") + R("orden (réplicas)", 17) + R("ΔR² pp [IC95]", 19) + R("ECM fuera 2014-26", 23) + R("ECM fuera 2021-26", 23));
for (const [nom, e] of ESQ) {
  const bi = Int8Array.from(SD, (s) => e.out[s.k]);
  const mb = mediasBoot(SD, bi, ["rv20"]).rv20;
  const r = regBanda(SD, bi, "rv20");
  const o = oos(SD, bi, "rv20"), o26 = oos(SD, bi, "rv20", undefined, "2021-01-01");
  const n = [0, 1, 2, 3].map((x) => bi.filter((v) => v === x).length);
  console.log(
    L(nom, 27) + mb.media.map((v, x) => R(`${f1(v)} (${n[x]})`, 14)).join("") + R(`${f1(mb.orden)}%`, 17) +
    R(`${sg(100 * (r.r2[1] - r.r2[0]), 1)} ${icS(r.icDR2.map((v) => 100 * v), 1, true)}`, 19) +
    R(o ? `${sg(o.pt, 1)}% ${icS(o.ic, 1, true)}` : "—", 23) + R(o26 ? `${sg(o26.pt, 1)}% ${icS(o26.ic, 1, true)}` : "—", 23)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LECTURA MECÁNICA DE LOS CRITERIOS
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n══ CRITERIOS ══");
const d20 = MB.rv20.dif;
const ordena = d20.every((x) => x.ic[0] > 0);
console.log(`  ORDENA (RV20, las tres diferencias adyacentes con IC95 > 0): ${ordena ? "SÍ" : "NO"} — ` +
  d20.map((x, j) => `${AB[j]}−${AB[j + 1]} ${sg(x.pt, 1)} ${icS(x.ic, 1, true)}`).join(" · "));
const o20 = oos(S, biS, "rv20"), o20l = oos(S, biS, "rv20", lg);
const agrega = o20.ic[0] > 0;
console.log(`  AGREGA sobre vol20 (ECM fuera de muestra 2014-26, RV20): ${agrega ? "SÍ" : "NO"} — ${sg(o20.pt, 1)}% ${icS(o20.ic, 1, true)} (n=${o20.n}); en logaritmos ${sg(o20l.pt, 1)}% ${icS(o20l.ic, 1, true)}`);
const est = TRAMOS.map(([t]) => `${t}: RV20 ${ESTABLE[`${t}-rv20`].ord ? "sí" : "NO"}, |ret5| ${ESTABLE[`${t}-a5`].ord ? "sí" : "NO"}`);
console.log(`  ESTABLE (orden de medias por tramo): ${TRAMOS.every(([t]) => ESTABLE[`${t}-rv20`].ord) ? "SÍ" : "NO"} en RV20 — ${est.join(" · ")}`);
// El criterio de arriba es de puntos: pasa aunque las distancias sean nulas.
// Se dice en qué tramos las diferencias adyacentes de RV20 SÍ se distinguen de cero.
console.log("  Diferencias adyacentes de RV20 con IC95 fuera del cero, por tramo: " + TRAMOS.map(([t]) =>
  `${t} ${ESTABLE[`${t}-rv20`].dif.map((x, j) => (x.ic[0] > 0 ? `${AB[j]}−${AB[j + 1]}✓` : `${AB[j]}−${AB[j + 1]}✗`)).join(" ")}`).join(" · "));
console.log();

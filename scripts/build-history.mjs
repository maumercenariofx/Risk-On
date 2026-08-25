// scripts/build-history.mjs
// Congela la serie histórica del índice en data/backtest/history.csv.
//
// POR QUÉ (auditoría 2026-08-21). Con 5 años de historia y ventanas rodantes de
// IS=4a/OOS=1a salen CERO ventanas de walk-forward: la prueba más importante
// para detectar sobreajuste era literalmente imposible de correr. Y ningún
// backtest era reproducible, porque los cuatro scripts descargaban `range=5y`
// en vivo: la ventana se corría un día por día y los resultados de ayer no se
// podían volver a obtener.
//
// Este script resuelve las dos cosas: extiende la historia a 2005 y la CONGELA
// en un CSV versionado con su SHA256.
//
// SOBRE LAS FUENTES. El spine es DEXMXUS (FRED): el tipo de cambio que publica
// la Fed, con fecha de sesión INEQUÍVOCA. Eso elimina de raíz el problema de
// gmtoffset que corrió un día toda la serie de MXN=X y que produjo el "76%" que
// tuvimos que retirar. Yahoo se usa solo donde FRED no llega.
//
// SOBRE LAS SEÑALES FALTANTES. Bitcoin no existe antes de 2014-09 y el MOVE
// antes de 2002-11. El compuesto RENORMALIZA sobre las señales disponibles —es
// lo que ya hace lib/riskScore.js con `continue`— así que los años viejos
// corren con 8 de 9 señales. El CSV incluye la columna `wsum` para que
// cualquier análisis pueda filtrar o ponderar por completitud. No se inventa
// ningún valor.
//
// Uso:  node scripts/build-history.mjs [--from 2005-01-01]

import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  DYN_N, KEYS, WEIGHTS, RAMP, dynSub, lin, composite, bandOf,
  fetchFred, fetchYahooFull, banxicoAt, pctChg, rollingVol,
} from "./lib/histScore.mjs";

const argFrom = process.argv.indexOf("--from");
const FROM = argFrom > -1 ? process.argv[argFrom + 1] : "2005-01-01";
const OUT_DIR = path.join(process.cwd(), "data", "backtest");
const OUT = path.join(OUT_DIR, "history.csv");

console.log(`[hist] descargando series desde ${FROM}…`);
const [mxnF, vixF, dgs2, dgs10, dff, spx, gold, move, btc] = await Promise.all([
  fetchFred("DEXMXUS"),   // USD/MXN oficial de la Fed — el spine
  fetchFred("VIXCLS"),
  fetchFred("DGS2"),
  fetchFred("DGS10"),
  fetchFred("DFF"),
  fetchYahooFull("^GSPC"),
  fetchYahooFull("GC=F"),
  fetchYahooFull("^MOVE"),
  fetchYahooFull("BTC-USD"),
]);
console.log(
  `[hist] DEXMXUS ${mxnF.size} · VIX ${vixF.size} · DGS2 ${dgs2.size} · DGS10 ${dgs10.size} · ` +
  `DFF ${dff.size} · SPX ${spx.size} · GOLD ${gold.size} · MOVE ${move.size} · BTC ${btc.size}`
);

// La rejilla la manda DEXMXUS: si no hay peso, no hay día.
const dates = [...mxnF.keys()].filter((d) => d >= FROM).sort();
console.log(`[hist] rejilla: ${dates.length} días desde ${dates[0]} hasta ${dates[dates.length - 1]}`);

// Último valor conocido en o antes de `d` — las series de FRED tienen huecos
// por feriados que NO coinciden entre países.
function asOf(map, d, maxBack = 7) {
  const t = new Date(`${d}T12:00:00Z`);
  for (let i = 0; i <= maxBack; i++) {
    const k = new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (map.has(k)) return map.get(k);
  }
  return null;
}

// Ventanas para el z robusto. Se llenan hacia adelante, así que en el día i
// solo contienen información hasta i — sin look-ahead.
const win = Object.fromEntries(KEYS.map((k) => [k, []]));
const mxnRets = [];
const rows = [];
let prev = {};

for (const d of dates) {
  const mxn = mxnF.get(d);
  const spxV = asOf(spx, d), goldV = asOf(gold, d), btcV = asOf(btc, d);
  const vix = asOf(vixF, d), moveV = asOf(move, d);
  const y2 = asOf(dgs2, d), y10 = asOf(dgs10, d), fed = asOf(dff, d);
  const bx = banxicoAt(d);

  // Valores CRUDOS del día, en las mismas unidades que usa /api/market.
  const raw = {
    vix,
    mxn: pctChg(mxn, prev.mxn),
    spx: pctChg(spxV, prev.spx),
    gold: pctChg(goldV, prev.gold),
    btc: pctChg(btcV, prev.btc),
    move: moveV,
    mxnvol: null, // se calcula abajo con la ventana de retornos
    carry: bx != null && fed != null ? bx - fed : null,
    curve: y2 != null && y10 != null ? y10 - y2 : null,
  };

  if (raw.mxn != null) mxnRets.push(raw.mxn / 100);
  raw.mxnvol = rollingVol(mxnRets, 21);
  if (raw.mxnvol != null) raw.mxnvol *= 100; // a puntos porcentuales

  // Sub-scores. Las dinámicas usan la ventana ANTERIOR más el valor de hoy,
  // igual que en producción.
  const subs = {};
  for (const k of KEYS) {
    const v = raw[k];
    if (RAMP[k]) {
      subs[k] = v == null ? null : lin(v, RAMP[k].at0, RAMP[k].at100);
    } else {
      if (v != null && isFinite(v)) win[k].push(v);
      subs[k] = dynSub(v, win[k], k);
      if (win[k].length > DYN_N * 3) win[k] = win[k].slice(-DYN_N * 2);
    }
  }

  const { score, wsum } = composite(subs);
  rows.push({
    date: d, mxn_close: mxn, score, wsum, band: score == null ? "" : bandOf(score),
    ...Object.fromEntries(KEYS.map((k) => [`s_${k}`, subs[k] == null ? "" : subs[k].toFixed(3)])),
    ...Object.fromEntries(KEYS.map((k) => [`r_${k}`, raw[k] == null ? "" : Number(raw[k]).toFixed(5)])),
  });

  prev = { mxn, spx: spxV ?? prev.spx, gold: goldV ?? prev.gold, btc: btcV ?? prev.btc };
}

const usable = rows.filter((r) => r.score != null);
console.log(`[hist] filas con score: ${usable.length} de ${rows.length}`);
const conBtc = usable.filter((r) => r.s_btc !== "").length;
console.log(`[hist] con las 9 señales: ${conBtc} · con 8 (sin BTC): ${usable.length - conBtc}`);

const header = Object.keys(rows[0]).join(",");
const csv = [header, ...rows.map((r) => Object.values(r).join(","))].join("\n") + "\n";
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, csv);
const sha = createHash("sha256").update(csv).digest("hex");
writeFileSync(path.join(OUT_DIR, "history.sha256"), `${sha}  history.csv\n`);
console.log(`[hist] escrito ${OUT} (${(csv.length / 1024).toFixed(0)} KB)`);
console.log(`[hist] sha256 ${sha.slice(0, 16)}…`);

// Cuántas ventanas de walk-forward salen: la pregunta que motivó todo esto.
const n = usable.length;
for (const [isY, oosY] of [[4, 1], [3, 1], [2, 0.5]]) {
  const IS = Math.round(isY * 252), OOS = Math.round(oosY * 252);
  const w = Math.max(0, Math.floor((n - IS) / OOS));
  console.log(`[hist] walk-forward IS=${isY}a OOS=${oosY}a → ${w} ventanas`);
}

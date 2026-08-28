// scripts/validate/04-fuentes.mjs
// Prueba E.6 del marco: sensibilidad a la FUENTE de precio.
//
// El marcador público es una prueba de SIGNO: pro-peso acierta si el USD/MXN
// cerró más abajo cinco días hábiles después. Si el signo de ese movimiento
// depende de qué serie de USD/MXN uses, el veredicto también depende — y
// entonces el número que publicamos no es una propiedad del mercado, es una
// propiedad de nuestro proveedor de datos.
//
// Se comparan las dos series que el proyecto ya usa:
//   · MXN=X de Yahoo (cierre de Londres) — la que alimenta el ledger y /indice.
//   · DEXMXUS de FRED (tipo de cambio de la Fed, 12:00 ET) — la del histórico
//     congelado, con fecha de sesión inequívoca.
//
// UMBRAL, fijado antes de mirar: si el signo discrepa en más del 2% de los
// casos, el marcador TIENE que declarar su fuente y congelarla; publicar un
// porcentaje sin decir de dónde sale deja de ser defendible.
//
// Uso:  node scripts/validate/04-fuentes.mjs

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadHistory, mean, fmt } from "./lib.mjs";

const LEDGER = path.join(process.cwd(), "public", "data", "postura-ledger.json");
if (!existsSync(LEDGER)) {
  console.error("falta public/data/postura-ledger.json — corre: node scripts/update-ledger.mjs");
  process.exit(1);
}

const rows = loadHistory();
const byDate = Object.fromEntries(rows.map((r, i) => [r.date, i]));
const entries = Object.values(JSON.parse(readFileSync(LEDGER, "utf8")).entries ?? {});

const H = 5;
const comp = [];
for (const e of entries) {
  if (e.mxn5 == null) continue;
  const i = byDate[e.slug];
  if (i == null || i + H >= rows.length) continue;
  const fred = ((rows[i + H].mxn_close - rows[i].mxn_close) / rows[i].mxn_close) * 100;
  comp.push({
    slug: e.slug, bias: e.bias,
    yahoo: e.mxn5, fred,
    mismoSigno: Math.sign(e.mxn5) === Math.sign(fred),
    vYahoo: e.verdict,
    vFred: e.bias === "pro-peso" ? fred < 0 : e.bias === "pro-dolar" ? fred > 0 : Math.abs(fred) <= 0.35,
  });
}

if (!comp.length) { console.log("sin posturas comparables"); process.exit(0); }

const difSigno = comp.filter((c) => !c.mismoSigno);
const difVeredicto = comp.filter((c) => c.vYahoo !== c.vFred);
const pctSigno = (100 * difSigno.length) / comp.length;

console.log(`\nPosturas comparadas: ${comp.length}\n`);
console.log("slug          Yahoo     FRED    ¿mismo signo?   ¿mismo veredicto?");
console.log("─".repeat(66));
for (const c of comp) {
  if (c.mismoSigno && c.vYahoo === c.vFred) continue; // solo las que discrepan
  console.log(
    c.slug.padEnd(13) +
    fmt(c.yahoo, 3).padStart(8) + fmt(c.fred, 3).padStart(9) +
    (c.mismoSigno ? "        sí" : "        NO").padEnd(16) +
    (c.vYahoo === c.vFred ? "sí" : "NO")
  );
}

const hitY = (100 * comp.filter((c) => c.vYahoo).length) / comp.length;
const hitF = (100 * comp.filter((c) => c.vFred).length) / comp.length;

console.log("\n── RESULTADO ──");
console.log(`  discrepancia de SIGNO:      ${difSigno.length}/${comp.length}  (${fmt(pctSigno, 1)}%)`);
console.log(`  discrepancia de VEREDICTO:  ${difVeredicto.length}/${comp.length}  (${fmt((100 * difVeredicto.length) / comp.length, 1)}%)`);
console.log(`  diferencia media absoluta:  ${fmt(mean(comp.map((c) => Math.abs(c.yahoo - c.fred))), 3)} pp`);
console.log(`  movimiento medio absoluto:  ${fmt(mean(comp.map((c) => Math.abs(c.yahoo))), 3)} pp`);
console.log(`\n  marcador con Yahoo (el publicado): ${fmt(hitY, 1)}%`);
console.log(`  marcador con FRED:                 ${fmt(hitF, 1)}%`);

const UMBRAL = 2;
console.log(`\n  UMBRAL: ${UMBRAL}% de discrepancia de signo.`);
if (pctSigno > UMBRAL) {
  console.log(`  FALLA (${fmt(pctSigno, 1)}% > ${UMBRAL}%).`);
  console.log("  El veredicto depende de la fuente en una proporción que no se puede");
  console.log("  ignorar: la diferencia entre las dos series es del mismo orden que el");
  console.log("  movimiento que intentamos medir. El marcador debe declarar su fuente");
  console.log("  y congelarla, y decir que un porcentaje a 5 días con estos tamaños de");
  console.log("  movimiento es sensible a esa elección.");
} else {
  console.log(`  PASA (${fmt(pctSigno, 1)}% ≤ ${UMBRAL}%): la elección de fuente no mueve el veredicto.`);
}
console.log();

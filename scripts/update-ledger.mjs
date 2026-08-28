// scripts/update-ledger.mjs
// Libro mayor INMUTABLE de posturas: public/data/postura-ledger.json.
//
// PROBLEMA QUE RESUELVE (auditoría 2026-08-21). lib/forwardReturns.js
// reconstruía el marcador COMPLETO en cada revalidación pidiéndole a Yahoo
// `range=6mo`. Tres consecuencias, todas malas para un producto cuyo argumento
// es la rendición de cuentas:
//
//   1. El marcador se auto-podaba. Cuando un slug sale de la ventana de 6 meses,
//      fwd() devuelve null, la postura revierte a "en curso" para siempre y
//      desaparece del denominador. La primera postura (2026-07-10) cruza ese
//      umbral hacia el 2027-01-10: el 21/26 iba a cambiar solo, sin que nadie
//      lo notara.
//   2. Si Yahoo devolvía 500, la página de credibilidad renderizaba null. La
//      página que existe para demostrar que somos confiables se caía cuando se
//      caía un tercero.
//   3. Nadie —nosotros incluidos— podía probar qué decía el marcador el mes
//      pasado.
//
// Este script corre una vez al día DESPUÉS del envío (best-effort, nunca en el
// camino del correo) y hace una sola cosa: por cada postura que ya maduró sus 5
// días hábiles y todavía no tiene veredicto, lo calcula y lo escribe. Una
// entrada con veredicto NUNCA se vuelve a tocar — ni aquí ni en ningún lado. El
// commit del ledger le pone timestamp de git a cada veredicto, así que un
// tercero puede auditarlo.
//
// Uso:  node scripts/update-ledger.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DRY = process.argv.includes("--dry");
const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const OUT_DIR = path.join(ROOT, "public", "data");
const OUT = path.join(OUT_DIR, "postura-ledger.json");
const HORIZON = 5; // días hábiles — la regla publicada en /indice, no se toca
const NEUTRAL_BAND = 0.35; // % — idem

// La fuente se DECLARA en el archivo. Publicar un porcentaje de aciertos sin
// decir de qué serie sale dejó de ser defendible cuando medimos que el signo
// cambia en 23.1% de los casos según el proveedor (2026-08-28).
const SOURCE = {
  primary: { id: "yahoo:MXN=X", label: "Yahoo Finance · MXN=X (cierre de Londres)" },
  crosscheck: { id: "fred:DEXMXUS", label: "FRED · DEXMXUS (tipo de cambio de la Fed, 12:00 ET)" },
  note: "El veredicto oficial usa la primaria desde el inicio del marcador (jul-2026) y no se cambia: hacerlo reescribiría veredictos ya publicados. El contraste se guarda al lado.",
};

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Serie diaria de cierres. `range=2y` (no 6mo) porque aquí SÍ necesitamos
// alcanzar posturas viejas; y con gmtoffset, que es el bug que corrimos un día
// toda la serie de MXN=X en los backtests (ver lib/forwardReturns.js:29).
async function dailyCloses(symbol, range = "2y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const off = r?.meta?.gmtoffset ?? 0;
  const dates = [], bySlug = {};
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || isNaN(c)) continue;
    const d = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
    if (!(d in bySlug)) dates.push(d);
    bySlug[d] = c;
  }
  return { dates, bySlug };
}

// FUENTE DE CONTRASTE (2026-08-28). scripts/validate/04-fuentes.mjs midió que
// el SIGNO del retorno a 5 días difiere en 23.1% de las posturas entre esta
// serie y DEXMXUS de FRED — contra un umbral de 2%. La diferencia media entre
// las dos (0.352 pp) es del mismo orden que el movimiento que el marcador mide
// (0.654 pp), así que a 5 días el veredicto ES sensible a qué proveedor uses.
//
// La respuesta no es esconderlo: es publicar las dos cifras y declarar cuál
// manda. Yahoo sigue siendo la primaria —es la que lleva calculando el marcador
// desde julio y cambiarla reescribiría veredictos ya publicados— y DEXMXUS se
// guarda al lado como contraste.
async function fredCloses() {
  const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXMXUS", {
    headers: { "User-Agent": YAHOO_UA },
  });
  if (!res.ok) throw new Error(`FRED DEXMXUS: HTTP ${res.status}`);
  const dates = [], bySlug = {};
  for (const line of (await res.text()).trim().split("\n").slice(1)) {
    const [d, v] = line.split(",");
    const x = parseFloat(v);
    if (isNaN(x)) continue;
    if (!(d in bySlug)) dates.push(d);
    bySlug[d] = x;
  }
  return { dates, bySlug };
}

// Retorno % de close(slug) → close(slug + n sesiones). null si aún no hay n
// sesiones posteriores (postura en curso).
function fwd(series, slug, n) {
  const i = series.dates.indexOf(slug);
  if (i === -1 || i + n >= series.dates.length) return null;
  const a = series.bySlug[series.dates[i]];
  const b = series.bySlug[series.dates[i + n]];
  if (a == null || b == null) return null;
  return ((b - a) / a) * 100;
}

// La regla de evaluación, idéntica a la publicada en components/PosturaRecord.
function judge(bias, mxn5) {
  if (mxn5 == null) return null;
  if (bias === "pro-peso") return mxn5 < 0;
  if (bias === "pro-dolar") return mxn5 > 0;
  if (bias === "neutral") return Math.abs(mxn5) <= NEUTRAL_BAND;
  return null;
}

function readPostures() {
  if (!existsSync(CONTENT)) return [];
  return readdirSync(CONTENT)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => {
      const { data } = matter(readFileSync(path.join(CONTENT, f), "utf8"));
      return { slug: f.replace(/\.md$/, ""), ...data };
    })
    .filter((p) => p.postura_bias)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

function loadLedger() {
  if (!existsSync(OUT)) return { horizon: HORIZON, neutral_band: NEUTRAL_BAND, source: SOURCE, entries: {} };
  try {
    const l = JSON.parse(readFileSync(OUT, "utf8"));
    return { horizon: HORIZON, neutral_band: NEUTRAL_BAND, source: SOURCE, entries: l.entries ?? {} };
  } catch (e) {
    // Un ledger ilegible es peor que ninguno: abortamos en vez de sobrescribir.
    console.error(`[ledger] ${OUT} ilegible (${e?.message ?? e}) — NO se toca`);
    process.exit(1);
  }
}

const main = async () => {
  const postures = readPostures();
  if (!postures.length) { console.log("[ledger] sin posturas publicadas"); return; }

  const ledger = loadLedger();
  const mxn = await dailyCloses("MXN=X");
  // Best-effort: si FRED no responde, el ledger sale sin el contraste y la UI
  // simplemente no lo muestra. Nunca bloquea el veredicto primario.
  let fred = null;
  try { fred = await fredCloses(); }
  catch (e) { console.error(`[ledger] contraste FRED no disponible: ${e?.message ?? e}`); }

  let added = 0, resolved = 0, pending = 0, frozen = 0, backfilled = 0;

  for (const p of postures) {
    const prev = ledger.entries[p.slug];

    // INMUTABLE: si ya tiene veredicto, no se recalcula NUNCA.
    if (prev?.verdict != null) {
      frozen++;
      // ÚNICA excepción, y no rompe la inmutabilidad: rellenar el contraste de
      // FRED en entradas viejas. Es un campo NUEVO que se añade al lado; el
      // veredicto, el mxn5 y el evaluated_at originales no se tocan.
      if (fred && prev.mxn5_fred === undefined) {
        const f5 = fwd(fred, p.slug, HORIZON);
        prev.mxn5_fred = f5 == null ? null : +f5.toFixed(4);
        prev.verdict_fred = f5 == null ? null : judge(p.postura_bias, f5);
        backfilled++;
      }
      continue;
    }

    const mxn5 = fwd(mxn, p.slug, HORIZON);
    const verdict = judge(p.postura_bias, mxn5);

    const entry = {
      slug: p.slug,
      bias: p.postura_bias,
      prior: p.prior_bias ?? null,
      score: p.score ?? null,
      // Banda tal como se publicó. Los views anteriores al 2026-08-21 no la
      // traen: queda null y la UI cae al recálculo, que es lo que había.
      band: p.band ?? null,
      band_cuts: p.band_cuts ?? null,
      condicion: p.postura_condicion ?? "",
      // El precio de entrada solo se estampa CUANDO SE RESUELVE. Mientras la
      // postura sigue abierta, la última barra diaria de Yahoo se mueve
      // intradía, así que reescribirla en cada corrida cambiaba el archivo sin
      // que cambiara nada real: el 24-ago produjo TRES commits (12:54, 13:38,
      // 13:57) y tres redeploys, uno por cada corrida del workflow.
      spot_t0: verdict == null ? null : (mxn.bySlug[p.slug] ?? null),
      mxn5: mxn5 == null ? null : +mxn5.toFixed(4),
      verdict,
      // Contraste con la otra serie. No decide nada: se publica al lado para
      // que el lector vea de qué depende el número.
      ...(() => {
        if (!fred) return {};
        const f5 = fwd(fred, p.slug, HORIZON);
        return {
          mxn5_fred: f5 == null ? null : +f5.toFixed(4),
          verdict_fred: f5 == null ? null : judge(p.postura_bias, f5),
        };
      })(),
      evaluated_at: verdict == null ? null : new Date().toISOString(),
    };

    if (!prev) added++;
    if (verdict != null) resolved++; else pending++;
    ledger.entries[p.slug] = entry;
  }

  const list = Object.values(ledger.entries).filter((e) => e.verdict != null);
  const hits = list.filter((e) => e.verdict).length;

  console.log(
    `[ledger] ${postures.length} posturas · ${frozen} ya congeladas · ${added} nuevas · ` +
    `${resolved} resueltas ahora · ${pending} en curso`
  );
  console.log(`[ledger] marcador acumulado: ${hits}/${list.length}`);
  const conFred = list.filter((e) => e.verdict_fred != null);
  if (conFred.length) {
    const hf = conFred.filter((e) => e.verdict_fred).length;
    const dif = conFred.filter((e) => e.verdict !== e.verdict_fred).length;
    console.log(
      `[ledger] contraste FRED: ${hf}/${conFred.length} · el veredicto difiere en ${dif} ` +
      `(${((100 * dif) / conFred.length).toFixed(1)}%)` + (backfilled ? ` · ${backfilled} rellenadas` : "")
    );
  }

  if (DRY) { console.log("[ledger] --dry: no se escribió nada"); return; }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`[ledger] escrito ${OUT}`);
};

main().catch((e) => {
  // Best-effort: este script JAMÁS debe tumbar el workflow del correo.
  console.error(`[ledger] falló (se ignora): ${e?.message ?? e}`);
  process.exit(0);
});

// lib/forwardReturns.js
// "¿Qué pasó después?": por cada view publicado, el retorno de USD/MXN y del
// S&P en los 5 y 10 días HÁBILES siguientes, agrupado por banda del índice.
// Corre server-side en el build de /indice (que se redeploya a diario con el
// cron), así que se actualiza solo. Es evidencia, no promesa: con muestra
// chica el front lo dice.
import { riskBand, BANDS } from "./riskScore.js";
import { mean, median, friccionPct } from "./stats.js";
import fs from "node:fs";
import path from "node:path";

// Libro mayor de veredictos (public/data/postura-ledger.json), escrito por
// scripts/update-ledger.mjs. Best-effort: si no existe o no parsea, se devuelve
// null y todo cae al comportamiento anterior (recalcular contra Yahoo).
function loadLedger() {
  try {
    const p = path.join(process.cwd(), "public", "data", "postura-ledger.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { entries: j?.entries ?? null, source: j?.source ?? null };
  } catch {
    return { entries: null, source: null };
  }
}

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Serie diaria de cierres { "YYYY-MM-DD": close } de los últimos 6 meses.
async function dailyCloses(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
  const result = (await res.json())?.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  // La fecha de la sesión es la LOCAL de la bolsa, no la UTC. Yahoo estampa las
  // barras FX en Europe/London (abren 23:00 UTC) → con .toISOString() pelón
  // toda la serie MXN=X quedaba etiquetada un día ANTES y los slugs de viernes
  // jamás matcheaban: las posturas del viernes se quedaban "en curso" para
  // siempre y las ventanas de 5 días iban corridas una sesión (bug hasta
  // 2026-07-31). gmtoffset del meta = corrimiento correcto por símbolo (para
  // ^GSPC es −4/−5h y las 13:30 UTC siguen cayendo el mismo día: sin cambio).
  const off = result?.meta?.gmtoffset ?? 0;
  const dates = [];   // orden cronológico de días hábiles
  const bySlug = {};  // fecha → cierre
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || isNaN(c)) continue;
    const d = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
    if (!(d in bySlug)) dates.push(d);
    bySlug[d] = c;
  }
  return { dates, bySlug };
}

// Retorno % desde el cierre del día del view hasta N días hábiles después.
function fwd(series, slug, n) {
  const i = series.dates.indexOf(slug);
  if (i === -1 || i + n >= series.dates.length) return null;
  const a = series.bySlug[series.dates[i]];
  const b = series.bySlug[series.dates[i + n]];
  return a ? ((b - a) / a) * 100 : null;
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// Auto-evaluación de UN view: qué hizo el mercado 5/10 días hábiles después
// de publicarse. null si Yahoo falla o el view aún no cumple 5 días (el
// front lo omite y ya).
export async function forwardForSlug(slug) {
  try {
    const [mxn, spx] = await Promise.all([dailyCloses("MXN=X"), dailyCloses("^GSPC")]);
    const mxn5 = fwd(mxn, slug, 5);
    if (mxn5 == null) return null;
    return {
      mxn5,
      mxn10: fwd(mxn, slug, 10),
      spx5: fwd(spx, slug, 5),
      spx10: fwd(spx, slug, 10),
    };
  } catch {
    return null;
  }
}

// ── Marcador de posturas (2026-07-14) ────────────────────────────────────────
// Cada postura publicada (postura_bias, guardada desde 2026-07-10) contra lo
// que hizo el USD/MXN en los 5 días hábiles siguientes. Regla TRANSPARENTE:
// pro-peso acierta si USD/MXN cayó; pro-dolar si subió; neutral si el
// movimiento absoluto fue ≤0.35%. "En curso" mientras no pasen 5 días hábiles.
// Es evidencia, no promesa — el front muestra la regla y el n.
export async function posturaRecord(posts) {
  try {
    const withBias = posts.filter((p) => p.postura_bias);
    if (!withBias.length) return null;
    // El LIBRO MAYOR manda sobre Yahoo. Un veredicto escrito ahí ya está
    // congelado con su commit fechado y no se recalcula: eso es lo que impide
    // que el marcador se auto-pode cuando un slug sale de la ventana de 6 meses
    // (la primera postura, 2026-07-10, la cruza hacia enero de 2027) y lo que
    // hace que /indice siga rindiendo cuentas aunque Yahoo devuelva 500.
    // Lo escribe scripts/update-ledger.mjs una vez al día, después del envío.
    const { entries: ledger, source } = loadLedger();
    let mxn = null;
    try {
      mxn = await dailyCloses("MXN=X");
    } catch (e) {
      // Sin Yahoo seguimos: el ledger cubre todo lo ya resuelto y lo pendiente
      // simplemente se muestra "en curso". Antes esto devolvía null y la página
      // de credibilidad no mostraba NADA (auditoría 2026-08-21).
      console.error(`[posturaRecord] Yahoo no respondió, se usa solo el ledger: ${e?.message ?? e}`);
    }
    const rows = withBias.map((p) => {
      const led = ledger?.[p.slug];
      let mxn5 = led?.verdict != null ? led.mxn5 : (mxn ? fwd(mxn, p.slug, 5) : null);
      let verdict = led?.verdict ?? null; // null = aún en curso
      if (verdict == null && mxn5 != null) {
        verdict =
          p.postura_bias === "pro-peso"  ? mxn5 < 0 :
          p.postura_bias === "pro-dolar" ? mxn5 > 0 :
          Math.abs(mxn5) <= 0.35;
      }
      // Avance parcial de las posturas en curso: días hábiles transcurridos y
      // movimiento acumulado hasta el último cierre disponible ("día 2/5 ·
      // −0.31%"). Solo feedback visual — la evaluación sigue siendo a 5 días.
      let sofar = null, days = null;
      if (mxn5 == null && mxn) {
        const i = mxn.dates.indexOf(p.slug);
        if (i !== -1) {
          days = Math.min(mxn.dates.length - 1 - i, 5);
          const a = mxn.bySlug[p.slug];
          const b = mxn.bySlug[mxn.dates[mxn.dates.length - 1]];
          if (a && b && days > 0) sofar = ((b - a) / a) * 100;
        }
      }
      return {
        slug: p.slug,
        bias: p.postura_bias,
        sofar, days,
        // Prior cuantitativo del día (persistido desde 2026-07-30): permite
        // auditar si el criterio editorial suma sobre la estadística base.
        prior: p.prior_bias ?? null,
        condicion: p.postura_condicion ?? "",
        title_es: p.title_es ?? "", title_en: p.title_en ?? "",
        mxn5, verdict,
      };
    });
    const resolved = rows.filter((r) => r.verdict != null);

    // ── BENCHMARK INGENUO ────────────────────────────────────────────────
    // El número que faltaba. El marcador solo tiene sentido contra la
    // alternativa trivial: "escribe pro-peso todos los días, sin pensar".
    // Sobre EXACTAMENTE las mismas fechas resueltas, para que la comparación
    // sea limpia. 26 de 31 posturas publicadas han sido pro-peso, con 22
    // seguidas, así que sin este contraste el marcador se lee como criterio
    // cuando en buena parte es la deriva del par (auditoría 2026-08-21).
    const benchHits = resolved.filter((r) => r.mxn5 != null && r.mxn5 < 0).length;

    // ── MAGNITUD ─────────────────────────────────────────────────────────
    // El veredicto es una prueba de SIGNO: un acierto de −0.02% puntúa igual
    // que uno de −2%. Publicar solo el % de aciertos oculta si el edge tiene
    // tamaño suficiente para sobrevivir a la fricción.
    // Se orienta el retorno A FAVOR de la postura: positivo = la postura ganó.
    const aFavor = resolved
      .map((r) => (r.bias === "pro-dolar" ? r.mxn5 : r.bias === "pro-peso" ? -r.mxn5 : null))
      .filter((v) => Number.isFinite(v));
    // Supuesto de fricción EXPLÍCITO y visible en la UI: 2 centavos de spread
    // ida y vuelta sobre un spot de ~16.9 ≈ 0.118%. No es el spread
    // institucional (mucho menor): es el orden de magnitud que enfrentaría un
    // lector operando en retail, que es quien lee esto.
    const CENTAVOS_IDA_Y_VUELTA = 2;
    const fricc = friccionPct(CENTAVOS_IDA_Y_VUELTA);
    // Desglose por sesgo (para la UI): n, aciertos y retorno promedio.
    const byBias = {};
    for (const b of ["pro-peso", "neutral", "pro-dolar"]) {
      const xs = resolved.filter((r) => r.bias === b);
      if (xs.length)
        byBias[b] = { n: xs.length, hits: xs.filter((r) => r.verdict).length };
    }
    // ── CONTRASTE DE FUENTE ───────────────────────────────────────────────
    // Se compara SOLO sobre las posturas que tienen veredicto en las DOS
    // series: DEXMXUS publica con rezago, y comparar 31 contra 26 sería
    // trampa. Sobre el mismo subconjunto, el número honesto.
    const ambos = Object.values(ledger ?? {}).filter(
      (e) => e.verdict != null && e.verdict_fred != null
    );
    const contraste = ambos.length
      ? {
          n: ambos.length,
          primaria: ambos.filter((e) => e.verdict).length,
          contraste: ambos.filter((e) => e.verdict_fred).length,
          difieren: ambos.filter((e) => e.verdict !== e.verdict_fred).length,
        }
      : null;

    return {
      rows: [...rows].reverse(), // más reciente primero
      resolved: resolved.length,
      hits: resolved.filter((r) => r.verdict).length,
      byBias,
      source,
      contraste,
      // Benchmark ingenuo sobre las mismas fechas.
      benchmark: { hits: benchHits, n: resolved.length },
      // Magnitud, a favor de la postura, bruta y neta de fricción.
      retorno: {
        media: mean(aFavor),
        mediana: median(aFavor),
        mediaNeta: mean(aFavor) == null ? null : mean(aFavor) - fricc,
        friccionPct: fricc,
        centavos: CENTAVOS_IDA_Y_VUELTA,
      },
    };
  } catch (e) {
    console.error(`[posturaRecord] falló: ${e?.message ?? e}`);
    return null;
  }
}

// points: [{ slug, score }] ascendente. Devuelve filas por banda + total de
// observaciones utilizables, o null si Yahoo falló (el front lo omite).
export async function computeForwardReturns(points) {
  try {
    const [mxn, spx] = await Promise.all([dailyCloses("MXN=X"), dailyCloses("^GSPC")]);
    const byBand = new Map(BANDS.map((b) => [b.key, { mxn5: [], mxn10: [], spx5: [], spx10: [] }]));
    let usable = 0;

    for (const p of points) {
      // La banda PUBLICADA manda. Recalcularla con riskBand() aplicaba los
      // cortes de hoy a scores de ayer: cuando cambiaron el 2026-07-13
      // (29/48/72 → 32/49/67), views publicados como CONSTRUCTIVE saltaron a
      // RISK-ON y el bucket creció ~50% sin un solo día nuevo de mercado.
      // Los views desde el 21-ago-2026 traen `band` en el front-matter; los
      // anteriores caen al recálculo porque no hay dato mejor — y esa es la
      // razón por la que vale la pena congelarla de aquí en adelante.
      const bucket = byBand.get(p.band ?? riskBand(p.score).key);
      if (!bucket) continue; // banda histórica que ya no existe en BANDS
      const m5 = fwd(mxn, p.slug, 5);
      if (m5 == null) continue; // sin 5 días de historia posterior aún
      usable++;
      bucket.mxn5.push(m5);
      const m10 = fwd(mxn, p.slug, 10);
      if (m10 != null) bucket.mxn10.push(m10);
      const s5 = fwd(spx, p.slug, 5);
      if (s5 != null) bucket.spx5.push(s5);
      const s10 = fwd(spx, p.slug, 10);
      if (s10 != null) bucket.spx10.push(s10);
    }

    const rows = BANDS.map((b) => {
      const x = byBand.get(b.key);
      return {
        band: b.key, color: b.color, n: x.mxn5.length,
        mxn5: avg(x.mxn5), mxn10: avg(x.mxn10),
        spx5: avg(x.spx5), spx10: avg(x.spx10),
      };
    }).filter((r) => r.n > 0);

    return usable >= 5 ? { rows, usable } : null; // muestra mínima honesta
  } catch {
    return null;
  }
}

// lib/forwardReturns.js
// "¿Qué pasó después?": por cada view publicado, el retorno de USD/MXN y del
// S&P en los 5 y 10 días HÁBILES siguientes, agrupado por banda del índice.
// Corre server-side en el build de /indice (que se redeploya a diario con el
// cron), así que se actualiza solo. Es evidencia, no promesa: con muestra
// chica el front lo dice.
import { riskBand, BANDS } from "./riskScore.js";

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
  const dates = [];   // orden cronológico de días hábiles
  const bySlug = {};  // fecha → cierre
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || isNaN(c)) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
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
    const mxn = await dailyCloses("MXN=X");
    const rows = withBias.map((p) => {
      const mxn5 = fwd(mxn, p.slug, 5);
      let verdict = null; // null = aún en curso
      if (mxn5 != null) {
        verdict =
          p.postura_bias === "pro-peso"  ? mxn5 < 0 :
          p.postura_bias === "pro-dolar" ? mxn5 > 0 :
          Math.abs(mxn5) <= 0.35;
      }
      return {
        slug: p.slug,
        bias: p.postura_bias,
        condicion: p.postura_condicion ?? "",
        title_es: p.title_es ?? "", title_en: p.title_en ?? "",
        mxn5, verdict,
      };
    });
    const resolved = rows.filter((r) => r.verdict != null);
    return {
      rows: [...rows].reverse(), // más reciente primero
      resolved: resolved.length,
      hits: resolved.filter((r) => r.verdict).length,
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
      const bucket = byBand.get(riskBand(p.score).key);
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

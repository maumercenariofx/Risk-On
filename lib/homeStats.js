// lib/homeStats.js
// Estadísticas del Home V2 (2026-09-03): todo lo que el hero muestra además
// del score vivo sale de aquí, y todo es puro (sin fs, sin React) para que
// tests/homeStats.test.mjs lo cubra sin montar nada.
//
// Los posts llegan como los devuelve getAllPostsMeta(): DESC por fecha, [0] es
// el más reciente.
import { riskBand } from "./riskScore.js";

// Banda de un view. 58 views anteriores al 2026-08-21 no traen `band` en el
// front-matter; para ellos se recalcula con los cortes actuales (cambiaron el
// 2026-07-13: 29/48/72 → 32/49/67), así que en esa cola antigua la banda
// recalculada puede diferir de la publicada. Se acepta: la edad del régimen
// rara vez cruza esa fecha.
export function bandOf(post) {
  if (post?.band) return post.band;
  const s = Number(post?.score);
  if (!Number.isFinite(s)) return null;
  return riskBand(s).key;
}

// Views consecutivos (desde el más reciente) en la misma banda. Se etiqueta en
// VIEWS, no en días: los views son L-V y hay huecos.
export function regimeAge(postsDesc) {
  if (!postsDesc?.length) return 0;
  const head = bandOf(postsDesc[0]);
  if (!head) return 0;
  let n = 0;
  for (const p of postsDesc) {
    if (bandOf(p) !== head) break;
    n++;
  }
  return n;
}

// Rango de score de los 7 views más recientes (incluido hoy). Oculto si n<3.
export function range7(postsDesc) {
  const scores = (postsDesc ?? [])
    .map((p) => Number(p?.score))
    .filter((s) => Number.isFinite(s))
    .slice(0, 7);
  if (scores.length < 3) return null;
  return { min: Math.min(...scores), max: Math.max(...scores), n: scores.length };
}

// Empuje de cada señal: w·(sub−50)/Σw. Es la atribución exacta del promedio
// ponderado respecto al punto neutro (50): la suma de empujes es score−50.
// NO es "contribución" estadística ni predice nada — describe el nowcast.
// Σw solo cuenta señales con dato, igual que computeRiskScore.
export function pushes(breakdown) {
  if (!Array.isArray(breakdown)) return [];
  const withData = breakdown.filter((b) => b?.sub != null && Number.isFinite(Number(b?.sub)));
  const wsum = withData.reduce((a, b) => a + Number(b.w), 0);
  return breakdown.map((b) => {
    const sub = Number(b?.sub);
    if (b?.sub == null || !Number.isFinite(sub) || !wsum) return { ...b, push: null };
    return { ...b, push: (Number(b.w) * (sub - 50)) / wsum };
  });
}

// lib/posturaPrior.js
// Prior cuantitativo de la postura diaria. Client-safe, sin deps.
//
// ─────────────────────────────────────────────────────────────────────────────
// REESCRITO EL 2026-08-28. Qué cambió y por qué.
//
// La versión anterior (2026-07-30) afirmaba tres cosas que la evidencia no
// sostiene, y las metía en el prompt del redactor todas las mañanas:
//
//   1. "Base histórica pro-peso: 57%". Era el número del tramo 2021-2026, el
//      único de la muestra donde el peso se apreció. Sobre 21 años congelados
//      (data/backtest/history.csv, 5,417 observaciones) la base es 53.0%, y
//      entre 2014 y 2020 fue 49.2% — peor que un volado.
//   2. "Banda RISK-OFF → 76%". Retirado el 21-ago: el backtest iba corrido una
//      sesión por no aplicar gmtoffset. Sobre 21 años da 58.8% (n=160) con
//      IC95 [51.0, 66.1], que CONTIENE la base de 53.0%: no es distinguible.
//   3. Las CINCO ramas devolvían `pro-peso`. El modelo era estructuralmente
//      incapaz de decir otra cosa, así que la comparación "editorial vs
//      modelo" del marcador nacía sesgada — y de hecho coincidieron 16 de 16.
//
// Y al hacerlo simétrico se cayó lo último que quedaba: si el estiramiento
// fuera reversión de verdad, funcionaría en los dos sentidos. No lo hace.
//
//   estiramiento > +1 → pro-peso    53.6%  (n=1839)   base 53.0%
//   estiramiento < −1 → pro-dólar   47.0%  (n=2292)   ← PIERDE
//
// Lo que parecía reversión era la deriva del par. Ninguna regla probada supera
// a "siempre pro-peso" fuera de la ventana donde se calibró (walk-forward de 17
// ventanas: Sharpe OOS 0.11, gana en 6 de 17, elige 12 configuraciones
// distintas). Ver scripts/validate/.
//
// QUÉ HACE AHORA. El prior dejó de recomendar dirección, porque no tiene con
// qué. Reporta el CONTEXTO del día —dónde está el par respecto a su media, en
// qué banda cae el score— con las cifras honestas de 21 años y por régimen, y
// dice explícitamente que la dirección la decide el catalizador, no él.
//
// `bias` puede ser null: significa "el prior no opina hoy", que es distinto de
// "el prior dice neutral". Eso preserva la auditoría del marcador (la marca
// ≠ prior) para los días en que sí tiene una lectura, sin fabricar una opinión
// los días en que no.
// ─────────────────────────────────────────────────────────────────────────────

// Estiramiento del USD/MXN: distancia del spot a su media de 20 días, en
// unidades de rango medio diario (ATR proxy = media de |Δcierre| de 14 días).
// MISMA definición que el backtest (scripts/validate/lib.mjs) — no cambiar una
// sin la otra en el mismo commit.
export function computeStretch(closes) {
  const xs = (closes ?? []).filter((v) => v != null && !isNaN(v));
  if (xs.length < 21) return null;
  const last = xs[xs.length - 1];
  const w20 = xs.slice(-20);
  const ma20 = w20.reduce((s, v) => s + v, 0) / 20;
  const diffs = [];
  for (let i = xs.length - 14; i < xs.length; i++) diffs.push(Math.abs(xs[i] - xs[i - 1]));
  const atr = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  if (!atr || !isFinite(atr)) return null;
  return (last - ma20) / atr;
}

// Cifras de referencia, todas de la serie congelada de 21 años. Se citan tal
// cual en el prompt: son el contexto que el redactor necesita para NO exagerar.
export const BASE = {
  proPeso21a: 53.0,
  proPeso5a: 57.4,
  proPeso2014_2020: 49.2,
  riskOff21a: { pct: 58.8, n: 160, ic: [51.0, 66.1] },
  estira21a: { pct: 53.6, n: 1839 },
  estiraCorto21a: { pct: 47.0, n: 2292 },
};

// Prior del día. `band` = clave de banda del score YA calculado (riskState).
// Devuelve null solo si no hay insumos.
export function computePosturaPrior({ band, stretch }) {
  if (!band) return null;
  const s = stretch ?? null;

  const contexto = [];
  if (s != null && isFinite(s)) {
    const dir = s > 0 ? "por ENCIMA" : "por DEBAJO";
    contexto.push(`el par está ${Math.abs(s).toFixed(1)} ATR ${dir} de su media de 20 días`);
  }
  if (band === "RISK-OFF") contexto.push("el score cae en la banda RISK-OFF (cola de pánico, ~3% de los días)");
  else if (band === "RISK-ON") contexto.push("el score cae en la banda RISK-ON (cola de complacencia, ~4% de los días)");

  // La ÚNICA lectura con un gap positivo contra la base sobre 21 años, y aun
  // así su IC contiene a la base. Se marca como indicio, jamás como edge.
  if (band === "RISK-OFF") {
    return {
      bias: null,
      fuerza: "SIN SEÑAL ACCIONABLE",
      señal: contexto.join("; ") || "banda RISK-OFF",
      stat:
        `sobre 21 años la banda RISK-OFF va ${BASE.riskOff21a.pct}% pro-peso (n=${BASE.riskOff21a.n}, ` +
        `IC95 ${BASE.riskOff21a.ic[0]}–${BASE.riskOff21a.ic[1]}) contra una base de ${BASE.proPeso21a}%. ` +
        `El intervalo CONTIENE a la base: es el mejor indicio que tenemos y aun así no es distinguible. ` +
        `Es contexto para el argumento, no un porcentaje que se cite.`,
      stretch: s,
    };
  }

  if (s != null && Math.abs(s) > 1) {
    return {
      bias: null,
      fuerza: "SIN SEÑAL ACCIONABLE",
      señal: contexto.join("; "),
      stat:
        `el estiramiento no es reversión: a ${BASE.estira21a.pct}% cuando está estirado al alza ` +
        `(n=${BASE.estira21a.n}) contra ${BASE.proPeso21a}% de base, y a ${BASE.estiraCorto21a.pct}% ` +
        `en el lado contrario (n=${BASE.estiraCorto21a.n}), que PIERDE. Lo que parecía reversión era la ` +
        `deriva del par. Úsalo como color técnico, nunca como razón estadística.`,
      stretch: s,
    };
  }

  return {
    bias: null,
    fuerza: "SIN SEÑAL",
    señal: contexto.join("; ") || "sin extremos de banda ni de estiramiento hoy",
    stat:
      `no hay señal estadística que aporte hoy. La base "siempre pro-peso" es ${BASE.proPeso21a}% ` +
      `sobre 21 años —fue ${BASE.proPeso5a}% en los últimos 5 y ${BASE.proPeso2014_2020}% entre 2014 y 2020, ` +
      `así que depende del régimen, no es una constante—. La dirección de hoy la decide el catalizador.`,
    stretch: s,
  };
}

// Bloque de prompt para el redactor (lib/dailyView.js). El prior es CONTEXTO,
// no una recomendación: ya no dice "tu postura parte de este prior", porque
// el prior dejó de tener una postura de la que partir.
export function priorPromptBlock(prior) {
  if (!prior) return "";
  const linea = prior.bias
    ? `- Prior: **${prior.bias.toUpperCase()} ${prior.fuerza}** — ${prior.stat}.`
    : `- El prior NO tiene dirección hoy (${prior.fuerza}) — ${prior.stat}`;

  return `
CONTEXTO CUANTITATIVO (serie congelada de 21 años, 2005-2026, reproducible con scripts/validate/):
- Lectura de hoy: ${prior.señal}.
${linea}
CÓMO USARLO (obligatorio):
1. La dirección la eliges TÚ, con el catalizador del día. Hasta el 28-ago-2026 este bloque emitía una postura pro-peso todos los días apoyada en una base del 57% que resultó ser del régimen 2021-2026; sobre 21 años esa base es 53% y entre 2014 y 2020 fue 49%. Ya no se emite.
2. PROHIBIDO citar un porcentaje de acierto de estas señales como si fuera un edge. Ninguna supera a "siempre pro-peso" fuera de la ventana donde se calibró. Si mencionas la estadística, menciónala con su debilidad.
3. Las tres direcciones están abiertas y ninguna tiene la carga de la prueba estadística encima: pro-peso, neutral y pro-dólar se sostienen o no por el argumento del día.
4. NEUTRAL sigue siendo una afirmación fuerte bajo la regla del marcador —solo acierta si el par se mueve ≤0.35% en 5 días hábiles— así que úsalo con una tesis de rango explícita (qué techo y qué piso), no como refugio.
5. La condición de invalidación (postura_condicion) es tuya y del día.`;
}

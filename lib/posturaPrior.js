// lib/posturaPrior.js
// Prior cuantitativo de la postura diaria (2026-07-30). Client-safe, sin deps.
//
// Fuente: scripts/research-posturas.mjs — backtest 5 años (nov-2021 → jul-2026,
// ~1,180 días hábiles) con las 9 señales reales (carry y curva incluidos, no
// constantes) y la REGLA DEL MARCADOR de /indice: pro-peso acierta si el
// USD/MXN cerró abajo 5 días hábiles después; pro-dólar si cerró arriba;
// neutral solo si |mov| ≤ 0.35%.
//
// Hallazgos que fijan la regla (todos verificados por mitades del sample):
//   · Base histórica pro-peso: 57% (mitad reciente: 54%) — la deriva + carry.
//   · Banda RISK-OFF → pro-peso: 76% (n=38; mitad reciente 64%). El pánico
//     extremo ha sido zona de rebote del peso. El edge real del índice.
//   · Estiramiento (spot − MA20)/ATR14 > +1 → pro-peso: 62% (n=335; estable
//     59-66% en umbrales 0.5–2.0 y en ambas mitades). Par estirado revierte.
//   · NEUTRAL es trampa bajo la regla del marcador: acierta ~21% (29% incluso
//     en régimen de baja vol). Solo se justifica como tesis de rango explícita.
//   · PRO-DÓLAR sin respaldo de base: 43%; ni RISK-ON→dólar sobrevive la mitad
//     reciente (42%, n=19). Exige catalizador del día, no estadística.
//   · El score es NOWCAST: su IC a 1d es momentum (−0.06) y a 5-10d contrarian
//     (+0.08/+0.10) — nunca usarlo como pronóstico direccional lineal.

// Estiramiento del USD/MXN: distancia del spot a su media de 20 días, en
// unidades de rango medio diario (ATR proxy = media de |Δcierre| de 14 días).
// MISMA definición que el backtest — no cambiar una sin la otra.
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

// Prior del día. `band` = clave de banda del score YA calculado (riskState).
// Devuelve null solo si no hay insumos (el view sale sin prior, como antes).
export function computePosturaPrior({ band, stretch }) {
  if (!band) return null;
  const s = stretch ?? 0;

  if (band === "RISK-OFF") {
    return {
      bias: "pro-peso", fuerza: "FUERTE",
      señal: "banda RISK-OFF (pánico extremo = zona histórica de rebote del peso)",
      stat: "76% de acierto en 38 episodios de 5 años (64% en la mitad reciente); USD/MXN −0.76% promedio a 5 días",
    };
  }
  if (s > 1) {
    return {
      bias: "pro-peso", fuerza: "FUERTE",
      señal: `USD/MXN estirado +${s.toFixed(1)} ATR sobre su media de 20 días (reversión)`,
      stat: "62% de acierto en 335 días de 5 años (59% en la mitad reciente), estable en todos los umbrales probados",
    };
  }
  if (s > 0.5) {
    return {
      bias: "pro-peso", fuerza: "MODERADO",
      señal: `USD/MXN +${s.toFixed(1)} ATR sobre su media de 20 días`,
      stat: "63% de acierto histórico en el tramo 0.5–1.0 ATR",
    };
  }
  if (band === "RISK-ON") {
    return {
      bias: "pro-peso", fuerza: "LEVE",
      señal: "banda RISK-ON (complacencia) sin estiramiento — zona SIN edge estadístico",
      stat: "en RISK-ON la base pro-peso desaparece (50% en 22 episodios de 5 años): llamada libre — manda el catalizador del día, no la estadística",
    };
  }
  return {
    bias: "pro-peso", fuerza: "LEVE",
    señal: "sin señal extrema hoy — aplica solo la base histórica (deriva + carry)",
    stat: "57% de base en 5 años, pero 54% en la mitad reciente: apenas mejor que un volado — aquí pesa más el catalizador del día que la estadística",
  };
}

// Bloque de prompt para el redactor (lib/dailyView.js). El prior es evidencia
// con jerarquía: manda salvo catalizador concreto, y las desviaciones se
// declaran — así el marcador público mide al modelo Y al criterio editorial.
export function priorPromptBlock(prior) {
  if (!prior) return "";
  return `
PRIOR CUANTITATIVO DE LA POSTURA (backtest de 5 años con la regla del marcador público, reproducible con scripts/research-posturas.mjs):
- Señal de hoy: ${prior.señal}.
- Prior: **${prior.bias.toUpperCase()} ${prior.fuerza}** — ${prior.stat}.
REGLAS DEL PRIOR (obligatorias):
1. Tu postura_bias PARTE de este prior. Puedes contradecirlo solo con un catalizador CONCRETO y verificable de hoy (dato ya publicado del pulso, evento inminente del calendario, ruptura técnica de un nivel citado) — y si lo contradices, declara en el body que vas contra la base estadística y por qué (una línea; la honestidad es el sello de la casa).
2. NEUTRAL es una afirmación fuerte, no un refugio: solo acierta si el par se mueve ≤0.35% en 5 días hábiles (~21% de los días en 5 años). Úsalo únicamente con una tesis de rango explícita (qué techo y qué piso lo sostienen).
3. PRO-DÓLAR no tiene base estadística a su favor (43% histórico): exige un catalizador claro del día y decláralo.
4. Con prior LEVE tienes libertad total: la base (54-57%) apenas supera el volado — ahí el catalizador del día pesa más que la estadística, y decirlo abiertamente suma credibilidad.
5. La condición de invalidación (postura_condicion) sigue siendo tuya y del día — el prior no la dicta.`;
}

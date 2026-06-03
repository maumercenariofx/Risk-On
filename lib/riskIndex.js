// lib/riskIndex.js
// ---------------------------------------------------------------------------
// El índice Risk On (0 = risk-off total / miedo; 100 = risk-on total / apetito)
// Es un indicador COMPUESTO y TRANSPARENTE. Cada componente se normaliza a una
// escala 0-100 segun rangos historicos tipicos, se invierte cuando "mas alto =
// mas miedo", y se promedia con pesos. La idea es que sea defendible y educable:
// siempre puedes mostrar por que el indice esta donde esta.
// ---------------------------------------------------------------------------

// Pesos del indice. Suman 1. Ajustables a criterio de mercado.
export const WEIGHTS = {
  vix: 0.40,   // VIX: el "indice del miedo" del S&P 500 (estrella)
  dxy: 0.25,   // DXY: fuerza del dolar (dolar fuerte => risk-off)
  move: 0.20,  // MOVE: volatilidad esperada en bonos de EE.UU.
  mxn: 0.15,   // Volatilidad implicita del USD/MXN
};

// Rangos tipicos para normalizar (min = mas extremo, max = otro extremo).
// Calibrados con niveles historicos comunes; ajustables.
const RANGES = {
  vix:  { calm: 12, panic: 35 },   // <12 muy tranquilo, >35 panico
  move: { calm: 70, panic: 140 },  // indice MOVE
  dxy:  { weak: 99, strong: 108 }, // dolar debil vs fuerte
  mxn:  { calm: 7,  panic: 16 },   // vol implicita USDMXN en %
};

// clamp helper
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

// Normaliza un valor donde "mas alto = mas miedo" -> score risk-on (alto=bueno)
function scoreFearGauge(value, calm, panic) {
  // value en [calm, panic]; calm => 100 (risk-on), panic => 0 (risk-off)
  const pct = (value - calm) / (panic - calm); // 0 en calm, 1 en panic
  return clamp(100 - pct * 100);
}

// DXY: dolar fuerte = risk-off. weak => 100, strong => 0
function scoreDollar(value, weak, strong) {
  const pct = (value - weak) / (strong - weak);
  return clamp(100 - pct * 100);
}

// Calcula el indice y devuelve el desglose completo
export function computeRiskIndex({ vix, move, dxy, mxnVol }) {
  const comp = {
    vix: scoreFearGauge(vix, RANGES.vix.calm, RANGES.vix.panic),
    move: scoreFearGauge(move, RANGES.move.calm, RANGES.move.panic),
    dxy: scoreDollar(dxy, RANGES.dxy.weak, RANGES.dxy.strong),
    mxn: scoreFearGauge(mxnVol, RANGES.mxn.calm, RANGES.mxn.panic),
  };

  const score = Math.round(
    comp.vix * WEIGHTS.vix +
    comp.dxy * WEIGHTS.dxy +
    comp.move * WEIGHTS.move +
    comp.mxn * WEIGHTS.mxn
  );

  return { score: clamp(score), components: comp };
}

// Etiqueta y color segun el score
export function riskLabel(score) {
  if (score >= 75) return { es: "Risk-on fuerte", en: "Strong risk-on", color: "#0F6E56" };
  if (score >= 58) return { es: "Risk-on moderado", en: "Moderate risk-on", color: "#639922" };
  if (score >= 42) return { es: "Neutral", en: "Neutral", color: "#BA7517" };
  if (score >= 25) return { es: "Neutral, con cautela", en: "Neutral, leaning cautious", color: "#D85A30" };
  return { es: "Risk-off / miedo", en: "Risk-off / fear", color: "#A32D2D" };
}

// Texto explicativo de cada componente (bilingue)
export function componentMeta(values) {
  const { vix, move, dxy, mxnVol } = values;
  return {
    vix: {
      label: "VIX",
      sub: { es: "(miedo)", en: "(fear)" },
      value: vix.toFixed(1),
      detail: {
        es: `VIX ${vix.toFixed(1)} — Mide cuanta turbulencia esperan los inversionistas en el S&P 500 los proximos 30 dias. Mas bajo = mas calma = empuja hacia risk-on.`,
        en: `VIX ${vix.toFixed(1)} — Gauges expected S&P 500 turbulence over the next 30 days. Lower = calmer = pushes toward risk-on.`,
      },
    },
    move: {
      label: "MOVE",
      sub: { es: "(bonos)", en: "(bonds)" },
      value: Math.round(move).toString(),
      detail: {
        es: `MOVE ${Math.round(move)} — El "VIX de los bonos": volatilidad esperada en la deuda de EE.UU.`,
        en: `MOVE ${Math.round(move)} — The "bond market VIX": expected volatility in US Treasuries.`,
      },
    },
    dxy: {
      label: "DXY",
      sub: { es: "(dolar)", en: "(dollar)" },
      value: dxy.toFixed(1),
      detail: {
        es: `DXY ${dxy.toFixed(1)} — Fuerza del dolar contra otras divisas. Dolar fuerte suele significar dinero buscando refugio: empuja hacia risk-off.`,
        en: `DXY ${dxy.toFixed(1)} — The dollar's strength vs other currencies. A strong dollar usually means money seeking safety: pushes toward risk-off.`,
      },
    },
    mxn: {
      label: "MXN vol",
      sub: { es: "", en: "" },
      value: mxnVol.toFixed(1) + "%",
      detail: {
        es: `Volatilidad implicita del USD/MXN ${mxnVol.toFixed(1)}% — Cuanto movimiento espera el mercado en el peso.`,
        en: `USD/MXN implied volatility ${mxnVol.toFixed(1)}% — How much movement the market expects in the peso.`,
      },
    },
  };
}

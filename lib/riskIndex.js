// lib/riskIndex.js
// Índice Risk On (0 = risk-off / miedo total · 100 = risk-on / apetito total)
// Indicador compuesto y transparente: 5 señales de mercado normalizadas a 0-100
// según rangos históricos típicos, ponderadas y promediadas.

export const WEIGHTS = {
  vix:   0.35,  // VIX — volatilidad esperada del S&P 500 (el "índice del miedo")
  dxy:   0.22,  // DXY — fuerza del dólar (dólar fuerte = refugio = risk-off)
  move:  0.18,  // MOVE — volatilidad esperada en bonos del Tesoro de EE.UU.
  us10y: 0.15,  // US 10Y — tasa de interés; alta = condiciones restrictivas = risk-off
  mxn:   0.10,  // MXN Vol — volatilidad realizada del USD/MXN
};

const RANGES = {
  vix:   { calm: 12,  panic: 35  },
  move:  { calm: 70,  panic: 140 },
  dxy:   { weak: 99,  strong: 108 },
  mxn:   { calm: 7,   panic: 16  },
  us10y: { calm: 3.5, panic: 5.0 }, // >5% = estrés de tasas; <3.5% = acomodativo
};

const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

function scoreFearGauge(value, calm, panic) {
  return clamp(100 - ((value - calm) / (panic - calm)) * 100);
}

function scoreDollar(value, weak, strong) {
  return clamp(100 - ((value - weak) / (strong - weak)) * 100);
}

export function computeRiskIndex({ vix, move, dxy, mxnVol, us10y }) {
  const comp = {
    vix:   scoreFearGauge(vix,   RANGES.vix.calm,   RANGES.vix.panic),
    move:  scoreFearGauge(move,  RANGES.move.calm,  RANGES.move.panic),
    dxy:   scoreDollar(dxy,      RANGES.dxy.weak,   RANGES.dxy.strong),
    mxn:   scoreFearGauge(mxnVol,RANGES.mxn.calm,   RANGES.mxn.panic),
    us10y: scoreFearGauge(us10y ?? 4.3, RANGES.us10y.calm, RANGES.us10y.panic),
  };

  const score = Math.round(
    comp.vix   * WEIGHTS.vix   +
    comp.dxy   * WEIGHTS.dxy   +
    comp.move  * WEIGHTS.move  +
    comp.us10y * WEIGHTS.us10y +
    comp.mxn   * WEIGHTS.mxn
  );

  return { score: clamp(score), components: comp };
}

export function riskLabel(score) {
  if (score >= 75) return { es: "Risk-on fuerte",       en: "Strong risk-on",          color: "#0F6E56" };
  if (score >= 58) return { es: "Risk-on moderado",     en: "Moderate risk-on",        color: "#639922" };
  if (score >= 42) return { es: "Neutral",              en: "Neutral",                 color: "#BA7517" };
  if (score >= 25) return { es: "Neutral, con cautela", en: "Neutral, leaning cautious", color: "#D85A30" };
  return               { es: "Risk-off / miedo",     en: "Risk-off / fear",         color: "#A32D2D" };
}

export function componentMeta(values) {
  const { vix, move, dxy, mxnVol, us10y = 4.3 } = values;
  return {
    vix: {
      label: "VIX", sub: { es: "miedo S&P", en: "S&P fear" },
      value: vix.toFixed(1),
      detail: {
        es: `VIX ${vix.toFixed(1)} — Mide la turbulencia esperada en el S&P 500 los próximos 30 días. Bajo = calma = empuja al índice hacia risk-on. Zona de pánico: >35.`,
        en: `VIX ${vix.toFixed(1)} — Expected S&P 500 turbulence over 30 days. Low = calm = pushes the index toward risk-on. Panic zone: >35.`,
      },
    },
    move: {
      label: "MOVE", sub: { es: "bonos", en: "bonds" },
      value: Math.round(move).toString(),
      detail: {
        es: `MOVE ${Math.round(move)} — El "VIX de los bonos": volatilidad esperada en la deuda del Tesoro de EE.UU. Cuando sube, los mercados de crédito se ponen nerviosos.`,
        en: `MOVE ${Math.round(move)} — The bond market's VIX: expected volatility in US Treasuries. When it rises, credit markets get nervous.`,
      },
    },
    dxy: {
      label: "DXY", sub: { es: "dólar", en: "dollar" },
      value: dxy.toFixed(1),
      detail: {
        es: `DXY ${dxy.toFixed(1)} — Fortaleza del dólar contra 6 divisas principales. Dólar fuerte = dinero buscando refugio = risk-off. Zona de alerta: >108.`,
        en: `DXY ${dxy.toFixed(1)} — Dollar strength vs 6 major currencies. Strong dollar = money seeking safety = risk-off. Alert zone: >108.`,
      },
    },
    us10y: {
      label: "US 10Y", sub: { es: "tasas", en: "rates" },
      value: (us10y).toFixed(2) + "%",
      detail: {
        es: `Bono del Tesoro a 10 años: ${us10y.toFixed(2)}%. Tasas altas encarecen el crédito y presionan al peso vía carry trade. Zona de estrés: >5.0%.`,
        en: `10-Year Treasury yield: ${us10y.toFixed(2)}%. High rates raise borrowing costs and pressure the peso via carry trade. Stress zone: >5.0%.`,
      },
    },
    mxn: {
      label: "MXN vol", sub: { es: "", en: "" },
      value: mxnVol.toFixed(1) + "%",
      detail: {
        es: `Volatilidad realizada del USD/MXN: ${mxnVol.toFixed(1)}%. Mide cuánto se ha movido el tipo de cambio en los últimos 30 días. Alta vol = incertidumbre sobre el peso.`,
        en: `Realized USD/MXN volatility: ${mxnVol.toFixed(1)}%. Measures how much the exchange rate moved over the last 30 days. High vol = peso uncertainty.`,
      },
    },
  };
}

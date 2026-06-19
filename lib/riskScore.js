// lib/riskScore.js
// ÚNICA fuente de verdad del Risk On score (0-100, 100 = más apetito por riesgo).
// Client-safe (sin imports de servidor): lo usan tanto la landing en vivo
// (components/RiskGauge.jsx) como el view diario (lib/dailyView.js) — así el
// número de la portada y el de la nota SIEMPRE coinciden.
//
// Cada señal mapea a un sub-score 0-100 vía una rampa lineal entre `at0` (→0) y
// `at100` (→100). Editar pesos/umbrales aquí los cambia en TODO el sitio.

const pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`);
const num = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));

export const SIGNALS = [
  {
    key: "vix", label: "VIX", sub: { es: "vol acciones", en: "equity vol" },
    w: 20, at0: 28, at100: 12,
    get: (d) => d.market?.vix,
    value: (d) => num(d.market?.vix, 2), range: "12–28",
    detail: {
      es: "VIX — volatilidad esperada del S&P 500 a 30 días (el índice del miedo). Bajo = calma = empuja a risk-on. 12 = pleno apetito, 28 = aversión.",
      en: "VIX — 30-day expected S&P 500 volatility (the fear gauge). Low = calm = pushes risk-on. 12 = full appetite, 28 = risk-off.",
    },
  },
  {
    key: "mxn", label: "USD/MXN", sub: { es: "dirección peso", en: "peso direction" },
    w: 18, at0: 0.5, at100: -0.5,
    get: (d) => d.market?.usdmxnChg,
    value: (d) => pct(d.market?.usdmxnChg), range: "+0.5%→−0.5%",
    detail: {
      es: "Cambio diario del USD/MXN. Peso apreciándose (USD/MXN baja) = risk-on. −0.5% = pleno, +0.5% = aversión.",
      en: "Daily USD/MXN change. Peso strengthening (USD/MXN down) = risk-on. −0.5% = full, +0.5% = risk-off.",
    },
  },
  {
    key: "spx", label: "S&P 500", sub: { es: "acciones EE.UU.", en: "US equities" },
    w: 15, at0: -1, at100: 1,
    // Usa futuros (ES=F) cuando están disponibles: cotizan ~24h, así a las 7am CST
    // (mercado cash cerrado) la señal refleja el movimiento premarket real y no el
    // cierre de ayer. Cae a ^GSPC cash si no hay futuros.
    get: (d) => d.market?.spxFutChg ?? d.market?.spxChg,
    value: (d) => pct(d.market?.spxFutChg ?? d.market?.spxChg), range: "−1%→+1%",
    detail: {
      es: "Cambio del S&P 500 (futuros ES=F en premarket). Sube = apetito por riesgo. +1% = pleno, −1% = aversión.",
      en: "S&P 500 change (ES=F futures pre-open). Up = risk appetite. +1% = full, −1% = risk-off.",
    },
  },
  {
    key: "carry", label: "Carry", sub: { es: "Banxico − Fed", en: "Banxico − Fed" },
    w: 10, at0: 0, at100: 7,
    get: (d) => (d.rates?.banxico != null && d.rates?.fed != null) ? d.rates.banxico - d.rates.fed : null,
    value: (d) => (d.rates?.banxico != null && d.rates?.fed != null) ? `${num(d.rates.banxico - d.rates.fed, 2)} pp` : "—",
    range: "0→7 pp",
    detail: {
      es: "Diferencial de tasas Banxico − Fed. Más alto = carry más atractivo = soporte para el peso. 0 pp = nulo, 7 pp = pleno.",
      en: "Banxico − Fed rate differential. Higher = more attractive carry = peso support. 0 pp = none, 7 pp = full.",
    },
  },
  {
    key: "mxnvol", label: "MXN vol", sub: { es: "vol realizada", en: "realized vol" },
    w: 10, at0: 14, at100: 6,
    get: (d) => d.market?.mxnVol,
    value: (d) => (d.market?.mxnVol != null ? `${num(d.market.mxnVol, 1)}%` : "—"), range: "6–14%",
    detail: {
      es: "Volatilidad realizada del USD/MXN (30 días). Baja = peso tranquilo = risk-on. 6% = pleno, 14% = aversión.",
      en: "Realized USD/MXN volatility (30d). Low = calm peso = risk-on. 6% = full, 14% = risk-off.",
    },
  },
  {
    key: "move", label: "MOVE", sub: { es: "vol bonos", en: "bond vol" },
    w: 8, at0: 140, at100: 60,
    get: (d) => d.market?.move,
    value: (d) => num(d.market?.move, 0), range: "60–140",
    detail: {
      es: "El 'VIX de los bonos': volatilidad esperada en el Tesoro de EE.UU. Baja = crédito tranquilo = risk-on. 60 = pleno, 140 = aversión.",
      en: "The bond market's VIX: expected US Treasury volatility. Low = calm credit = risk-on. 60 = full, 140 = risk-off.",
    },
  },
  {
    key: "btc", label: "Bitcoin", sub: { es: "apetito riesgo", en: "risk appetite" },
    w: 7, at0: -3, at100: 3,
    get: (d) => d.market?.btcChg,
    value: (d) => pct(d.market?.btcChg), range: "−3%→+3%",
    detail: {
      es: "Cambio diario de Bitcoin, proxy del apetito especulativo. Sube = risk-on. +3% = pleno, −3% = aversión.",
      en: "Daily Bitcoin change, a proxy for speculative appetite. Up = risk-on. +3% = full, −3% = risk-off.",
    },
  },
  {
    key: "curve", label: "Curva 2s10s", sub: { es: "pendiente", en: "slope" },
    w: 7, at0: -0.5, at100: 1.0,
    get: (d) => d.curve?.spread2s10s,
    value: (d) => num(d.curve?.spread2s10s, 2), range: "−0.5→+1.0",
    detail: {
      es: "Pendiente de la curva (10Y − 2Y). Empinada = expansión sana = risk-on. Invertida (<0) = señal de recesión = aversión.",
      en: "Yield curve slope (10Y − 2Y). Steep = healthy expansion = risk-on. Inverted (<0) = recession signal = risk-off.",
    },
  },
  {
    key: "gold", label: "Oro", sub: { es: "cobertura (inv.)", en: "hedge (inv.)" },
    w: 5, at0: 1, at100: -1,
    get: (d) => d.market?.goldChg,
    value: (d) => pct(d.market?.goldChg), range: "+1%→−1%",
    detail: {
      es: "Cambio diario del oro (señal inversa). Oro subiendo = compra de cobertura = aversión. −1% = risk-on, +1% = risk-off.",
      en: "Daily gold change (inverse signal). Gold rising = hedge buying = risk-off. −1% = risk-on, +1% = risk-off.",
    },
  },
];

function lin(v, at0, at100) {
  if (v == null || isNaN(v)) return null;
  const t = (v - at0) / (at100 - at0);
  return Math.max(0, Math.min(100, t * 100));
}

export function computeRiskScore(d) {
  let sum = 0, wsum = 0;
  const components = {};
  const breakdown = [];
  for (const s of SIGNALS) {
    const sub = lin(s.get(d), s.at0, s.at100);
    if (sub == null) continue;
    const r = Math.round(sub);
    components[s.key] = r;
    sum += sub * s.w;
    wsum += s.w;
    breakdown.push({ key: s.key, label: s.label, sub: r, w: s.w });
  }
  const score = wsum ? Math.round(sum / wsum) : 60;
  return { score, components, breakdown };
}

const BANDS = [
  { max: 25,  key: "RISK-OFF",     es: "Risk-off",     en: "Risk-off",     color: "#5B7FB9" },
  { max: 50,  key: "DEFENSIVE",    es: "Defensivo",    en: "Defensive",    color: "#D9A227" },
  { max: 75,  key: "CONSTRUCTIVE", es: "Constructivo", en: "Constructive", color: "#2FB89A" },
  { max: 100, key: "RISK-ON",      es: "Risk-on",      en: "Risk-on",      color: "#19C39B" },
];

export function riskBand(score) {
  return BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
}

// Etiqueta canónica en mayúsculas (RISK-OFF / DEFENSIVE / CONSTRUCTIVE / RISK-ON)
export function riskState(score) {
  return riskBand(score).key;
}

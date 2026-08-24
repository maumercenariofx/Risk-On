// app/metodologia/page.jsx
// La metodología del índice, con URL propia.
//
// Hasta el 2026-08-24 los 9 pesos vivían dentro de DOS acordeones anidados en
// RiskGauge.jsx ("Componentes del índice" → "¿Cómo se calcula este índice?"),
// así que nadie llegaba: no había URL que compartir, que indexar, ni que
// mandarle a un periodista. Y /suscribete lleva prometiendo "metodología
// pública" desde el principio (auditoría 2026-08-21).
import { SIGNALS, BANDS } from "../../lib/riskScore";
import MetodologiaView from "../../components/MetodologiaView";

export const metadata = {
  title: "Metodología del Índice Risk On · Risk On",
  description:
    "Cómo se calcula el Índice Risk On: las 9 señales, sus pesos, la normalización con z robusto y los cortes de banda. Publicada por adelantado y sin ediciones retroactivas.",
  alternates: { canonical: "/metodologia" },
  openGraph: {
    title: "Metodología del Índice Risk On",
    description: "Las 9 señales, sus pesos y cómo se normalizan. Con lo que el backtest sí sostiene y lo que no.",
    url: "https://riskon.lat/metodologia",
    type: "article",
  },
};

export default function MetodologiaPage() {
  // Se leen del MÓDULO, no se transcriben: si alguien cambia un peso en
  // lib/riskScore.js, esta página cambia con él. Una tabla copiada a mano es
  // exactamente cómo el README acabó documentando un índice que no existía.
  const signals = SIGNALS.map((s) => ({
    key: s.key, label: s.label, w: s.w, range: s.range ?? null,
    sub: s.sub ?? null, detail: s.detail ?? null,
  }));
  const bands = BANDS.map((b) => ({ key: b.key, max: b.max, color: b.color }));

  return <MetodologiaView signals={signals} bands={bands} />;
}

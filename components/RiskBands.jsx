"use client";
// components/RiskBands.jsx
// Explica las 4 bandas del índice Risk On (qué significa cada estado del
// medidor) + nota de que es un indicador propietario. Se usa en la landing
// y en la página del view diario (/archive/[slug]); el correo enlaza aquí
// vía el ancla #bandas.
import { useLang, T } from "./Lang";
import { BANDS } from "../lib/riskScore";

// Significado de cada banda (texto llano, voz de marca). Indexado por `key`.
const MEANING = {
  "RISK-OFF": {
    es: "Miedo al mando: el dinero corre a refugiarse (dólar, oro, bonos). Suele coincidir con un peso débil y mercados a la baja.",
    en: "Fear in control: money runs to safety (dollar, gold, Treasuries). Usually a weak peso and markets selling off.",
  },
  "DEFENSIVE": {
    es: "Cautela: el mercado no entra en pánico pero pisa el freno. Conviene proteger más que arriesgar.",
    en: "Caution: not panic, but the market eases off the gas. A time to protect more than to reach for risk.",
  },
  "CONSTRUCTIVE": {
    es: "Apetito sano: hay disposición a tomar riesgo de forma selectiva. El peso y los activos de riesgo encuentran soporte.",
    en: "Healthy appetite: a selective willingness to take risk. The peso and risk assets find support.",
  },
  "RISK-ON": {
    es: "Apetito pleno: el mercado compra riesgo con confianza. Entorno favorable para el peso y los emergentes.",
    en: "Full appetite: the market buys risk with confidence. A favorable backdrop for the peso and emerging markets.",
  },
};

export default function RiskBands() {
  const { lang } = useLang();
  return (
    <div
      id="bandas"
      style={{
        scrollMarginTop: 80,
        background: "rgba(11,11,12,0.92)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        border: "1px solid #1E1E20", borderRadius: 12, padding: "18px 18px",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 6 }}>
        &mdash; <T es="Qué significa el índice" en="What the index means" />
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: "#8A8A8E", marginBottom: 16 }}>
        <T
          es="El índice Risk On resume en un número de 0 a 100 el apetito global por riesgo, con foco en México. Según dónde caiga, el día se clasifica en una de estas cuatro bandas:"
          en="The Risk On index sums up global risk appetite — with a Mexico focus — in a single 0–100 number. Depending on where it lands, the day falls into one of these four bands:"
        />
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BANDS.map((b, i) => {
          const lo = i === 0 ? 0 : BANDS[i - 1].max + 1;
          const m = MEANING[b.key];
          return (
            <div key={b.key} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                flexShrink: 0, width: 56, textAlign: "center",
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                color: b.color, border: `1px solid ${b.color}55`, background: `${b.color}14`,
                borderRadius: 6, padding: "4px 0", lineHeight: 1.2,
              }}>
                {lo}–{b.max}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: b.color,
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 2,
                }}>
                  {lang === "en" ? b.en : b.es}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "#A9A9AD" }}>
                  {lang === "en" ? m.en : m.es}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, lineHeight: 1.6, color: "#8A8A8E", marginTop: 16, fontStyle: "italic" }}>
        <T
          es="El índice Risk On es un indicador propietario, diseñado y mantenido por Mauricio Mercenario. Es una herramienta de lectura de mercado, no una recomendación de inversión."
          en="The Risk On index is a proprietary indicator, designed and maintained by Mauricio Mercenario. It is a market-reading tool, not investment advice."
        />
      </p>
    </div>
  );
}

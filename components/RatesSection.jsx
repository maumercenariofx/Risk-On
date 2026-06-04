"use client";
import { T } from "./Lang";
import { RATES } from "../data/rates";

export default function RatesSection() {
  const spread = (RATES.banxico - RATES.fed).toFixed(2);

  const items = [
    { label: "TIIE 28d",                              value: RATES.tiie28.toFixed(2) + "%" },
    { label: "Banxico",                               value: RATES.banxico.toFixed(2) + "%" },
    { label: "Fed Funds",                             value: RATES.fed.toFixed(2)    + "%" },
    { label_es: "Diferencial MX–US", label_en: "MX–US Spread", value: "+" + spread + "%", highlight: true },
  ];

  return (
    <section className="reveal" style={{ animationDelay: "0.25s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", marginBottom: 12 }}>
        &mdash; <T es="Tasas de referencia" en="Reference rates" />
      </div>
      <div
        className="card-glass"
        style={{ background: "rgba(11,11,12,0.85)", border: "1px solid #1E1E20", borderRadius: 12, padding: "18px 20px" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 20px", marginBottom: 16 }}>
          {items.map((item, i) => (
            <div key={i}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 5 }}>
                {item.label_es ? <T es={item.label_es} en={item.label_en} /> : item.label}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, lineHeight: 1,
                color: item.highlight ? "#0F8A5F" : "#F5F5F2",
              }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #141416", paddingTop: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#3A3A3E", marginBottom: 6 }}>
            <T es="¿Qué es el carry?" en="What is carry?" />
          </div>
          <p style={{ fontSize: 12, color: "#5A5A60", lineHeight: 1.75 }}>
            <T
              es={`El diferencial de +${spread}% (Banxico vs Fed) hace que el peso sea atractivo para el carry trade: inversionistas piden prestado en dólares (tasa baja) e invierten en pesos (tasa alta), ganando la diferencia. Eso sostiene la demanda de pesos — hasta que el riesgo sube y todos salen corriendo al mismo tiempo.`}
              en={`The +${spread}% spread (Banxico vs Fed) makes the peso attractive for carry trades: investors borrow dollars at low rates and place that money in pesos at high rates, pocketing the difference. That supports peso demand — until risk spikes and everyone exits at once.`}
            />
          </p>
        </div>
      </div>
    </section>
  );
}

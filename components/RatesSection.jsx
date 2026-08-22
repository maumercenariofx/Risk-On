"use client";
import { useEffect, useState } from "react";
import { T } from "./Lang";
import SourceTag from "./SourceTag";

// Veracidad: sin números inventados. Mientras carga (o si una fuente falla)
// se muestra "—" — nunca un valor viejo hardcodeado disfrazado de actual.
const fmt = (v, suffix = "%") => (v == null ? "—" : v.toFixed(2) + suffix);

export default function RatesSection() {
  const [rates, setRates] = useState(null);

  useEffect(() => {
    fetch("/api/rates")
      .then((r) => r.json())
      .then(setRates)
      .catch(() => setRates({ error: true }));
  }, []);

  const r = rates ?? {};
  const spread = r.banxico != null && r.fed != null ? (r.banxico - r.fed).toFixed(2) : null;

  const items = [
    { label: "TIIE 28d",  value: fmt(r.tiie28) },
    { label: "Banxico",   value: fmt(r.banxico) },
    { label: "Fed Funds", value: r.fedRange ?? (r.fed != null ? r.fed.toFixed(3) + "%" : "—") },
    { label_es: "Diferencial MX–US", label_en: "MX–US Spread",
      value: spread != null ? `+${spread}%` : "—", highlight: spread != null },
    // FIX oficial de Banxico: el tipo de cambio para liquidar obligaciones en
    // México (se publica una vez al día hábil) — contraste institucional del
    // spot de mercado que corre en el resto del sitio.
    { label_es: "FIX Banxico", label_en: "Banxico FIX",
      value: r.fix != null ? r.fix.toFixed(4) : "—", sub: r.fixDate ?? null },
  ];

  return (
    <section className="reveal" style={{ animationDelay: "0.25s" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 12 }}>
        &mdash; <T es="Tasas de referencia" en="Reference rates" />
      </div>
      <div
        className="card-glass"
        style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "18px 20px" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "16px 20px", marginBottom: 16 }}>
          {items.map((item, i) => (
            <div key={i}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 5 }}>
                {item.label_es ? <T es={item.label_es} en={item.label_en} /> : item.label}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color: item.highlight ? "#0F8A5F" : rates && !rates.error ? "#F5F5F2" : "#3A3A3E",
                transition: "color .4s",
              }}>
                {item.value}
              </div>
              {item.sub && (
                <div style={{ fontSize: 9.5, color: "#8A8A8E", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                  {item.sub}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #141416", paddingTop: 14 }}>
          {spread != null && (
            <>
              <div style={{ fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", color: "#8A8A8E", marginBottom: 6 }}>
                <T es="¿Qué es el carry?" en="What is carry?" />
              </div>
              <p style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.75, marginBottom: 10 }}>
                <T
                  es={`El diferencial de +${spread}% (Banxico vs Fed) hace que el peso sea atractivo para el carry trade: inversionistas piden prestado en dólares (tasa baja) e invierten en pesos (tasa alta), ganando la diferencia. Eso sostiene la demanda de pesos — hasta que el riesgo sube y todos salen corriendo al mismo tiempo.`}
                  en={`The +${spread}% spread (Banxico vs Fed) makes the peso attractive for carry trades: investors borrow dollars at low rates and place that money in pesos at high rates, pocketing the difference. That supports peso demand — until risk spikes and everyone exits at once.`}
                />
              </p>
            </>
          )}
          <SourceTag source="Banxico SIE · FRED" asOf={r.asOf} />
        </div>
      </div>
    </section>
  );
}

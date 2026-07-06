"use client";
// components/WhatHappenedNext.jsx
// Evidencia del track record: retorno promedio de USD/MXN y S&P en los 5/10
// días hábiles posteriores a cada banda del índice. Datos vienen ya calculados
// del server (lib/forwardReturns). Honestidad primero: n visible por fila y
// disclaimer de muestra chica.
import { T, useLang } from "./Lang";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";

const fmtPct = (v) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

// Para USD/MXN: negativo = peso se apreció (verde); para S&P: positivo = verde.
const pctColor = (v, invert = false) => {
  if (v == null) return "#4B5563";
  const good = invert ? v < 0 : v > 0;
  return good ? "#0F8A5F" : "#C0392B";
};

export default function WhatHappenedNext({ data }) {
  const { lang } = useLang();
  if (!data?.rows?.length) return null;

  return (
    <div style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ ...sectionLabel, marginBottom: 4 }}>
        <T es="¿Qué pasó después?" en="What happened next?" />
      </div>
      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "0 0 14px 0" }}>
        <T
          es="Retorno promedio del mercado en los 5 y 10 días hábiles siguientes a cada banda del índice, sobre los views realmente publicados. En USD/MXN, negativo = el peso se apreció."
          en="Average market return over the 5 and 10 trading days after each index band, across the views actually published. For USD/MXN, negative = the peso appreciated."
        />
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {[
                { es: "Banda", en: "Band" }, { es: "Views", en: "Views" },
                { es: "USD/MXN +5d", en: "USD/MXN +5d" }, { es: "USD/MXN +10d", en: "USD/MXN +10d" },
                { es: "S&P +5d", en: "S&P +5d" }, { es: "S&P +10d", en: "S&P +10d" },
              ].map((h, i) => (
                <th key={i} style={{
                  textAlign: i === 0 ? "left" : "right", padding: "6px 8px 10px 0",
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "#4B5563", fontWeight: 400,
                }}>
                  {lang === "en" ? h.en : h.es}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.band} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "10px 8px 10px 0" }}>
                  <span style={{
                    fontSize: 8, letterSpacing: 2, fontFamily: "var(--font-mono)",
                    color: r.color, border: `1px solid ${r.color}44`,
                    borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
                  }}>
                    {r.band}
                  </span>
                </td>
                <td style={{ textAlign: "right", padding: "10px 8px 10px 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF" }}>
                  {r.n}
                </td>
                {[["mxn5", true], ["mxn10", true], ["spx5", false], ["spx10", false]].map(([k, inv]) => (
                  <td key={k} style={{
                    textAlign: "right", padding: "10px 8px 10px 0",
                    fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500,
                    fontVariantNumeric: "tabular-nums", color: pctColor(r[k], inv),
                  }}>
                    {fmtPct(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 10.5, color: "#5A5A60", lineHeight: 1.6, margin: "12px 0 0 0" }}>
        <T
          es={`Muestra: ${data.usable} views con al menos 5 días de historia posterior. La muestra aún es chica y crece un view por día hábil — esto es evidencia en construcción, no una promesa de retornos. No es recomendación de inversión.`}
          en={`Sample: ${data.usable} views with at least 5 days of subsequent history. The sample is still small and grows by one view per trading day — this is evidence under construction, not a promise of returns. Not investment advice.`}
        />
      </p>
    </div>
  );
}

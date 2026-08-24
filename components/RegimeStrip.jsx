"use client";
// components/RegimeStrip.jsx
// Heat-strip del régimen: una celda por view (≈30 días calendario), coloreada
// con la banda de su score — la historia del régimen de un vistazo, estilo
// contributions de GitHub. Cada celda linkea a su view y el tooltip [data-tip]
// dice fecha · score · banda. Vive bajo el termómetro de la landing.
import { useLang, T } from "./Lang";
import { riskBand } from "../lib/riskScore";

export default function RegimeStrip({ history }) {
  const { lang } = useLang();
  if (!history || history.length < 5) return null;

  const fmt = (slug) => {
    const d = new Date(slug + "T12:00:00Z");
    return d.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  };

  return (
    <div style={{ marginTop: 14 }}>
      {/* alignItems flex-end: las celdas crecen desde una línea base común,
          así el perfil de la tira se lee como un gráfico y no como un mosaico. */}
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
        {history.map((h) => {
          const b = riskBand(h.score);
          return (
            <a
              key={h.slug}
              href={`/archive/${h.slug}`}
              className="regime-cell"
              data-tip={`${fmt(h.slug)} · ${h.score} ${b.key}`}
              aria-label={`${fmt(h.slug)}: ${h.score} ${b.key}`}
              style={{
                flex: 1,
                // La ALTURA codifica el score además del color: quien no
                // distingue CONSTRUCTIVE de RISK-ON (ΔE 4.4 en deuteranopía)
                // sigue leyendo la tira por su perfil (auditoría 2026-08-21).
                height: 6 + Math.round((Math.max(0, Math.min(100, h.score)) / 100) * 14),
                alignSelf: "flex-end",
                minWidth: 6,
                borderRadius: 3,
                background: b.color,
                borderBottom: "none", // anula el dotted de [data-tip]
                cursor: "pointer",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: 1.5,
          color: "#8A8A8E",
          textTransform: "uppercase",
        }}
      >
        <span>
          <T es="Régimen · un view por celda" en="Regime · one view per cell" />
        </span>
        <span>
          <T es="hoy →" en="today →" />
        </span>
      </div>
    </div>
  );
}

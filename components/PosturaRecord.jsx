"use client";
// components/PosturaRecord.jsx
// Marcador público de posturas: cada view publica un sesgo (pro-peso / neutral
// / pro-dólar) con su condición de invalidación — aquí se cruza contra lo que
// el USD/MXN hizo de verdad en los 5 días hábiles siguientes. Nada se edita
// después: acierto, fallo o en curso, a la vista. La regla de evaluación se
// muestra completa (transparencia > marketing).
import { useLang, T } from "./Lang";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";

const BIAS = {
  "pro-peso":  { es: "PRO-PESO",  en: "PRO-PESO",  color: "#2FB89A" },
  "neutral":   { es: "NEUTRAL",   en: "NEUTRAL",   color: "#9CA3AF" },
  "pro-dolar": { es: "PRO-DÓLAR", en: "PRO-USD",   color: "#CE5555" },
};

function fmtDate(slug, lang) {
  return new Date(`${slug}T12:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-US" : "es-MX",
    { day: "numeric", month: "short", timeZone: "UTC" }
  );
}

export default function PosturaRecord({ data }) {
  const { lang } = useLang();
  if (!data?.rows?.length) return null;

  const pctHit = data.resolved ? Math.round((100 * data.hits) / data.resolved) : null;

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={sectionLabel}>
          <T es="Marcador de posturas" en="Stance scoreboard" />
        </div>
        {pctHit != null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#F5F5F2" }}>
            {data.hits}/{data.resolved} <T es="aciertos" en="hits" /> ·{" "}
            <span style={{ color: pctHit >= 60 ? "#2FB89A" : pctHit >= 40 ? "#D9A227" : "#CE5555", fontWeight: 700 }}>
              {pctHit}%
            </span>
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Cada mañana el view publica una postura falsable. Aquí queda contra lo que el USD/MXN hizo en los 5 días hábiles siguientes — sin ediciones retroactivas."
          en="Every morning the view publishes a falsifiable stance. Here it stands against what USD/MXN actually did over the next 5 trading days — no retroactive edits."
        />
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <tbody>
            {data.rows.map((r) => {
              const b = BIAS[r.bias] ?? BIAS.neutral;
              return (
                <tr key={r.slug} className="row-hover" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "10px 10px 10px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                    <a href={`/archive/${r.slug}`} className="transition-colors hover:text-bone">{fmtDate(r.slug, lang)}</a>
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontSize: 9.5, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
                      color: b.color, border: `1px solid ${b.color}44`,
                      borderRadius: 20, padding: "3px 9px",
                    }}>{lang === "en" ? b.en : b.es}</span>
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontVariantNumeric: "tabular-nums", color: r.mxn5 == null ? "#4A4A50" : r.mxn5 < 0 ? "#2FB89A" : "#CE5555", whiteSpace: "nowrap" }}>
                    {r.mxn5 == null ? "—" : `${r.mxn5 > 0 ? "+" : ""}${r.mxn5.toFixed(2)}%`}
                  </td>
                  <td style={{ padding: "10px 0 10px 0", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {r.verdict == null ? (
                      <span style={{ color: "#4A4A50" }}>⏳ <T es="en curso" en="pending" /></span>
                    ) : r.verdict ? (
                      <span style={{ color: "#2FB89A" }}>✓ <T es="acierto" en="hit" /></span>
                    ) : (
                      <span style={{ color: "#CE5555" }}>✗ <T es="fallo" en="miss" /></span>
                    )}
                  </td>
                  <td className="hidden md:table-cell" style={{ padding: "10px 0 10px 12px", fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>
                    {r.condicion?.length > 90 ? r.condicion.slice(0, 87) + "…" : r.condicion}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11.5, color: "#6A6A70", lineHeight: 1.6, margin: "12px 0 0" }}>
        <T
          es="Regla de evaluación (fija): pro-peso acierta si el USD/MXN cerró más abajo 5 días hábiles después; pro-dólar si cerró más arriba; neutral si el movimiento fue ≤0.35% en cualquier dirección. Las posturas se publican desde el 10-jul-2026; la muestra crece un punto por día hábil. Verde = peso más fuerte."
          en="Evaluation rule (fixed): pro-peso hits if USD/MXN closed lower 5 trading days later; pro-USD if it closed higher; neutral if the move was ≤0.35% either way. Stances are published since Jul 10, 2026; the sample grows one point per trading day. Green = stronger peso."
        />
      </p>
    </div>
  );
}

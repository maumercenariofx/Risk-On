"use client";
// components/BandEvidence.jsx
// La evidencia de 5 años del índice: qué hizo el USD/MXN después de cada banda.
// Cifras ESTÁTICAS del backtest 2021-11 → 2026-07 (~1,180 días hábiles),
// reproducible con scripts/research-posturas.mjs. El hallazgo clave es
// CONTRARIAN: los extremos revierten — RISK-OFF ha sido históricamente zona de
// rebote del peso, no de huida. Se muestra como estadística, jamás como promesa.
import { useLang, T } from "./Lang";
import { BANDS } from "../lib/riskScore";
import { cardStyle, sectionLabel } from "../lib/chartHelpers";

// Backtest 5y (actualizado 2026-07-30 con carry y curva HISTÓRICOS reales —
// antes constantes; reproducible con scripts/research-posturas.mjs): días por
// banda, retorno USD/MXN promedio a 5/10 días hábiles y % de ventanas de 5d en
// que el peso se apreció. Base: 57%.
const EVIDENCE = [
  { key: "RISK-OFF",     n: 38,  fwd5: -0.76, fwd10: -1.58, hit: 76 },
  { key: "DEFENSIVE",    n: 462, fwd5: -0.04, fwd10: -0.15, hit: 55 },
  { key: "CONSTRUCTIVE", n: 658, fwd5: -0.03, fwd10: -0.02, hit: 57 },
  { key: "RISK-ON",      n: 22,  fwd5: +0.05, fwd10: +0.13, hit: 50 },
];
const BASE_HIT = 57;

const pct = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function BandEvidence() {
  const { lang } = useLang();
  const color = (key) => BANDS.find((b) => b.key === key)?.color ?? "#9CA3AF";

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ ...sectionLabel, marginBottom: 6 }}>
        <T es="La evidencia de 5 años" en="Five years of evidence" />
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Qué hizo el USD/MXN después de cada banda del índice, en ~1,180 días hábiles (nov 2021 → jul 2026), con carry y curva históricos reales. La lectura sorprende: los extremos son señales contrarias."
          en="What USD/MXN did after each index band, across ~1,180 trading days (Nov 2021 → Jul 2026), with real historical carry and curve. The surprising read: the extremes are contrarian signals."
        />
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 430 }}>
          <thead>
            <tr>
              {[
                lang === "en" ? "Band" : "Banda",
                lang === "en" ? "Days" : "Días",
                "USD/MXN +5d",
                "USD/MXN +10d",
                lang === "en" ? "Peso gained (5d)" : "Peso ganó (5d)",
              ].map((h, i) => (
                <th key={h} style={{
                  ...sectionLabel, fontSize: 9, padding: "0 8px 8px 0",
                  textAlign: i === 0 ? "left" : "right", fontWeight: 400,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVIDENCE.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "9px 8px 9px 0" }}>
                  <span style={{
                    fontSize: 9.5, letterSpacing: 2, fontFamily: "var(--font-mono)",
                    color: color(r.key), border: `1px solid ${color(r.key)}44`,
                    borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
                  }}>{r.key}</span>
                </td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF" }}>{r.n}</td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.fwd5 < -0.05 ? "#2FB89A" : r.fwd5 > 0.05 ? "#CE5555" : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{pct(r.fwd5)}</td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.fwd10 < -0.05 ? "#2FB89A" : r.fwd10 > 0.05 ? "#CE5555" : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{pct(r.fwd10)}</td>
                <td style={{ padding: "9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.hit >= 70 ? "#2FB89A" : "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>
                  {r.hit}%{r.key === "RISK-OFF" ? " ★" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "12px 0 0" }}>
        <T
          es={`★ El dato que importa: tras un día en RISK-OFF, el peso se apreció en los 5 días siguientes el 76% de las veces (base histórica: ${BASE_HIT}%). El pánico extremo ha sido zona de rebote, no de huida. El índice describe el régimen de HOY (nowcast) — no es promesa de retornos ni recomendación de inversión. Verde = peso más fuerte (USD/MXN a la baja).`}
          en={`★ The stat that matters: after a RISK-OFF day, the peso appreciated over the next 5 days 76% of the time (historical base: ${BASE_HIT}%). Extreme panic has been a rebound zone, not an exit. The index describes TODAY's regime (a nowcast) — it is not a promise of returns or investment advice. Green = stronger peso (USD/MXN falling).`}
        />
      </p>
    </div>
  );
}

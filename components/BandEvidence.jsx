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
//
// EN REVISIÓN (2026-08-21). scripts/research-posturas.mjs etiqueta las barras
// con .toISOString() pelón, sin aplicar meta.gmtoffset. Yahoo estampa MXN=X en
// Europe/London (abre 23:00 UTC), así que TODA la serie del peso queda corrida
// un día contra la rejilla de ^GSPC. Es exactamente el bug que lib/forwardReturns.js
// corrigió el 2026-07-31 (ver su comentario) y que nunca se propagó a los
// scripts de backtest, escritos el día anterior.
//
// Con el gmtoffset aplicado y entrada al cierre del mismo día, la fila RISK-OFF
// pasa de 76% a 58.3% (n=36, IC95 [42.2, 72.9], p=0.20) — indistinguible de un
// volado Y de la base pro-peso. Un random-entry test de 20,000 simulaciones da
// p=0.51. Hasta re-correr el backtest sobre datos congelados y realineados, la
// fila se marca como en revisión y NO se presenta como hallazgo.
const EVIDENCE = [
  { key: "RISK-OFF",     n: 38,  fwd5: -0.76, fwd10: -1.58, hit: 76, revision: true },
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
        <T es="El backtest de 5 años" en="The five-year backtest" />
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="Qué hizo el USD/MXN después de cada banda del índice, en ~1,180 días hábiles (nov 2021 → jul 2026), con carry y curva históricos reales. Esto es un BACKTEST sobre datos pasados, no el marcador de las posturas publicadas — ese va más arriba y tiene su propia muestra, mucho más chica."
          en="What USD/MXN did after each index band, across ~1,180 trading days (Nov 2021 → Jul 2026), with real historical carry and curve. This is a BACKTEST over past data, not the published-stance scorecard — that one is above and has its own, much smaller sample."
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
                  ...sectionLabel, fontSize: 11, padding: "0 8px 8px 0",
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
                    fontSize: 11, letterSpacing: 2, fontFamily: "var(--font-mono)",
                    color: color(r.key), border: `1px solid ${color(r.key)}44`,
                    borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
                  }}>{r.key}</span>
                </td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9CA3AF" }}>{r.n}</td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.fwd5 < -0.05 ? "#2FB89A" : r.fwd5 > 0.05 ? "#CE5555" : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{pct(r.fwd5)}</td>
                <td style={{ padding: "9px 8px 9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.fwd10 < -0.05 ? "#2FB89A" : r.fwd10 > 0.05 ? "#CE5555" : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>{pct(r.fwd10)}</td>
                <td style={{ padding: "9px 0", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: r.revision ? "#8A8A8E" : "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>
                  {r.revision ? (
                    <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{r.hit}%</span>
                  ) : (
                    <>{r.hit}%</>
                  )}
                  {r.revision ? <span style={{ marginLeft: 6, fontSize: 11, letterSpacing: 1.5 }}>†</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "12px 0 0" }}>
        <T
          es={`† Retiramos el 76% de RISK-OFF. Una auditoría del 21-ago-2026 encontró que el script del backtest etiqueta la serie del peso sin corregir la zona horaria de la fuente, así que toda la muestra iba corrida una sesión. Con la corrección, esa cifra cae a 58.3% (n=36) y deja de ser distinguible de un volado — y de la base de ${BASE_HIT}%. Preferimos decirlo a dejarlo puesto. La fila vuelve cuando el backtest se re-corra sobre datos congelados y realineados.`}
          en={`† We've pulled the 76% RISK-OFF figure. An Aug 21, 2026 audit found the backtest script labels the peso series without correcting for the source's timezone, so the whole sample was off by one session. Corrected, that figure drops to 58.3% (n=36) and stops being distinguishable from a coin flip — or from the ${BASE_HIT}% base. We'd rather say so than leave it up. The row returns once the backtest is re-run on frozen, realigned data.`}
        />
      </p>
      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.65, margin: "10px 0 0" }}>
        <T
          es="Las demás filas se apoyan en muestras grandes, pero léelas con cuidado: las ventanas de 5 días se traslapan, así que el número efectivo de observaciones independientes es del orden de la quinta parte del que ves. El índice describe el régimen de HOY (nowcast) — no es promesa de retornos ni recomendación de inversión. Verde = peso más fuerte (USD/MXN a la baja)."
          en="The other rows rest on large samples, but read them carefully: the 5-day windows overlap, so the effective number of independent observations is on the order of a fifth of what you see. The index describes TODAY's regime (a nowcast) — it is not a promise of returns or investment advice. Green = stronger peso (USD/MXN falling)."
        />
      </p>
    </div>
  );
}

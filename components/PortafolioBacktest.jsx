"use client";
// components/PortafolioBacktest.jsx
// Backtest a 3 y 5 años del mismo portafolio de 1 MDP, pero con una regla
// MECÁNICA: seguir el índice (score ≥ 50 → pro-peso, < 50 → pro-dólar). Las
// posturas del redactor no se pueden reconstruir hacia atrás — combinan el
// score con noticias, 10Y, DXY y criterio del día — y la tarjeta lo dice.
// La regla pierde dinero en ambas ventanas; se publica igual (2026-09-21).
// Datos: public/data/portafolio-backtest.json, de
// `node scripts/validate/06-esperanza-portafolio.mjs --json` (serie congelada).
import { useState } from "react";
import { useLang, T } from "./Lang";
import { cardStyle, sectionLabel, GREEN, RED } from "../lib/chartHelpers";
import { EquityChart, Kpi, mxn } from "./PortafolioRecord";

const VENTANAS = [
  { k: "3y", es: "3 años", en: "3 years" },
  { k: "5y", es: "5 años", en: "5 years" },
];

export default function PortafolioBacktest({ data }) {
  const { lang } = useLang();
  const [k, setK] = useState("5y");
  const w = data?.ventanas?.[k];
  if (!w) return null;
  const pnl = w.final - 1_000_000;
  const color = pnl >= 0 ? GREEN : RED;
  const signo = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
  const neg = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

  return (
    <div className="card-glass" style={{ ...cardStyle(), padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 6, justifyContent: "space-between" }}>
        <div style={sectionLabel}>
          <T es="Backtest · seguir el índice con 1 MDP" en="Backtest · following the index with MXN 1M" />
        </div>
        <div role="group" aria-label={lang === "en" ? "Window" : "Ventana"} style={{ display: "flex", gap: 4 }}>
          {VENTANAS.map((v) => (
            <button
              key={v.k}
              onClick={() => setK(v.k)}
              aria-pressed={k === v.k}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${k === v.k ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)"}`,
                background: k === v.k ? "rgba(255,255,255,0.08)" : "transparent",
                color: k === v.k ? "#F5F5F2" : "#8A8A8E",
              }}
            >
              {lang === "en" ? v.en : v.es}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#C0C0BC", lineHeight: 1.65, margin: "0 0 14px" }}>
        <T
          es="La misma escalera de 5 tramos de 200 mil, pero con una regla mecánica: score de 50 o más → pro-peso, menos de 50 → pro-dólar. No son nuestras posturas: esas combinan el score con noticias, tasas y criterio del día, y no se pueden reconstruir hacia atrás sin hacer trampa."
          en="The same ladder of 5 tranches of 200k, but with a mechanical rule: score of 50 or more → pro-peso, below 50 → pro-USD. These are not our stances: those combine the score with news, rates and daily judgment, and can't be rebuilt backwards without cheating."
        />
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Kpi label={<T es="Capital final" en="Ending capital" />} value={mxn(w.final)} color={color}
          sub={`${mxn(pnl, true)}`} />
        <Kpi label={<T es="Rendimiento anual" en="Annual return" />} value={`${signo(w.cagr_pct)}%`} color={color}
          sub={<T es={`Sharpe ${neg(w.sharpe)}`} en={`Sharpe ${neg(w.sharpe)}`} />} />
        <Kpi label={<T es="Caída máxima" en="Max drawdown" />} value={`−${w.max_dd_pct}%`}
          sub={<T es={`vol. ${w.vol_pct}% anual`} en={`vol. ${w.vol_pct}% annual`} />} />
        <Kpi label={<T es="Acierto" en="Hit rate" />} value={`${w.acierto_pct}%`}
          sub={<T es={`n = ${w.n.toLocaleString("en-US")} (≈${w.n_efectivo} independientes)`} en={`n = ${w.n.toLocaleString("en-US")} (≈${w.n_efectivo} independent)`} />} />
      </div>

      <EquityChart puntos={w.curva} base={1_000_000} lang={lang} conAño height={200} />

      <p style={{ fontSize: 11.5, color: "#8A8A8E", lineHeight: 1.6, margin: "14px 0 0" }}>
        <T
          es={`Tramo ${w.desde} → ${w.hasta}. Esperanza por operación ${signo(w.e_op_pct)}%, IC95 [${signo(w.e_ic95[0])}%, ${signo(w.e_ic95[1])}%]. Señal del día anterior, entrada y salida al fixing de la Fed (DEXMXUS), carry Banxico − Fed histórico y 0.02% de costo al cambiar de lado. Serie congelada y reproducible: data/backtest/history.csv. Simulación hipotética, no una recomendación de inversión.`}
          en={`Window ${w.desde} → ${w.hasta}. Expected value per trade ${signo(w.e_op_pct)}%, 95% CI [${signo(w.e_ic95[0])}%, ${signo(w.e_ic95[1])}%]. Prior-day signal, entry and exit at the Fed fixing (DEXMXUS), historical Banxico − Fed carry and a 0.02% cost when switching sides. Frozen, reproducible series: data/backtest/history.csv. Hypothetical simulation, not investment advice.`}
        />
      </p>
    </div>
  );
}

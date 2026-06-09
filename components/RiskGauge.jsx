"use client";
import { useEffect, useMemo, useState } from "react";
import { useLang, T } from "./Lang";
import { computeRiskIndex, riskLabel, componentMeta } from "../lib/riskIndex";
import RiskSphere from "./RiskSphere";

function minutesAgo(isoStr) {
  if (!isoStr) return null;
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)}h`;
}

function accent(score) {
  if (score >= 58) return "#3FA77E";
  if (score < 42)  return "#A32D2D";
  return "#8A8A8E";
}

export default function RiskGauge() {
  const { lang } = useLang();
  const [data, setData]         = useState(null);
  const [display, setDisplay]   = useState(0);
  const [sel, setSel]           = useState("vix");
  const [methOpen, setMethOpen] = useState(false);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ vix: 13.4, move: 98, dxy: 104.3, mxnVol: 9.1, us10y: 4.3 }));
  }, []);

  const result = useMemo(
    () => data
      ? computeRiskIndex({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol, us10y: data.us10y })
      : null,
    [data]
  );
  const score = result?.score ?? 0;
  const label = riskLabel(score);
  const meta  = useMemo(
    () => data
      ? componentMeta({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol, us10y: data.us10y })
      : null,
    [data]
  );

  useEffect(() => {
    if (!result) return;
    let n = 0;
    const iv = setInterval(() => {
      n += 2;
      if (n >= score) { n = score; clearInterval(iv); }
      setDisplay(n);
    }, 22);
    return () => clearInterval(iv);
  }, [result, score]);

  const accentColor = accent(score);
  const compKeys    = ["vix", "move", "dxy", "us10y", "mxn"];

  return (
    <section className="reveal" style={{ animationDelay: "0.05s" }}>

      {/* ── Hero ── */}
      <div style={{ position: "relative", height: 520, marginBottom: 28 }}>

        {/* Sphere — centered */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width:  "min(500px, 88vw)",
          height: "min(500px, 88vw)",
        }}>
          <RiskSphere height="100%" />
        </div>

        {/* Top-left: title */}
        <div style={{
          position: "absolute",
          top: 28,
          left: 0,
          lineHeight: 0.9,
          textTransform: "uppercase",
          fontFamily: "var(--font-sans)",
          fontWeight: 800,
          fontSize: "clamp(30px, 6.5vw, 80px)",
          letterSpacing: "-0.03em",
          pointerEvents: "none",
        }}>
          <div style={{ color: "#F5F5F2" }}>WHAT'S</div>
          <div style={{ color: "#F5F5F2" }}>TODAY'S</div>
          <div style={{ color: "#2E2E34" }}>RISK?</div>
        </div>

        {/* Bottom-right: score + label */}
        {result && (
          <div style={{
            position: "absolute",
            bottom: 28,
            right: 0,
            textAlign: "right",
            lineHeight: 0.9,
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
            fontWeight: 800,
            fontSize: "clamp(30px, 6.5vw, 80px)",
            letterSpacing: "-0.03em",
            pointerEvents: "none",
          }}>
            <div style={{ color: accentColor }}>{display}.</div>
            <div style={{ color: "#2E2E34" }}>
              <T es={label.es} en={label.en} />
            </div>
          </div>
        )}

        {/* Bottom-left: timestamp */}
        {data?.asOf && (
          <div style={{
            position: "absolute",
            bottom: 28,
            left: 0,
            fontSize: 9,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#2E2E32",
            pointerEvents: "none",
          }}>
            <T es={`Datos hace ${minutesAgo(data.asOf)}`} en={`Data ${minutesAgo(data.asOf)} ago`} />
          </div>
        )}
      </div>

      {/* ── Component cards ── */}
      {meta && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", margin: "0 0 10px" }}>
            &mdash; <T es="Componentes del índice" en="Index components" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {compKeys.map((k) => {
              const compScore = Math.round(result.components[k]);
              const ca = accent(compScore);
              return (
                <button
                  key={k}
                  onClick={() => setSel(k)}
                  style={{
                    background: "rgba(11,11,12,0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    textAlign: "left", cursor: "pointer",
                    padding: "12px 13px", borderRadius: 10,
                    border: `1px solid ${sel === k ? "#3A3A3E" : "#1E1E20"}`,
                    color: "#F5F5F2", transition: "border-color .2s",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>
                    {meta[k].label}
                    {meta[k].sub.es && (
                      <span style={{ opacity: 0.65 }}>
                        {" "}·{" "}<T es={meta[k].sub.es} en={meta[k].sub.en} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, lineHeight: 1, color: "#F5F5F2", marginBottom: 8 }}>
                    {meta[k].value}
                  </div>
                  <div style={{ height: 1.5, background: "#1E1E20", borderRadius: 1, marginBottom: 5 }}>
                    <div style={{ height: "100%", borderRadius: 1, width: `${compScore}%`, background: ca, transition: "width 1.2s ease-out" }} />
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: ca, letterSpacing: 0.5 }}>
                    {compScore}/100
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{
            marginTop: 10, background: "rgba(11,11,12,0.92)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            border: "1px solid #1E1E20", borderRadius: 10, padding: "12px 14px",
            fontSize: 13, lineHeight: 1.7, color: "#8A8A8E",
          }}>
            <T es={meta[sel].detail.es} en={meta[sel].detail.en} />
          </div>

          <button
            onClick={() => setMethOpen((o) => !o)}
            style={{
              marginTop: 12, background: "none", border: "none", cursor: "pointer",
              fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
              color: methOpen ? "#8A8A8E" : "#4A4A50",
              display: "flex", alignItems: "center", gap: 6,
              transition: "color .2s", padding: 0,
            }}
          >
            <span style={{ fontSize: 8 }}>{methOpen ? "▲" : "▼"}</span>
            <T es="¿Cómo se calcula este índice?" en="How is this index calculated?" />
          </button>

          {methOpen && (
            <div style={{
              marginTop: 10, background: "rgba(11,11,12,0.92)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              border: "1px solid #1E1E20", borderRadius: 10, padding: "18px 18px",
            }}>
              <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.75, marginBottom: 16 }}>
                <T
                  es="El índice Risk On resume en un número (0–100) el apetito global por riesgo con énfasis en México. Combina 5 señales de mercado reconocidas, cada una normalizada a 0–100 según rangos históricos típicos. El objetivo es que cualquier usuario pueda entender exactamente qué está impulsando el índice y por qué — sin cajas negras."
                  en="The Risk On index summarizes global risk appetite — with a Mexico focus — in a single number (0–100). It combines 5 recognized market signals, each normalized to 0–100 using typical historical ranges. The goal: any user can understand exactly what's driving the index and why — no black boxes."
                />
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {[
                  { k: "VIX",    w: 35, es: "Volatilidad esperada del S&P 500 · Principal indicador de miedo", en: "Expected S&P 500 volatility · Primary fear gauge" },
                  { k: "DXY",    w: 22, es: "Fuerza del dólar · Dólar fuerte = refugio = risk-off",           en: "Dollar strength · Strong dollar = safe haven = risk-off" },
                  { k: "MOVE",   w: 18, es: "Volatilidad en bonos del Tesoro de EE.UU.",                      en: "US Treasury bond volatility" },
                  { k: "US 10Y", w: 15, es: "Tasa del bono a 10 años · Alta = condiciones restrictivas",      en: "10Y Treasury yield · High = tighter financial conditions" },
                  { k: "MXN",    w: 10, es: "Volatilidad realizada del USD/MXN",                              en: "Realized USD/MXN volatility" },
                ].map(({ k, w, es, en }) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6A6A70", width: 52, flexShrink: 0 }}>{k}</div>
                    <div style={{ flex: 1, height: 3, background: "#1E1E20", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${w * 2}%`, background: "#3A3A44", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8A8A8E", width: 30, textAlign: "right", flexShrink: 0 }}>{w}%</div>
                    <div style={{ fontSize: 11, color: "#5A5A62", flex: 2, minWidth: 0 }}>
                      <T es={es} en={en} />
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#5A5A62", lineHeight: 1.75, borderTop: "1px solid #1A1A1C", paddingTop: 12 }}>
                <T
                  es="Cada variable se normaliza: el extremo de calma vale 100 puntos (risk-on máximo) y el extremo de pánico vale 0. Los 5 puntajes se ponderan y suman para obtener el índice final. Rangos: VIX 12–35 · MOVE 70–140 · DXY 99–108 · US10Y 3.5–5.0% · MXN vol 7–16%."
                  en="Each variable is normalized: the calm extreme scores 100 (full risk-on) and the panic extreme scores 0. The 5 scores are weighted and summed. Ranges: VIX 12–35 · MOVE 70–140 · DXY 99–108 · US10Y 3.5–5.0% · MXN vol 7–16%."
                />
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

"use client";
// components/RiskGauge.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { computeRiskIndex, riskLabel, componentMeta } from "../lib/riskIndex";

// Humanised "hace X min" helper
function minutesAgo(isoStr) {
  if (!isoStr) return null;
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)}h`;
}

// One-sentence interpretation of the score
function riskSentence(score, lang) {
  if (score >= 75) return {
    es: "El mercado muestra apetito alto por riesgo. Condiciones favorables para activos de mayor rendimiento.",
    en: "The market shows strong risk appetite. Conditions favor higher-yield assets.",
  };
  if (score >= 58) return {
    es: "Ambiente moderadamente positivo. El mercado acepta riesgo con selectividad.",
    en: "Moderately positive environment. The market is accepting risk selectively.",
  };
  if (score >= 42) return {
    es: "El mercado está en modo neutral, sin señales claras de dirección.",
    en: "The market is in neutral mode with no clear directional signals.",
  };
  if (score >= 25) return {
    es: "El mercado muestra cautela. Se recomienda reducir exposición a activos de riesgo.",
    en: "The market is cautious. Consider reducing exposure to risk assets.",
  };
  return {
    es: "El mercado está en modo risk-off. Preferencia por activos refugio. Cautela máxima.",
    en: "The market is in risk-off mode. Safe-haven assets are preferred. Maximum caution.",
  };
}

// Arc geometry
const CX = 160;
const CY = 175;
const R  = 110;
const ARC_LEN = Math.PI * R; // semicircle ≈ 345.6
const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

// Point on the arc for a given score value (0-100)
function ptOnArc(val) {
  const rad = (Math.PI / 180) * (180 - val * 1.8);
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

// Three-state accent color
function accent(score) {
  if (score >= 58) return "#3FA77E";
  if (score < 42)  return "#A32D2D";
  return "#8A8A8E";
}

export default function RiskGauge() {
  const { lang } = useLang();
  const [data, setData]       = useState(null);
  const [display, setDisplay] = useState(0);
  const [sel, setSel]         = useState("vix");
  const [hover, setHover]     = useState(false);
  const animatingRef          = useRef(true);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ vix: 13.4, move: 98, dxy: 104.3, mxnVol: 9.1 }));
  }, []);

  const result = useMemo(
    () => data
      ? computeRiskIndex({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol })
      : null,
    [data]
  );
  const score = result?.score ?? 0;
  const label = riskLabel(score);
  const meta  = useMemo(
    () => data
      ? componentMeta({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol })
      : null,
    [data]
  );

  // Count animation (same fix: result is memoized so effect doesn't re-fire on each tick)
  useEffect(() => {
    if (!result) return;
    let n = 0;
    const iv = setInterval(() => {
      n += 2;
      if (n >= score) { n = score; clearInterval(iv); animatingRef.current = false; }
      setDisplay(n);
    }, 22);
    return () => clearInterval(iv);
  }, [result, score]);

  const accentColor  = accent(score);
  const dashOffset   = ARC_LEN * (1 - display / 100);
  const dot          = ptOnArc(display);
  const compKeys     = ["vix", "move", "dxy", "mxn"];

  return (
    <section className="reveal" style={{ animationDelay: "0.05s" }}>

      {/* ── Gauge card ── */}
      <div
        className="tron-glow"
        onMouseEnter={() => !animatingRef.current && setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: "rgba(11,11,12,0.85)",
          border: `1px solid ${hover ? "#3A3A3E" : "#1E1E20"}`,
          borderRadius: 16,
          padding: "28px 24px 22px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color .3s",
        }}
      >
        {/* Eyebrow */}
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#4A4A50", textTransform: "uppercase", marginBottom: 10 }}>
          &mdash; <T es="El indice Risk On de hoy" en="Today's Risk On index" />
        </div>

        {/* SVG arc */}
        <svg
          viewBox="0 0 320 185"
          width="320"
          style={{ maxWidth: "100%", display: "block", margin: "0 auto", overflow: "visible" }}
          role="img"
          aria-label={`Risk On index: ${score}/100`}
        >
          {/* Background track */}
          <path d={ARC_PATH} fill="none" stroke="#222226" strokeWidth="2" strokeLinecap="round" />

          {/* Progress glow (wide, faint) */}
          <path
            d={ARC_PATH} fill="none" stroke="#E8E6E0"
            strokeWidth="10" strokeLinecap="round" opacity="0.05"
            strokeDasharray={`${ARC_LEN} ${ARC_LEN}`}
            strokeDashoffset={dashOffset}
          />

          {/* Progress fill (thin, crisp) */}
          <path
            d={ARC_PATH} fill="none" stroke="#E8E6E0"
            strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${ARC_LEN}`}
            strokeDashoffset={dashOffset}
          />

          {/* Dot halo */}
          <circle cx={dot.x} cy={dot.y} r="9" fill={accentColor} opacity="0.15"
            style={{ transition: "fill .6s" }} />
          {/* Dot */}
          <circle cx={dot.x} cy={dot.y} r="4" fill={accentColor}
            style={{ transition: "fill .6s" }} />
        </svg>

        {/* Score number */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5, marginTop: 6 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontWeight: 500, lineHeight: 1,
            fontSize: hover ? 78 : 48,
            color: hover ? "#FFFFFF" : "#F5F5F2",
            transition: "font-size .35s cubic-bezier(.34,1.3,.5,1), color .35s",
          }}>{display}</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 13, color: "#2E2E32",
            opacity: hover ? 0 : 1, transition: "opacity .3s",
          }}>/100</span>
        </div>

        {/* Status label */}
        <div style={{ marginTop: 9 }}>
          <span style={{
            fontSize: 10, textTransform: "uppercase", fontWeight: 500,
            color: accentColor,
            letterSpacing: hover ? 3.5 : 2,
            transition: "letter-spacing .3s, color .6s",
          }}>
            <T es={label.es} en={label.en} />
          </span>
        </div>

        {/* End labels */}
        <div style={{
          marginTop: 10, display: "flex", justifyContent: "space-between",
          maxWidth: 244, marginLeft: "auto", marginRight: "auto",
          fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#2E2E32",
        }}>
          <span>0 — risk-off</span>
          <span>risk-on — 100</span>
        </div>

        {/* Description sentence */}
        {result && (() => {
          const sent = riskSentence(score, lang);
          return (
            <p style={{ marginTop: 14, fontSize: 12, color: "#6A6A70", lineHeight: 1.7, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
              <T es={sent.es} en={sent.en} />
            </p>
          );
        })()}

        {/* Last updated */}
        {data?.asOf && (
          <div style={{ marginTop: 8, fontSize: 9, color: "#2E2E32", letterSpacing: 1 }}>
            <T es={`Datos de hace ${minutesAgo(data.asOf)}`} en={`Data from ${minutesAgo(data.asOf)} ago`} />
          </div>
        )}
      </div>

      {/* ── Component cards ── */}
      {meta && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#4A4A50", margin: "20px 0 10px" }}>
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
                    background: "rgba(11,11,12,0.85)", textAlign: "left", cursor: "pointer",
                    padding: "12px 13px", borderRadius: 10,
                    border: `1px solid ${sel === k ? "#3A3A3E" : "#1E1E20"}`,
                    color: "#F5F5F2", transition: "border-color .2s",
                  }}
                >
                  {/* Label */}
                  <div style={{ fontSize: 10, color: "#4A4A50", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>
                    {meta[k].label}
                    {meta[k].sub.es && (
                      <span style={{ opacity: 0.65 }}>
                        {" "}·{" "}<T es={meta[k].sub.es} en={meta[k].sub.en} />
                      </span>
                    )}
                  </div>

                  {/* Value */}
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500,
                    lineHeight: 1, color: "#F5F5F2", marginBottom: 8,
                  }}>
                    {meta[k].value}
                  </div>

                  {/* Mini progress bar */}
                  <div style={{ height: 1.5, background: "#1E1E20", borderRadius: 1, marginBottom: 5 }}>
                    <div style={{
                      height: "100%", borderRadius: 1,
                      width: `${compScore}%`,
                      background: ca,
                      transition: "width 1.2s ease-out",
                    }} />
                  </div>

                  {/* Score */}
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: ca, letterSpacing: 0.5 }}>
                    {compScore}/100
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail text */}
          <div style={{
            marginTop: 10, background: "rgba(11,11,12,0.85)", border: "1px solid #1E1E20",
            borderRadius: 10, padding: "12px 14px", fontSize: 13,
            lineHeight: 1.7, color: "#8A8A8E",
          }}>
            <T es={meta[sel].detail.es} en={meta[sel].detail.en} />
          </div>
        </>
      )}
    </section>
  );
}

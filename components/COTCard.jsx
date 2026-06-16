"use client";
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";

// Historical MXN non-commercial positioning extremes (CME, contracts)
const HIST_MIN = -130000;
const HIST_MAX =  130000;

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function pctOfRange(net) {
  return clamp(Math.round(((net - HIST_MIN) / (HIST_MAX - HIST_MIN)) * 100), 0, 100);
}

function crowdLabel(pct, lang) {
  if (pct >= 80) return {
    es: "Posición larga extrema — señal contraria de alerta",
    en: "Extreme long positioning — contrarian warning",
    color: "#A32D2D",
    tag_es: "ABARROTADO LARGO", tag_en: "CROWDED LONG",
  };
  if (pct >= 65) return {
    es: "Posición larga elevada — el carry trade está activo y concurrido",
    en: "Elevated long positioning — carry trade is active and crowded",
    color: "#BA7517",
    tag_es: "LARGO ELEVADO", tag_en: "ELEVATED LONG",
  };
  if (pct <= 20) return {
    es: "Posición corta extrema — el mercado apuesta fuerte contra el peso",
    en: "Extreme short positioning — market heavily betting against the peso",
    color: "#A32D2D",
    tag_es: "ABARROTADO CORTO", tag_en: "CROWDED SHORT",
  };
  if (pct <= 35) return {
    es: "Posición corta elevada — presión de venta sobre el peso",
    en: "Elevated short positioning — selling pressure on the peso",
    color: "#D85A30",
    tag_es: "CORTO ELEVADO", tag_en: "ELEVATED SHORT",
  };
  return {
    es: "Posicionamiento neutral — no hay señal de exceso en ninguna dirección",
    en: "Neutral positioning — no excess signal in either direction",
    color: "#4A4A50",
    tag_es: "NEUTRAL", tag_en: "NEUTRAL",
  };
}

export default function COTCard() {
  const [data, setData] = useState(null);
  const { lang } = useLang();

  useEffect(() => {
    fetch("/api/cot").then((r) => r.json()).then(setData).catch(() => setData({ available: false }));
  }, []);

  if (!data || !data.available) return null;

  const netLong  = data.net >= 0;
  const pct      = pctOfRange(data.net);
  const crowd    = crowdLabel(pct, lang);
  const changeUp = (data.netChange ?? 0) >= 0;
  const netPctOI = data.openInterest ? ((Math.abs(data.net) / data.openInterest) * 100).toFixed(1) : null;

  return (
    <div className="card-glass" style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 8 }}>
        <T es="COT · Peso (CME, no comerciales)" en="COT · Peso (CME, non-commercials)" />
      </div>

      {/* Main number + change */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, lineHeight: 1, color: netLong ? "#0F8A5F" : "#A32D2D" }}>
          {netLong ? "+" : ""}{data.net.toLocaleString()}
        </div>
        {data.netChange != null && (
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: changeUp ? "#0F8A5F" : "#A32D2D" }}>
            {changeUp ? "▲" : "▼"} {Math.abs(data.netChange).toLocaleString()}
          </div>
        )}
      </div>

      {/* Percentile meter */}
      <div style={{ margin: "12px 0 4px" }}>
        <div style={{ position: "relative", height: 6, borderRadius: 3, overflow: "hidden",
          background: "linear-gradient(to right, #A32D2D 0%, #3A3A3E 50%, #0F6E56 100%)" }}>
          <div style={{
            position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
            left: `${pct}%`,
            width: 10, height: 10, borderRadius: "50%",
            background: crowd.color, border: "2px solid #0B0B0C",
            boxShadow: `0 0 6px ${crowd.color}88`,
            transition: "left 1s ease-out",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 8, color: "#3A3A3E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
            <T es="CORTO EX." en="EX. SHORT" />
          </span>
          <span style={{ fontSize: 8, letterSpacing: 1.5, fontFamily: "var(--font-mono)", color: crowd.color }}>
            {lang === "en" ? crowd.tag_en : crowd.tag_es} · {pct}%
          </span>
          <span style={{ fontSize: 8, color: "#3A3A3E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
            <T es="LARGO EX." en="EX. LONG" />
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <p style={{ fontSize: 12, color: "#8A8A8E", lineHeight: 1.6, marginTop: 10 }}>
        {lang === "en" ? crowd.en : crowd.es}
        {netPctOI && (
          <> — <T
            es={`representa el ${netPctOI}% del interés abierto total`}
            en={`representing ${netPctOI}% of total open interest`}
          /></>
        )}
      </p>

      <div style={{ fontSize: 9, color: "#4A4A50", marginTop: 8 }}>
        <T es="Reporte CFTC" en="CFTC report" />: {data.date}
      </div>
    </div>
  );
}

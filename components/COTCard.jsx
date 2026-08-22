"use client";
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";
import { GREEN, RED, cardStyle, sectionLabel } from "../lib/chartHelpers";

const HIST_MIN = -130000;
const HIST_MAX =  130000;

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function pctOfRange(net) {
  return clamp(Math.round(((net - HIST_MIN) / (HIST_MAX - HIST_MIN)) * 100), 0, 100);
}

function crowdLabel(pct) {
  if (pct >= 80) return { es: "Posición larga extrema — señal contraria de alerta",
    en: "Extreme long positioning — contrarian warning",
    color: RED, tag_es: "ABARROTADO LARGO", tag_en: "CROWDED LONG" };
  if (pct >= 65) return { es: "Posición larga elevada — el carry trade está activo y concurrido",
    en: "Elevated long positioning — carry trade is active and crowded",
    color: "#BA7517", tag_es: "LARGO ELEVADO", tag_en: "ELEVATED LONG" };
  if (pct <= 20) return { es: "Posición corta extrema — el mercado apuesta fuerte contra el peso",
    en: "Extreme short positioning — market heavily betting against the peso",
    color: RED, tag_es: "ABARROTADO CORTO", tag_en: "CROWDED SHORT" };
  if (pct <= 35) return { es: "Posición corta elevada — presión de venta sobre el peso",
    en: "Elevated short positioning — selling pressure on the peso",
    color: "#FF8040", tag_es: "CORTO ELEVADO", tag_en: "ELEVATED SHORT" };
  return { es: "Posicionamiento neutral — no hay señal de exceso",
    en: "Neutral positioning — no excess signal in either direction",
    color: "#8A8A8E", tag_es: "NEUTRAL", tag_en: "NEUTRAL" };
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
  const crowd    = crowdLabel(pct);
  const changeUp = (data.netChange ?? 0) >= 0;
  const netPctOI = data.openInterest ? ((Math.abs(data.net) / data.openInterest) * 100).toFixed(1) : null;
  const netColor = netLong ? GREEN : RED;

  return (
    <div style={{ ...cardStyle(netLong), padding: "16px 18px", transition: "border-color .4s" }}>
      <div style={{ ...sectionLabel, marginBottom: 10 }}>
        <T es="COT · Peso (CME, no comerciales)" en="COT · Peso (CME, non-commercials)" />
      </div>

      {/* Net + change */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 28, lineHeight: 1, color: netColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", textShadow: `0 0 20px ${netColor}55` }}>
          {netLong ? "+" : ""}{data.net.toLocaleString()}
        </div>
        {data.netChange != null && (
          <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: changeUp ? GREEN : RED, fontVariantNumeric: "tabular-nums" }}>
            {changeUp ? "▲" : "▼"} {Math.abs(data.netChange).toLocaleString()}
          </div>
        )}
      </div>

      {/* Percentile meter */}
      <div style={{ margin: "14px 0 6px" }}>
        <div style={{ position: "relative", height: 5, borderRadius: 3, overflow: "hidden",
          background: `linear-gradient(to right, ${RED} 0%, rgba(60,60,70,1) 50%, ${GREEN} 100%)` }}>
          <div style={{
            position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
            left: `${pct}%`,
            width: 11, height: 11, borderRadius: "50%",
            background: crowd.color,
            border: "2px solid #000",
            boxShadow: `0 0 8px ${crowd.color}AA`,
            transition: "left 1s ease-out",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#8A8A8E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
            <T es="CORTO EX." en="EX. SHORT" />
          </span>
          <span style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: "var(--font-mono)", color: crowd.color, fontVariantNumeric: "tabular-nums" }}>
            {lang === "en" ? crowd.tag_en : crowd.tag_es} · {pct}%
          </span>
          <span style={{ fontSize: 11, color: "#8A8A8E", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>
            <T es="LARGO EX." en="EX. LONG" />
          </span>
        </div>
      </div>

      {/* Interpretation */}
      <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.6, marginTop: 10 }}>
        {lang === "en" ? crowd.en : crowd.es}
        {netPctOI && (
          <> — <T
            es={`representa el ${netPctOI}% del interés abierto total`}
            en={`representing ${netPctOI}% of total open interest`}
          /></>
        )}
      </p>

      <div style={{ fontSize: 11, color: "#8A8A8E", marginTop: 8, fontFamily: "var(--font-mono)" }}>
        <T es="Reporte CFTC" en="CFTC report" />: {data.date}
      </div>
    </div>
  );
}

"use client";
// components/RiskGauge.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import { computeRiskIndex, riskLabel, componentMeta } from "../lib/riskIndex";

export default function RiskGauge() {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [angle, setAngle] = useState(-90);
  const [display, setDisplay] = useState(0);
  const [sel, setSel] = useState("vix");
  const [hover, setHover] = useState(false);
  const animatingRef = useRef(true);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ vix: 13.4, move: 98, dxy: 104.3, mxnVol: 9.1 }));
  }, []);

  const result = useMemo(
    () =>
      data
        ? computeRiskIndex({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol })
        : null,
    [data]
  );
  const score = result?.score ?? 0;
  const label = riskLabel(score);
  const meta = useMemo(
    () =>
      data
        ? componentMeta({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol })
        : null,
    [data]
  );

  useEffect(() => {
    if (!result) return;
    const target = -90 + score * 1.8;
    const tA = setTimeout(() => setAngle(target), 400);
    let n = 0;
    const iv = setInterval(() => {
      n += 2;
      if (n >= score) {
        n = score;
        clearInterval(iv);
        animatingRef.current = false;
      }
      setDisplay(n);
    }, 22);
    return () => {
      clearTimeout(tA);
      clearInterval(iv);
    };
  }, [result, score]);

  const compKeys = ["vix", "move", "dxy", "mxn"];
  const compColor = (k) => {
    const c = result?.components[k] ?? 50;
    if (c >= 60) return "#0F8A5F";
    if (c >= 40) return "#9A8A3A";
    return "#A32D2D";
  };

  return (
    <section className="reveal" style={{ animationDelay: "0.05s" }}>
      <div
        className="tron-glow"
        onMouseEnter={() => !animatingRef.current && setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: "#0A0A0B",
          border: `1px solid ${hover ? "#3A3A3E" : "#1E1E22"}`,
          borderRadius: 16,
          padding: "30px 24px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color .3s",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#5A5A60", textTransform: "uppercase", marginBottom: 4 }}>
          &mdash; <T es="El indice Risk On de hoy" en="Today's Risk On index" />
        </div>

        <svg viewBox="0 0 320 200" width="320" style={{ maxWidth: "100%" }} role="img"
          aria-label={`Risk On index at ${score} of 100`}>
          <path d="M40 175 A 120 120 0 0 1 280 175" fill="none" stroke="#1A1A1C" strokeWidth="22" strokeLinecap="round" />
          <path d="M40 175 A 120 120 0 0 1 70 92" fill="none" stroke="#A32D2D" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
          <path d="M74 87 A 120 120 0 0 1 122 50" fill="none" stroke="#B04A28" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
          <path d="M128 47 A 120 120 0 0 1 192 47" fill="none" stroke="#9A8A3A" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
          <path d="M198 50 A 120 120 0 0 1 246 87" fill="none" stroke="#5E8A2E" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
          <path d="M250 92 A 120 120 0 0 1 280 175" fill="none" stroke="#0F8A5F" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "160px 175px", transition: "transform 1.4s cubic-bezier(.34,1.3,.5,1)" }}>
            <line x1="160" y1="175" x2="160" y2="64" stroke="#F5F5F2" strokeWidth="3" strokeLinecap="round" />
            <circle cx="160" cy="175" r="9" fill="#F5F5F2" />
            <circle cx="160" cy="175" r="4" fill="#0A0A0B" />
          </g>
        </svg>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginTop: -4 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontWeight: 500, lineHeight: 1,
            fontSize: hover ? 84 : 54,
            color: hover ? "#FFFFFF" : "#F5F5F2",
            transition: "font-size .35s cubic-bezier(.34,1.3,.5,1), color .35s",
          }}>{display}</span>
          <span style={{ fontSize: 18, color: "#5A5A60", opacity: hover ? 0 : 1, transition: "opacity .3s" }}>/100</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <span style={{
            fontSize: 12, textTransform: "uppercase", fontWeight: 500, color: label.color,
            letterSpacing: hover ? 3.5 : 2, transition: "letter-spacing .3s",
          }}>
            <T es={label.es} en={label.en} />
          </span>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", maxWidth: 300, marginLeft: "auto", marginRight: "auto", fontSize: 10, textTransform: "uppercase", letterSpacing: 2 }}>
          <span style={{ color: "#A32D2D" }}>Risk-off</span>
          <span style={{ color: "#0F8A5F" }}>Risk-on</span>
        </div>
      </div>

      {meta && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#5A5A60", margin: "20px 0 10px" }}>
            &mdash; <T es="Que lo mueve hoy" en="What's driving it today" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {compKeys.map((k) => (
              <button key={k} onClick={() => setSel(k)}
                style={{
                  background: "#0A0A0B", textAlign: "left", cursor: "pointer", padding: "11px 12px",
                  borderRadius: 10, border: `1px solid ${sel === k ? "#3A3A3E" : "#1E1E22"}`,
                  color: "#F5F5F2", transition: "border-color .2s",
                }}>
                <div style={{ fontSize: 11, color: "#8A8A8E", letterSpacing: 1 }}>
                  {meta[k].label} <span style={{ fontSize: 10 }}><T es={meta[k].sub.es} en={meta[k].sub.en} /></span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>{meta[k].value}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: compColor(k) }}>{Math.round(result.components[k])}/100</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, background: "#0A0A0B", border: "1px solid #1E1E22", borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: "#8A8A8E" }}>
            <T es={meta[sel].detail.es} en={meta[sel].detail.en} />
          </div>
        </>
      )}
    </section>
  );
}

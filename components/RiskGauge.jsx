"use client";
// components/RiskGauge.jsx
import { useEffect, useState } from "react";
import { useLang, T } from "./Lang";
import { computeRiskIndex, riskLabel, componentMeta } from "../lib/riskIndex";

export default function RiskGauge() {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [angle, setAngle] = useState(-90);
  const [display, setDisplay] = useState(0);
  const [sel, setSel] = useState("vix");

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() =>
        setData({ vix: 13.4, move: 98, dxy: 104.3, mxnVol: 9.1 })
      );
  }, []);

  const result = data
    ? computeRiskIndex({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol })
    : null;
  const score = result?.score ?? 0;
  const label = riskLabel(score);
  const meta = data ? componentMeta({ vix: data.vix, move: data.move, dxy: data.dxy, mxnVol: data.mxnVol }) : null;

  useEffect(() => {
    if (!result) return;
    const target = -90 + score * 1.8;
    const tA = setTimeout(() => setAngle(target), 400);
    let n = 0;
    const iv = setInterval(() => {
      n += 2;
      if (n >= score) { n = score; clearInterval(iv); }
      setDisplay(n);
    }, 22);
    return () => { clearTimeout(tA); clearInterval(iv); };
  }, [result, score]);

  const compKeys = ["vix", "move", "dxy", "mxn"];
  const compColor = (k) => {
    const c = result?.components[k] ?? 50;
    if (c >= 60) return "#0F6E56";
    if (c >= 40) return "#BA7517";
    return "#A32D2D";
  };

  return (
    <section className="reveal" style={{ animationDelay: "0.05s" }}>
      <div className="rounded-2xl border border-gold/20 bg-gradient-to-b from-ink2 to-ink p-6 text-center">
        <div className="mb-1 text-xs uppercase tracking-[2px] text-muted">
          <T es="El índice Risk On de hoy" en="Today's Risk On index" />
        </div>

        <svg viewBox="0 0 280 165" width="280" className="mx-auto max-w-full" role="img"
          aria-label={`Risk On index at ${score} of 100`}>
          <path d="M30 150 A 110 110 0 0 1 47 60" fill="none" stroke="#A32D2D" strokeWidth="16" strokeLinecap="round" />
          <path d="M55 50 A 110 110 0 0 1 110 21" fill="none" stroke="#D85A30" strokeWidth="16" strokeLinecap="round" />
          <path d="M120 19 A 110 110 0 0 1 160 19" fill="none" stroke="#BA7517" strokeWidth="16" strokeLinecap="round" />
          <path d="M170 21 A 110 110 0 0 1 225 50" fill="none" stroke="#639922" strokeWidth="16" strokeLinecap="round" />
          <path d="M233 60 A 110 110 0 0 1 250 150" fill="none" stroke="#0F6E56" strokeWidth="16" strokeLinecap="round" />
          <g className="needle" style={{ transform: `rotate(${angle}deg)` }}>
            <line x1="140" y1="150" x2="140" y2="48" stroke="#F5F2EC" strokeWidth="4" strokeLinecap="round" />
            <circle cx="140" cy="150" r="9" fill="#F5F2EC" />
            <circle cx="140" cy="150" r="4" fill="#14141A" />
          </g>
        </svg>

        <div className="-mt-1 flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-5xl font-medium leading-none">{display}</span>
          <span className="text-lg text-muted">/100</span>
        </div>
        <div className="mt-1 text-lg font-medium" style={{ color: label.color }}>
          <T es={label.es} en={label.en} />
        </div>

        <div className="mx-auto mt-3 flex max-w-[280px] justify-between px-1 text-[11px] uppercase tracking-wide">
          <span className="font-medium text-riskoff">Risk-off</span>
          <span className="font-medium text-riskon">Risk-on</span>
        </div>
      </div>

      {meta && (
        <>
          <div className="mb-2.5 mt-5 text-xs uppercase tracking-wide text-muted">
            <T es="Qué lo mueve hoy — toca cada uno" en="What's driving it today — tap each" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {compKeys.map((k) => (
              <button
                key={k}
                onClick={() => setSel(k)}
                className={`rounded-md border bg-ink2/70 p-3 text-left transition-colors hover:bg-ink3 ${
                  sel === k ? "border-gold" : "border-gold/15"
                }`}
              >
                <div className="text-xs text-muted">
                  {meta[k].label}{" "}
                  <span className="text-[11px]">
                    <T es={meta[k].sub.es} en={meta[k].sub.en} />
                  </span>
                </div>
                <div className="font-mono text-xl font-medium">{meta[k].value}</div>
                <div className="text-[11px] font-medium" style={{ color: compColor(k) }}>
                  {Math.round(result.components[k])}/100
                </div>
              </button>
            ))}
          </div>
          <div className="mt-2.5 rounded-md bg-ink2/70 p-3.5 text-sm leading-relaxed text-bone/90">
            <T es={meta[sel].detail.es} en={meta[sel].detail.en} />
          </div>
        </>
      )}
    </section>
  );
}

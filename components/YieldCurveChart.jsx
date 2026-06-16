"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

function curveStatus(spread) {
  if (spread == null) return null;
  if (spread >=  0.75) return { es: "NORMAL",        en: "NORMAL",        color: "#3FA77E",
    es2: "Curva con pendiente sana — condiciones crediticias favorables.",
    en2: "Healthy upward slope — supportive credit conditions." };
  if (spread >=  0.20) return { es: "NORMALIZANDO",  en: "NORMALIZING",   color: "#BA7517",
    es2: "Curva recuperando pendiente positiva tras el período de inversión.",
    en2: "Curve regaining positive slope after the inversion period." };
  if (spread >= -0.10) return { es: "PLANA",         en: "FLAT",          color: "#D85A30",
    es2: "Curva plana: mercado sin convicción sobre el ciclo de tasas.",
    en2: "Flat curve: market lacks conviction on the rate cycle." };
  return              { es: "INVERTIDA",      en: "INVERTED",      color: "#A32D2D",
    es2: "Curva invertida — históricamente precede recesión en 6–18 meses.",
    en2: "Inverted curve — historically precedes recession by 6–18 months." };
}

export default function YieldCurveChart() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [data, setData] = useState(null);
  const { lang } = useLang();

  useEffect(() => {
    fetch("/api/curve").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data?.points?.length) return;
    let cancelled = false;
    (async () => {
      const mod   = await import("chart.js/auto");
      if (cancelled) return;
      const Chart = mod.default;
      if (chartRef.current) chartRef.current.destroy();

      const status = curveStatus(data.spread2s10s);
      const lineColor = status?.color ?? "#F5F5F2";

      canvasRef.current.style.background = "transparent";
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: {
          labels: data.points.map((p) => p.term),
          datasets: [{
            data:            data.points.map((p) => p.yield),
            borderColor:     lineColor,
            backgroundColor: `${lineColor}12`,
            fill:            true,
            tension:         0.35,
            pointRadius:     3,
            pointBackgroundColor: lineColor,
            borderWidth:     1.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111113",
              borderColor:     "#1E1E22",
              borderWidth:     1,
              titleColor:      "#8A8A8E",
              bodyColor:       "#F5F5F2",
              callbacks: {
                title: (items) => items[0].label,
                label: (c) => `${c.parsed.y.toFixed(2)}%`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#8A8A8E", font: { size: 10 } },
              grid:  { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks: { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback: (v) => v.toFixed(1) + "%" },
              grid:  { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  const status = curveStatus(data?.spread2s10s);

  return (
    <div className="card-glass" style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 8 }}>
        <T es="Curva de tasas · UST" en="Yield curve · UST" />
      </div>

      {/* Spread + status badge */}
      {data?.spread2s10s != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, color: status?.color ?? "#F5F5F2" }}>
            {data.spread2s10s > 0 ? "+" : ""}{data.spread2s10s}%
          </span>
          <span style={{ fontSize: 9, color: "#4A4A50" }}>
            <T es="spread 2s10s" en="2s10s spread" />
          </span>
          {status && (
            <span style={{
              fontSize: 8, letterSpacing: 2, fontFamily: "var(--font-mono)",
              color: status.color, border: `1px solid ${status.color}55`,
              borderRadius: 4, padding: "2px 7px",
            }}>
              {lang === "en" ? status.en : status.es}
            </span>
          )}
        </div>
      )}

      <div style={{ position: "relative", height: 165 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Actionable read */}
      {status && (
        <div style={{ borderTop: "1px solid #141416", paddingTop: 10, marginTop: 8 }}>
          <p style={{ fontSize: 11, color: "#8A8A8E", lineHeight: 1.65, margin: 0 }}>
            {lang === "en" ? status.en2 : status.es2}
          </p>
        </div>
      )}
    </div>
  );
}

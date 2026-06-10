"use client";
import { useEffect, useRef, useState } from "react";
import { T } from "./Lang";

export default function YieldCurveChart() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [data, setData] = useState(null);

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

      canvasRef.current.style.background = "transparent";
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: {
          labels: data.points.map((p) => p.term),
          datasets: [{
            data:            data.points.map((p) => p.yield),
            borderColor:     "#F5F5F2",
            backgroundColor: "rgba(245,245,242,0.05)",
            fill:            true,
            tension:         0.3,
            pointRadius:     3,
            pointBackgroundColor: "#F5F5F2",
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
              callbacks: { label: (c) => c.parsed.y.toFixed(2) + "%" },
            },
          },
          scales: {
            x: {
              ticks: { color: "#8A8A8E", font: { size: 10 } },
              grid:   { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks: { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback: (v) => v.toFixed(1) + "%" },
              grid:   { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  return (
    <div className="card-glass" style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 8 }}>
        <T es="Curva de tasas · UST" en="Yield curve · UST" />
      </div>
      {data?.spread2s10s != null && (
        <div style={{ fontSize: 11, marginBottom: 8, color: data.inverted ? "#A32D2D" : "#8A8A8E" }}>
          <T es="Spread 2s10s" en="2s10s spread" />:{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {data.spread2s10s > 0 ? "+" : ""}{data.spread2s10s}%
          </span>
          {data.inverted && <> — <T es="curva invertida" en="curve inverted" /></>}
        </div>
      )}
      <div style={{ position: "relative", height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

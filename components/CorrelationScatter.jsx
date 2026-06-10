"use client";
import { useEffect, useRef, useState } from "react";
import { T } from "./Lang";

export default function CorrelationScatter() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/correlation").then((r) => r.json()).then(setData).catch(() => {});
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
        type: "scatter",
        data: {
          datasets: [{
            data: data.points.map((p) => ({ x: p.x, y: p.y })),
            backgroundColor: "rgba(245,245,242,0.45)",
            pointRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              title: { display: true, text: "VIX", color: "#8A8A8E", font: { size: 10 } },
              ticks: { color: "#8A8A8E", font: { size: 10 } },
              grid:   { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
            y: {
              title: { display: true, text: "USD/MXN", color: "#8A8A8E", font: { size: 10 } },
              ticks: { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback: (v) => v.toFixed(2) },
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
        <T es="Correlación · VIX vs USD/MXN (90d)" en="Correlation · VIX vs USD/MXN (90d)" />
      </div>
      {data?.corr != null && (
        <div style={{ fontSize: 11, marginBottom: 8, color: "#8A8A8E" }}>
          r = <span style={{ fontFamily: "var(--font-mono)", color: "#F5F5F2" }}>{data.corr}</span>
        </div>
      )}
      <div style={{ position: "relative", height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

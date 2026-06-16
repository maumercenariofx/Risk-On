"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

function linReg(points) {
  const n = points.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const { x, y } of points) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const slope     = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function corrStrength(r) {
  const abs = Math.abs(r ?? 0);
  if (abs >= 0.85) return { es: "Muy alta",   en: "Very high" };
  if (abs >= 0.65) return { es: "Alta",        en: "High"      };
  if (abs >= 0.40) return { es: "Moderada",    en: "Moderate"  };
  return               { es: "Baja",        en: "Low"       };
}

export default function CorrelationScatter() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [data, setData]     = useState(null);
  const [insight, setInsight] = useState(null);
  const { lang } = useLang();

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

      const pts = data.points;
      const reg = linReg(pts);
      const xs  = pts.map((p) => p.x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);

      // Build regression line points
      const trendPts = reg
        ? [{ x: minX, y: reg.slope * minX + reg.intercept }, { x: maxX, y: reg.slope * maxX + reg.intercept }]
        : [];

      // Compute insight text
      if (reg) {
        const slope = reg.slope;
        const vixNow = pts[pts.length - 1]?.x ?? 15;
        const mxnPred25 = (reg.slope * 25 + reg.intercept).toFixed(2);
        setInsight({ slope, vixNow, mxnPred25 });
      }

      canvasRef.current.style.background = "transparent";
      chartRef.current = new Chart(canvasRef.current, {
        data: {
          datasets: [
            {
              type: "scatter",
              data: pts.map((p) => ({ x: p.x, y: p.y, date: p.date })),
              backgroundColor: "rgba(245,245,242,0.30)",
              pointRadius: 3,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: "#F5F5F2",
            },
            ...(trendPts.length ? [{
              type: "line",
              data: trendPts,
              borderColor: "#3FA77E",
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0,
              fill: false,
            }] : []),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: (item) => item.datasetIndex === 0,
              backgroundColor: "#111113",
              borderColor: "#1E1E22",
              borderWidth: 1,
              titleColor: "#4A4A50",
              bodyColor: "#F5F5F2",
              callbacks: {
                title: (items) => items[0]?.raw?.date ?? "",
                label: (item) => [
                  `VIX: ${item.raw.x.toFixed(1)}`,
                  `USD/MXN: ${item.raw.y.toFixed(4)}`,
                ],
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "VIX", color: "#8A8A8E", font: { size: 10 } },
              ticks: { color: "#8A8A8E", font: { size: 10 } },
              grid:  { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
            y: {
              title: { display: true, text: "USD/MXN", color: "#8A8A8E", font: { size: 10 } },
              ticks: { color: "#8A8A8E", font: { size: 10, family: "var(--font-mono)" }, callback: (v) => v.toFixed(2) },
              grid:  { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  const strength = corrStrength(data?.corr);

  return (
    <div className="card-glass" style={{ background: "rgba(11,11,12,0.92)", border: "1px solid #1E1E20", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#4A4A50", marginBottom: 8 }}>
        <T es="Correlación · VIX vs USD/MXN (90d)" en="Correlation · VIX vs USD/MXN (90d)" />
      </div>

      {data?.corr != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: "#F5F5F2" }}>
            r = {data.corr}
          </span>
          <span style={{
            fontSize: 9, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
            color: Math.abs(data.corr) >= 0.65 ? "#3FA77E" : "#BA7517",
            border: `1px solid ${Math.abs(data.corr) >= 0.65 ? "#3FA77E44" : "#BA751744"}`,
            borderRadius: 4, padding: "2px 6px",
          }}>
            {lang === "en" ? strength.en.toUpperCase() : strength.es.toUpperCase()}
          </span>
        </div>
      )}

      <div style={{ position: "relative", height: 165 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Regression trendline legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, marginBottom: 6 }}>
        <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#3FA77E" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
        <span style={{ fontSize: 9, color: "#4A4A50", letterSpacing: 1 }}>
          <T es="Regresión lineal" en="Linear trend" />
        </span>
      </div>

      {/* Actionable insight */}
      {insight && (
        <div style={{ borderTop: "1px solid #141416", paddingTop: 10, marginTop: 4 }}>
          <p style={{ fontSize: 11, color: "#8A8A8E", lineHeight: 1.65, margin: 0 }}>
            <T
              es={`Cada punto que sube el VIX mueve el USD/MXN +${insight.slope.toFixed(3)} pesos en promedio. Si el VIX escalara a 25, la regresión apunta a ~${insight.mxnPred25}.`}
              en={`Each VIX point higher moves USD/MXN by +${insight.slope.toFixed(3)} pesos on average. If VIX spiked to 25, the regression points to ~${insight.mxnPred25}.`}
            />
          </p>
        </div>
      )}
    </div>
  );
}

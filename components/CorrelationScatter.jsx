"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import {
  GREEN, crosshairPlugin, makeGlowPlugin,
  tooltipDefaults, xScaleDefaults, yScaleDefaults,
  cardStyle, sectionLabel,
} from "../lib/chartHelpers";

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
  if (abs >= 0.85) return { es: "Muy alta", en: "Very high", color: GREEN };
  if (abs >= 0.65) return { es: "Alta",     en: "High",      color: "#FACC15" };
  if (abs >= 0.40) return { es: "Moderada", en: "Moderate",  color: "#FF8040" };
  return               { es: "Baja",     en: "Low",       color: "#8A8A8E" };
}

export default function CorrelationScatter() {
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);
  const [data,    setData]    = useState(null);
  const [insight, setInsight] = useState(null);
  const { lang } = useLang();

  useEffect(() => {
    fetch("/api/correlation").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data?.points?.length) return;
    let cancelled = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled) return;
      if (chartRef.current) chartRef.current.destroy();

      const pts  = data.points;
      const reg  = linReg(pts);
      const xs   = pts.map((p) => p.x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const trendPts = reg
        ? [{ x: minX, y: reg.slope * minX + reg.intercept }, { x: maxX, y: reg.slope * maxX + reg.intercept }]
        : [];

      if (reg) {
        const mxnPred25 = (reg.slope * 25 + reg.intercept).toFixed(2);
        setInsight({ slope: reg.slope, mxnPred25 });
      }

      canvasRef.current.style.background = "transparent";
      chartRef.current = new Chart(canvasRef.current, {
        data: {
          datasets: [
            // Scatter dots
            {
              type:                      "scatter",
              data:                      pts.map((p) => ({ x: p.x, y: p.y, date: p.date })),
              backgroundColor:           "rgba(245,245,242,0.18)",
              pointRadius:               3,
              pointHoverRadius:          5,
              pointHoverBackgroundColor: "#F5F5F2",
              borderColor:               "transparent",
            },
            // Regression trendline with glow
            ...(trendPts.length ? [{
              type:        "line",
              data:        trendPts,
              borderColor: GREEN,
              borderWidth: 2,
              pointRadius: 0,
              tension:     0,
              fill:        false,
            }] : []),
          ],
        },
        plugins: [crosshairPlugin, ...(trendPts.length ? [makeGlowPlugin(GREEN, 1, 10)] : [])],
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              filter: (item) => item.datasetIndex === 0,
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
              ...xScaleDefaults(8),
              title: { display: true, text: "VIX", color: "#8A8A8E", font: { size: 10 } },
            },
            y: {
              ...yScaleDefaults((v) => v.toFixed(2)),
              position: "right",
              title: { display: true, text: "USD/MXN", color: "#8A8A8E", font: { size: 10 } },
            },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  const strength = corrStrength(data?.corr);

  return (
    <div style={{ ...cardStyle(), padding: "16px 18px" }}>
      <div style={{ ...sectionLabel, marginBottom: 10 }}>
        <T es="Correlación · VIX vs USD/MXN (90d)" en="Correlation · VIX vs USD/MXN (90d)" />
      </div>

      {data?.corr != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", color: "#F5F5F2", fontVariantNumeric: "tabular-nums" }}>
            r = {data.corr}
          </span>
          <span style={{
            fontSize: 9.5, letterSpacing: 2, fontFamily: "var(--font-mono)",
            color: strength.color,
            border: `1px solid ${strength.color}44`,
            borderRadius: 20, padding: "3px 9px",
            boxShadow: `0 0 10px ${strength.color}30`,
          }}>
            {lang === "en" ? strength.en.toUpperCase() : strength.es.toUpperCase()}
          </span>
        </div>
      )}

      <div style={{ position: "relative", height: 165 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Trendline legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <svg width="22" height="8">
          <line x1="0" y1="4" x2="22" y2="4" stroke={GREEN} strokeWidth="2" style={{ filter: `drop-shadow(0 0 3px ${GREEN})` }} />
        </svg>
        <span style={{ fontSize: 9.5, color: "#8A8A8E", letterSpacing: 1, fontFamily: "var(--font-mono)" }}>
          <T es="Regresión lineal" en="Linear trend" />
        </span>
      </div>

      {insight && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: 8 }}>
          <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.65, margin: 0 }}>
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

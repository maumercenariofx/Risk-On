"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";
import {
  crosshairPlugin, makeGlowPlugin, makeTerminalDotPlugin,
  makeGradientFn, tooltipDefaults, xScaleDefaults, yScaleDefaults,
  cardStyle, sectionLabel,
} from "../lib/chartHelpers";

function curveStatus(spread) {
  if (spread == null) return null;
  if (spread >=  0.75) return { es: "NORMAL",       en: "NORMAL",      color: "#00C805",
    es2: "Curva con pendiente sana — condiciones crediticias favorables.",
    en2: "Healthy upward slope — supportive credit conditions." };
  if (spread >=  0.20) return { es: "NORMALIZANDO", en: "NORMALIZING", color: "#FACC15",
    es2: "Curva recuperando pendiente positiva tras el período de inversión.",
    en2: "Curve regaining positive slope after the inversion period." };
  if (spread >= -0.10) return { es: "PLANA",        en: "FLAT",        color: "#FF8040",
    es2: "Curva plana: mercado sin convicción sobre el ciclo de tasas.",
    en2: "Flat curve: market lacks conviction on the rate cycle." };
  return             { es: "INVERTIDA",    en: "INVERTED",    color: "#FF5000",
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
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled) return;
      if (chartRef.current) chartRef.current.destroy();

      const status = curveStatus(data.spread2s10s);
      const color  = status?.color ?? "#F5F5F2";
      const gradFn = makeGradientFn(color);

      canvasRef.current.style.background = "transparent";
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [
          crosshairPlugin,
          makeGlowPlugin(color, 1, 12),
          makeTerminalDotPlugin(color, 1),
        ],
        data: {
          labels: data.points.map((p) => p.term),
          datasets: [
            // Fill gradient only
            {
              data:            data.points.map((p) => p.yield),
              borderColor:     "transparent",
              borderWidth:     0,
              backgroundColor: gradFn,
              fill:            true,
              tension:         0.35,
              pointRadius:     0,
            },
            // Glowing line
            {
              data:                      data.points.map((p) => p.yield),
              borderColor:               color,
              borderWidth:               2,
              backgroundColor:           "transparent",
              fill:                      false,
              tension:                   0.35,
              pointRadius:               0,
              pointHoverRadius:          4,
              pointHoverBackgroundColor: color,
              pointHoverBorderColor:     "#000",
              pointHoverBorderWidth:     2,
            },
          ],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          plugins: {
            legend:  { display: false },
            tooltip: {
              ...tooltipDefaults,
              filter:   (item) => item.datasetIndex === 1,
              callbacks: {
                title: (items) => items[0].label,
                label: (c)     => ` ${c.parsed.y.toFixed(2)}%`,
              },
            },
          },
          scales: {
            x: xScaleDefaults(data.points.length),
            y: {
              ...yScaleDefaults((v) => v.toFixed(1) + "%"),
              position: "right",
            },
          },
        },
      });
    })();
    return () => { cancelled = true; chartRef.current?.destroy(); };
  }, [data]);

  const status = curveStatus(data?.spread2s10s);

  return (
    <div style={{ ...cardStyle(), padding: "16px 18px" }}>
      <div style={{ ...sectionLabel, marginBottom: 10 }}>
        <T es="Curva de tasas · UST" en="Yield curve · UST" />
      </div>

      {data?.spread2s10s != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1, color: status?.color ?? "#F5F5F2", fontVariantNumeric: "tabular-nums", textShadow: `0 0 20px ${status?.color ?? "#F5F5F2"}55` }}>
            {data.spread2s10s > 0 ? "+" : ""}{data.spread2s10s}%
          </span>
          <span style={{ fontSize: 9, color: "#4B5563", fontFamily: "var(--font-mono)" }}>
            <T es="spread 2s10s" en="2s10s spread" />
          </span>
          {status && (
            <span style={{
              fontSize: 8, letterSpacing: 2, fontFamily: "var(--font-mono)",
              color: status.color,
              border: `1px solid ${status.color}44`,
              borderRadius: 20, padding: "3px 9px",
              boxShadow: `0 0 10px ${status.color}30`,
            }}>
              {lang === "en" ? status.en : status.es}
            </span>
          )}
        </div>
      )}

      <div style={{ position: "relative", height: 165 }}>
        <canvas ref={canvasRef} />
      </div>

      {status && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginTop: 8 }}>
          <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.65, margin: 0 }}>
            {lang === "en" ? status.en2 : status.es2}
          </p>
        </div>
      )}
    </div>
  );
}

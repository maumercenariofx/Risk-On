"use client";
// components/PortfolioSection.jsx
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

// Pesos iniciales del portafolio (suman 100).
const DEFAULT_WEIGHTS = {
  AAPL:   12,
  USDMXN: 25,
  SPX:    20,
  JPM:    15,
  TBILL:  28,
};

const ASSET_LABELS = {
  AAPL:   { es: "Apple",          en: "Apple" },
  USDMXN: { es: "USD/MXN",        en: "USD/MXN" },
  SPX:    { es: "S&P 500",        en: "S&P 500" },
  JPM:    { es: "JPMorgan",       en: "JPMorgan" },
  TBILL:  { es: "T-Bills (cash)", en: "T-Bills (cash)" },
};

const ASSET_KEYS = Object.keys(DEFAULT_WEIGHTS);

const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    if (!chart.tooltip._active?.length) return;
    const ctx = chart.ctx;
    const x   = chart.tooltip._active[0].element.x;
    const { top, bottom } = chart.scales.y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth    = 1;
    ctx.strokeStyle  = "rgba(245,245,242,0.15)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

export default function PortfolioSection() {
  const { lang } = useLang();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const dataRef   = useRef(null);

  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [last,    setLast]    = useState(null);

  const total     = Object.values(weights).reduce((a, b) => a + b, 0);
  const available = Math.max(0, 100 - total);

  // Fetch series once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        dataRef.current = d;
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // (Re)build chart whenever weights change or data first arrives.
  useEffect(() => {
    if (loading || !dataRef.current?.labels?.length) return;
    let cancelled = false;

    (async () => {
      const mod   = await import("chart.js/auto");
      if (cancelled) return;
      const Chart = mod.default;

      const { labels, series } = dataRef.current;
      const combined = labels.map((_, i) => {
        let sum = 0;
        for (const key of ASSET_KEYS) {
          const w = weights[key] ?? 0;
          const v = series[key]?.[i];
          if (v != null) sum += (w / 100) * v;
        }
        return Math.round(sum * 100) / 100;
      });

      setLast(combined[combined.length - 1] ?? null);

      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels,
          datasets: [{
            data:                      combined,
            borderColor:               "#F5F5F2",
            backgroundColor:           "rgba(245,245,242,0.03)",
            fill:                      true,
            tension:                   0.25,
            pointRadius:               0,
            pointHoverRadius:          4,
            pointHoverBackgroundColor: "#F5F5F2",
            pointHoverBorderColor:     "#0A0A0B",
            pointHoverBorderWidth:     2,
            borderWidth:               1.5,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          interaction:         { intersect: false, mode: "index" },
          animation:           { duration: 300 },
          plugins: {
            legend:  { display: false },
            tooltip: {
              backgroundColor: "#111113",
              borderColor:     "#1E1E22",
              borderWidth:     1,
              titleColor:      "#8A8A8E",
              bodyColor:       "#F5F5F2",
              titleFont:       { size: 11 },
              bodyFont:        { family: "var(--font-mono)", size: 13, weight: "500" },
              padding:         10,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (c)     => " " + c.parsed.y.toFixed(2),
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color:        "#8A8A8E",
                font:         { size: 10 },
                maxTicksLimit: 12,
                maxRotation:  0,
              },
              grid:   { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks: {
                color:        "#8A8A8E",
                font:         { size: 10, family: "var(--font-mono)" },
                callback:     (v) => v.toFixed(0),
                maxTicksLimit: 6,
              },
              grid:   { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
    })();

    return () => { cancelled = true; };
  }, [loading, weights]);

  const handleSlider = (key, value) => {
    setWeights((prev) => {
      const otherTotal = Object.entries(prev)
        .filter(([k]) => k !== key)
        .reduce((a, [, v]) => a + v, 0);
      const max = Math.max(0, 100 - otherTotal);
      return { ...prev, [key]: Math.min(value, max) };
    });
  };

  const displayLast = last != null ? last.toFixed(2) : "—";
  const perf        = last != null ? last - 100 : null;

  return (
    <section className="reveal" style={{ animationDelay: "0.15s" }}>
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">
          <T es="Mi portafolio · 1 año" en="My portfolio · 1Y" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="font-mono text-2xl font-medium text-bone">{displayLast}</div>
          {perf != null && (
            <span className="font-mono text-sm" style={{ color: perf >= 0 ? "#0F8A5F" : "#A32D2D" }}>
              {perf >= 0 ? "+" : ""}{perf.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div
        className="card-glass rounded-2xl p-5"
        style={{ background: "rgba(5,5,6,0.50)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      >
        <div style={{ position: "relative", height: 260 }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#8A8A8E", fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
            }}>
              — <T es="cargando" en="loading" /> —
            </div>
          )}
          <canvas ref={canvasRef} role="img"
            aria-label="Portfolio performance chart"
            style={{ opacity: loading ? 0 : 1, transition: "opacity .3s" }} />
        </div>

        {/* Weight sliders */}
        <div className="mt-5 space-y-3">
          {ASSET_KEYS.map((key) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-muted">{ASSET_LABELS[key][lang]}</span>
                <span className="font-mono text-xs text-bone">{weights[key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={weights[key]}
                onChange={(e) => handleSlider(key, Number(e.target.value))}
                className="w-full accent-bone"
                style={{ accentColor: "#F5F5F2" }}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-edge pt-3 text-xs">
          <span className="text-muted">
            <T es="Asignado" en="Assigned" />:{" "}
            <span className="font-mono text-bone">{total}%</span>
          </span>
          <span className="text-muted">
            <T es="Disponible" en="Available" />:{" "}
            <span className="font-mono text-bone">{available}%</span>
          </span>
        </div>

        <p className="mt-3 text-[11px] text-muted">
          <T es="Base 100 · ponderado por los pesos elegidos · T-bills asume 5% anual fijo"
             en="Base 100 · weighted by the chosen weights · T-bills assumes a fixed 5% annual yield" />
        </p>
      </div>
    </section>
  );
}

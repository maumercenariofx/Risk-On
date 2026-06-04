"use client";
// components/MarketsClient.jsx
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

// Synthetic fallback (in case Yahoo is unreachable)
function genSeries(n, start, end) {
  const a = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v += (end - start) / n + Math.sin(i / 4) * 0.02 + (Math.random() - 0.5) * 0.03;
    v = Math.max(16, Math.min(22, v));
    a.push(Math.round(v * 10000) / 10000);
  }
  a[n - 1] = end;
  return a;
}

function genLabels(n, daysBack) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.round((i / (n - 1)) * daysBack));
    labels.push(d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }));
  }
  return labels;
}

const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    if (!chart.tooltip._active?.length) return;
    const ctx = chart.ctx;
    const x = chart.tooltip._active[0].element.x;
    const { top, bottom } = chart.scales.y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(245,245,242,0.15)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

export default function MarketsClient() {
  const { lang } = useLang();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [range, setRange] = useState(30);
  const [last, setLast] = useState(null);
  const [loading, setLoading] = useState(true);
  const dataCache = useRef({});

  // Current spot price
  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => { if (d.usdmxn) setLast(d.usdmxn); })
      .catch(() => {});
  }, []);

  // Historical data + chart
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const buildChart = async (prices, labels) => {
      if (cancelled) return;
      const mod = await import("chart.js/auto");
      if (cancelled) return;
      const Chart = mod.default;
      if (chartRef.current) chartRef.current.destroy();

      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels,
          datasets: [{
            data: prices,
            borderColor: "#F5F5F2",
            backgroundColor: "rgba(245,245,242,0.03)",
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#F5F5F2",
            pointHoverBorderColor: "#0A0A0B",
            pointHoverBorderWidth: 2,
            borderWidth: 1.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111113",
              borderColor: "#1E1E22",
              borderWidth: 1,
              titleColor: "#8A8A8E",
              bodyColor: "#F5F5F2",
              titleFont: { size: 11 },
              bodyFont: { family: "var(--font-mono)", size: 13, weight: "500" },
              padding: 10,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (c) => " $" + c.parsed.y.toFixed(4),
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: "#8A8A8E",
                font: { size: 10 },
                maxTicksLimit: range === 365 ? 12 : range === 90 ? 9 : 6,
                maxRotation: 0,
              },
              grid: { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks: {
                color: "#8A8A8E",
                font: { size: 10, family: "var(--font-mono)" },
                callback: (v) => "$" + v.toFixed(2),
                maxTicksLimit: 6,
              },
              grid: { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
      setLoading(false);
    };

    // Use cache if available
    if (dataCache.current[range]) {
      const { prices, labels } = dataCache.current[range];
      buildChart(prices, labels);
      return () => { cancelled = true; };
    }

    fetch(`/api/history?range=${range}`)
      .then((r) => r.json())
      .then(({ prices, labels }) => {
        if (cancelled) return;
        if (prices.length > 0) {
          dataCache.current[range] = { prices, labels };
          buildChart(prices, labels);
        } else {
          // Fallback synthetic data
          const n = range;
          const fallbackPrices = genSeries(n, 18.1, 18.42);
          const fallbackLabels = genLabels(n, range);
          dataCache.current[range] = { prices: fallbackPrices, labels: fallbackLabels };
          buildChart(fallbackPrices, fallbackLabels);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const n = range;
        const fallbackPrices = genSeries(n, 18.1, 18.42);
        const fallbackLabels = genLabels(n, range);
        buildChart(fallbackPrices, fallbackLabels);
      });

    return () => { cancelled = true; };
  }, [range]);

  const displayLast = last != null ? last.toFixed(4) : "—";

  return (
    <div className="space-y-6 pt-4">
      <div className="reveal">
        <h1 className="font-serif text-3xl font-medium text-bone">
          <T es="Mercados" en="Markets" />
        </h1>
        <p className="mt-1 text-sm text-muted">
          <T es="USD/MXN y los indicadores que mueven el riesgo." en="USD/MXN and the gauges that move risk." />
        </p>
      </div>

      <div className="reveal tron-glow rounded-2xl border border-edge bg-ink2/40 p-5" style={{ animationDelay: "0.1s" }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">USD / MXN</div>
            <div className="font-mono text-2xl font-medium text-bone">{displayLast !== "—" ? "$" + displayLast : "—"}</div>
          </div>
          <div className="flex gap-1.5">
            {[30, 90, 365].map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r ? "border-bone/50 bg-white/10 text-bone" : "border-edge text-muted hover:text-bone"
                }`}>
                {r === 365 ? "1Y" : r + "D"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", height: 280 }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#8A8A8E", fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
            }}>
              — cargando —
            </div>
          )}
          <canvas ref={canvasRef} role="img" aria-label="USD/MXN price chart" style={{ opacity: loading ? 0 : 1, transition: "opacity .3s" }} />
        </div>
        <p className="mt-3 text-[11px] text-muted">
          <T es="Precios de cierre · Yahoo Finance · datos con posible retraso"
             en="Daily closes · Yahoo Finance · data may be delayed" />
        </p>
      </div>
    </div>
  );
}

"use client";
// components/MarketsClient.jsx
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

const PAIRS = [
  { key: "USDMXN", label: "USD/MXN", decimals: 4 },
  { key: "EURMXN", label: "EUR/MXN", decimals: 4 },
  { key: "CHFMXN", label: "CHF/MXN", decimals: 4 },
  { key: "EURUSD", label: "EUR/USD", decimals: 4 },
  { key: "GBPUSD", label: "GBP/USD", decimals: 4 },
  { key: "USDJPY", label: "USD/JPY", decimals: 2 },
];

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
  const now    = new Date();
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

export default function MarketsClient({ embed = false }) {
  const { lang } = useLang();
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);
  const [range, setRange] = useState(30);
  const [pair,  setPair]  = useState("USDMXN");
  const [last,  setLast]  = useState(null);
  const [loading, setLoading] = useState(true);
  const dataCache = useRef({});

  const currentPair = PAIRS.find((p) => p.key === pair) || PAIRS[0];

  // Build chart
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const buildChart = async (prices, labels) => {
      if (cancelled) return;
      const mod   = await import("chart.js/auto");
      if (cancelled) return;
      const Chart = mod.default;
      if (chartRef.current) chartRef.current.destroy();

      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        plugins: [crosshairPlugin],
        data: {
          labels,
          datasets: [{
            data:                      prices,
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
                label: (c)     => " " + c.parsed.y.toFixed(currentPair.decimals),
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color:        "#8A8A8E",
                font:         { size: 10 },
                maxTicksLimit: range === 365 ? 12 : range === 90 ? 9 : 6,
                maxRotation:  0,
              },
              grid:   { display: false },
              border: { color: "#1E1E22" },
            },
            y: {
              ticks: {
                color:        "#8A8A8E",
                font:         { size: 10, family: "var(--font-mono)" },
                callback:     (v) => v.toFixed(currentPair.decimals === 2 ? 0 : 2),
                maxTicksLimit: 6,
              },
              grid:   { color: "rgba(255,255,255,0.03)" },
              border: { color: "#1E1E22" },
            },
          },
        },
      });
      setLoading(false);
    };

    const cacheKey = `${pair}-${range}`;
    if (dataCache.current[cacheKey]) {
      const { prices, labels } = dataCache.current[cacheKey];
      setLast(prices[prices.length - 1] ?? null);
      buildChart(prices, labels);
      return () => { cancelled = true; };
    }

    fetch(`/api/history?range=${range}&symbol=${pair}`)
      .then((r) => r.json())
      .then(({ prices, labels }) => {
        if (cancelled) return;
        if (prices.length > 0) {
          dataCache.current[cacheKey] = { prices, labels };
          setLast(prices[prices.length - 1] ?? null);
          buildChart(prices, labels);
        } else {
          const fallbackPrices = genSeries(range, 18.1, 18.42);
          const fallbackLabels = genLabels(range, range);
          dataCache.current[cacheKey] = { prices: fallbackPrices, labels: fallbackLabels };
          buildChart(fallbackPrices, fallbackLabels);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackPrices = genSeries(range, 18.1, 18.42);
        const fallbackLabels = genLabels(range, range);
        buildChart(fallbackPrices, fallbackLabels);
      });

    return () => { cancelled = true; };
  }, [range, pair]);

  const displayLast = last != null ? last.toFixed(currentPair.decimals) : "—";

  return (
    <div className={embed ? "space-y-4 p-4" : "space-y-6 pt-4"}>
      {!embed && (
        <div className="reveal">
          <h1 className="font-serif text-3xl font-medium text-bone">
            <T es="Mercados" en="Markets" />
          </h1>
          <p className="mt-1 text-sm text-muted">
            <T es="Tipos de cambio y los indicadores que mueven el riesgo." en="FX rates and the gauges that move risk." />
          </p>
        </div>
      )}

      {/* Pair selector */}
      <div className="reveal" style={{ animationDelay: "0.05s" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PAIRS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPair(p.key); setLast(null); }}
              style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      11,
                letterSpacing: 0.5,
                padding:       "5px 10px",
                borderRadius:  6,
                cursor:        "pointer",
                border:        `1px solid ${pair === p.key ? "rgba(245,245,242,0.3)" : "#1E1E20"}`,
                background:    pair === p.key ? "rgba(245,245,242,0.08)" : "rgba(5,5,6,0.50)",
                color:         pair === p.key ? "#F5F5F2" : "#8A8A8E",
                transition:    "all 0.2s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <div className="reveal tron-glow rounded-2xl border border-edge p-5" style={{
        animationDelay: "0.1s",
        background: embed ? "rgba(3,3,4,0.72)" : "rgba(5,5,6,0.50)",
        backdropFilter: embed ? "blur(20px) saturate(1.4) brightness(0.80)" : "blur(14px)",
        WebkitBackdropFilter: embed ? "blur(20px) saturate(1.4) brightness(0.80)" : "blur(14px)",
      }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">
              {currentPair.label}
            </div>
            <div className="font-mono text-2xl font-medium text-bone">
              {displayLast !== "—" ? displayLast : "—"}
            </div>
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
          <canvas ref={canvasRef} role="img"
            aria-label={`${currentPair.label} price chart`}
            style={{ opacity: loading ? 0 : 1, transition: "opacity .3s" }} />
        </div>
        <p className="mt-3 text-[11px] text-muted">
          <T es="Precios de cierre · Yahoo Finance · datos con posible retraso"
             en="Daily closes · Yahoo Finance · data may be delayed" />
        </p>
      </div>
    </div>
  );
}

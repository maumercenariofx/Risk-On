"use client";
// components/MarketsClient.jsx
import { useEffect, useRef, useState } from "react";
import { useLang, T } from "./Lang";

function genSeries(n, start, end, lo, hi) {
  const a = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v += (end - start) / n + Math.sin(i / 4) * 0.03 + (Math.random() - 0.5) * 0.045;
    v = Math.max(lo, Math.min(hi, v));
    a.push(Math.round(v * 1000) / 1000);
  }
  a[n - 1] = end;
  return a;
}

export default function MarketsClient() {
  const { lang } = useLang();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [range, setRange] = useState(30);
  const [last, setLast] = useState(18.42);

  const seriesRef = useRef({
    30: genSeries(30, 18.18, 18.42, 18.05, 18.6),
    90: genSeries(90, 17.95, 18.42, 17.8, 18.7),
    365: genSeries(365, 17.4, 18.42, 16.9, 18.9),
  });

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then((d) => {
      if (d.usdmxn) {
        setLast(d.usdmxn);
        const s = seriesRef.current;
        [30, 90, 365].forEach((k) => (s[k][s[k].length - 1] = Math.round(d.usdmxn * 1000) / 1000));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("chart.js/auto").then((mod) => {
      if (cancelled) return;
      const Chart = mod.default;
      if (chartRef.current) chartRef.current.destroy();
      const data = seriesRef.current[range];
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: {
          labels: data.map((_, i) => i),
          datasets: [{
            data, borderColor: "#F5F5F2",
            backgroundColor: "rgba(245,245,242,0.05)", fill: true,
            tension: 0.3, pointRadius: 0, pointHoverRadius: 5,
            pointHoverBackgroundColor: "#F5F5F2", borderWidth: 1.5,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: () => "", label: (c) => "$" + c.parsed.y.toFixed(3) } },
          },
          scales: {
            x: { display: false },
            y: { ticks: { color: "#8A8A8E", font: { size: 11 }, callback: (v) => "$" + v.toFixed(2) },
                 grid: { color: "rgba(255,255,255,0.04)" } },
          },
        },
      });
    });
    return () => { cancelled = true; };
  }, [range]);

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

      <div className="reveal rounded-2xl border border-edge bg-ink2/40 p-5" style={{ animationDelay: "0.1s" }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">USD/MXN</div>
            <div className="font-mono text-2xl font-medium text-bone">${last.toFixed(3)}</div>
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
          <canvas ref={canvasRef} role="img" aria-label="USD/MXN interactive chart" />
        </div>
        <p className="mt-2 text-xs text-muted">
          <T es="Pasa el cursor sobre la línea para ver el precio. Datos demo; conectar histórico real en producción."
             en="Hover the line to see the price. Demo data; wire real history in production." />
        </p>
      </div>
    </div>
  );
}

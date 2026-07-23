"use client";
// components/IntradaySpark.jsx
// Sparkline intradía VIVO del hero: USD/MXN últimas 24h (barras de 5 min de
// /api/history?range=1d), refresh cada 60s, punta con pulso "en vivo". Color
// por dirección con la convención del sitio: USD/MXN a la baja = peso fuerte =
// verde (#14A276 AA), al alza = rojo (#CE5555 AA). Click → /markets. La cifra
// del cambio es vs el primer punto de la ventana rodante de 24h.
import { useEffect, useState } from "react";
import { useLang } from "./Lang";

const W = 172;
const H = 30;

export default function IntradaySpark() {
  const { lang } = useLang();
  const [d, setD] = useState(null);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch("/api/history?range=1d&symbol=USDMXN")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!dead && j?.prices?.length > 5) setD(j.prices);
        })
        .catch(() => {}); // best-effort: sin datos no hay sparkline
    load();
    const id = setInterval(load, 60000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  if (!d) return null;

  const last = d[d.length - 1];
  const first = d[0];
  const chg = ((last - first) / first) * 100;
  const up = last >= first;
  const col = up ? "#CE5555" : "#14A276";

  let min = Infinity;
  let max = -Infinity;
  for (const v of d) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const hi = max;
  const lo = min;
  const pad = (max - min) * 0.08 || 0.001;
  min -= pad;
  max += pad;
  const Y = (v) => H - 2 - ((v - min) / (max - min)) * (H - 4);
  const pts = d.map((v, i) => `${((i / (d.length - 1)) * (W - 4) + 2).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const tipY = Y(last);

  return (
    <a
      href="/markets?pair=USDMXN"
      // En móvil el hero ya está denso y los chips de países (wrap) invaden la
      // esquina del spark → solo ≥sm; el ticker y el mini-tape cubren móvil.
      className="hidden sm:block"
      data-tip={`${lang === "en" ? "24h · High" : "24h · Máx"} ${hi.toFixed(4)} · ${lang === "en" ? "Low" : "Mín"} ${lo.toFixed(4)}`}
      aria-label={`USD/MXN ${last.toFixed(4)} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% 24h)`}
      style={{
        pointerEvents: "auto",
        textDecoration: "none",
        borderBottom: "none", // anula el dotted de [data-tip]
        cursor: "pointer",
        width: W,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 3,
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ fontSize: 9.5, letterSpacing: 1.5, color: "#4A4A50" }}>USD/MXN</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#B9BDC4" }}>
          {last.toFixed(4)}{" "}
          <span style={{ color: col, fontWeight: 600 }}>
            {up ? "▲" : "▼"} {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
          </span>
        </span>
      </div>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        <polyline
          points={pts}
          fill="none"
          stroke={col}
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx={W - 2} cy={tipY} r="2.4" fill={col} className="spark-live-dot" />
      </svg>
    </a>
  );
}

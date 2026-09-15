"use client";
// components/IntradaySpark.jsx
// Sparkline intradía VIVO del hero: USD/MXN últimas 24h (barras de 5 min de
// /api/history?range=1d), refresh cada 60s, punta con pulso "en vivo". Color
// por dirección con la convención del sitio: USD/MXN a la baja = peso fuerte =
// verde, al alza = rojo (tokens de lib/colors.js). Click → /markets. La cifra
// del cambio es vs el primer punto de la ventana rodante de 24h.
//
// 2026-09-15: lectura al pasar el cursor (precio y hora CDMX del punto más
// cercano), línea punteada en el precio actual, área con gradiente y borde
// izquierdo desvanecido — patrones de live-line de bklit-ui (MIT, (c) 2026
// uixmat). No se porta su lerp continuo de escala: resuelve el temblor de una
// serie que llega por tick, y aquí llega una barra nueva cada 60 s.
import { useEffect, useId, useState } from "react";
import { useLang } from "./Lang";
import { GREEN, RED } from "../lib/colors.js";

const W = 172;
const H = 30;
const X0 = 2;

function horaCDMX(ts, lang) {
  if (ts == null) return "";
  return new Date(ts).toLocaleTimeString(lang === "en" ? "en-US" : "es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City",
  });
}

export default function IntradaySpark() {
  const { lang } = useLang();
  const [d, setD] = useState(null);
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch("/api/history?range=1d&symbol=USDMXN")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!dead && j?.prices?.length > 5) setD({ prices: j.prices, ts: j.timestamps ?? [] });
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

  const { prices, ts } = d;
  const n = prices.length;
  const last = prices[n - 1];
  const first = prices[0];
  const chg = ((last - first) / first) * 100;
  const up = last >= first;
  const col = up ? RED : GREEN;

  let min = Infinity;
  let max = -Infinity;
  for (const v of prices) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const hi = max;
  const lo = min;
  const pad = (max - min) * 0.08 || 0.001;
  min -= pad;
  max += pad;
  const X = (i) => (i / (n - 1)) * (W - 2 * X0) + X0;
  const Y = (v) => H - 2 - ((v - min) / (max - min)) * (H - 4);
  const line = prices.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const area = `${line}L${X(n - 1).toFixed(1)},${H}L${X0},${H}Z`;
  const tipY = Y(last);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left - X0) / (r.width - 2 * X0);
    setHover(Math.max(0, Math.min(n - 1, Math.round(t * (n - 1)))));
  };

  const shown = hover == null ? last : prices[hover];

  return (
    <a
      href="/markets?pair=USDMXN"
      // En móvil el hero ya está denso y los chips de países (wrap) invaden la
      // esquina del spark → solo ≥sm; el ticker y el mini-tape cubren móvil.
      className="hidden sm:block"
      aria-label={`USD/MXN ${last.toFixed(4)} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% 24h) · ${lang === "en" ? "High" : "Máx"} ${hi.toFixed(4)} · ${lang === "en" ? "Low" : "Mín"} ${lo.toFixed(4)}`}
      style={{
        pointerEvents: "auto",
        textDecoration: "none",
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
        <span
          style={{ fontSize: 11, letterSpacing: 1.5, color: "#8A8A8E" }}
          data-tip={`${lang === "en" ? "24h · High" : "24h · Máx"} ${hi.toFixed(4)} · ${lang === "en" ? "Low" : "Mín"} ${lo.toFixed(4)}`}
        >
          {hover == null ? "USD/MXN" : horaCDMX(ts[hover], lang)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#B9BDC4", fontVariantNumeric: "tabular-nums" }}>
          {shown.toFixed(4)}{" "}
          {hover == null && (
            <span style={{ color: col, fontWeight: 600 }}>
              {up ? "▲" : "▼"} {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
            </span>
          )}
        </span>
      </div>
      <svg
        width={W}
        height={H}
        style={{ display: "block", overflow: "visible" }}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {/* userSpaceOnUse: con objectBoundingBox, una serie plana (caja de
              altura cero) hace que el navegador no pinte el trazo. */}
          <linearGradient id={`${gid}-area`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0%" stopColor={col} stopOpacity="0.22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gid}-edge`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
            <stop offset="0%" stopColor={col} stopOpacity="0" />
            <stop offset="15%" stopColor={col} stopOpacity="0.9" />
            <stop offset="100%" stopColor={col} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* Rect transparente: el hover funciona en toda la caja, no solo sobre el trazo. */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" />
        <path d={area} fill={`url(#${gid}-area)`} />
        <line x1={X0} x2={W - X0} y1={tipY} y2={tipY} stroke={col} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 3" />
        <path
          d={line}
          fill="none"
          stroke={`url(#${gid}-edge)`}
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover != null && (
          <>
            <line x1={X(hover)} x2={X(hover)} y1="0" y2={H} stroke="#F5F5F2" strokeOpacity="0.25" strokeWidth="1" />
            <circle cx={X(hover)} cy={Y(prices[hover])} r="2.6" fill="#F5F5F2" />
          </>
        )}
        {/* Sin la clase al hacer hover: sparkPulse anima opacity y taparía el 0.25. */}
        <circle cx={X(n - 1)} cy={tipY} r="2.4" fill={col}
          className={hover == null ? "spark-live-dot" : undefined} opacity={hover == null ? 1 : 0.25} />
      </svg>
    </a>
  );
}

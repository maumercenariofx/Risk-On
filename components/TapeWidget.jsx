"use client";

import { useEffect, useRef } from "react";
import { riskBand } from "../lib/riskScore";

/*
  Mini-tape de progreso — el pariente gráfico del ReadingProgress de los views:
  una mini-card fija abajo-izquierda donde la serie REAL de USD/MXN de 6 meses
  (/api/history) se traza conforme avanzas por la página (línea fantasma = lo
  que falta, trazo en color de banda = lo recorrido). La punta va "viajando"
  por la historia: el precio y la fecha del row superior la siguen. Hover/touch
  sobre la gráfica hace scrub para leer cualquier punto; click → /markets.
  Dormida mientras el hero está a la vista; reduced-motion = línea completa.
*/

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const CW = 150; // canvas CSS px
const CH = 32;

export default function TapeWidget({ score }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const priceRef = useRef(null);
  const dataRef = useRef(null); // {prices, labels}
  const scrubRef = useRef(-1); // índice bajo el cursor, -1 = sin scrub

  const s = Number(score);
  const color = isNaN(s) ? "#8B93A7" : riskBand(s).color;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;

    let raf = 0;
    let dead = false;

    const pageProgress = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      return max > 0 ? Math.min(h.scrollTop / max, 1) : 0;
    };

    function draw() {
      const d = dataRef.current;
      if (dead || !d || d.prices.length < 2) return;
      const { prices, labels } = d;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const n = prices.length;
      let min = Infinity;
      let max = -Infinity;
      for (const v of prices) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const pad = (max - min) * 0.08 || 1;
      min -= pad;
      max += pad;
      const X = (i) => (i / (n - 1)) * (w - 6 * dpr) + 3 * dpr;
      const Y = (v) => h - 3 * dpr - ((v - min) / (max - min)) * (h - 6 * dpr);

      // línea fantasma completa: el "camino por recorrer"
      ctx.beginPath();
      ctx.moveTo(X(0), Y(prices[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(prices[i]));
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      // trazo recorrido, punta interpolada
      const p = reduced ? 1 : pageProgress();
      const kf = p * (n - 1);
      const k = Math.floor(kf);
      const frac = kf - k;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(prices[0]));
      for (let i = 1; i <= k; i++) ctx.lineTo(X(i), Y(prices[i]));
      let tipX = X(k);
      let tipY = Y(prices[k]);
      if (k < n - 1 && frac > 0) {
        tipX += (X(k + 1) - tipX) * frac;
        tipY += (Y(prices[k + 1]) - tipY) * frac;
        ctx.lineTo(tipX, tipY);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6 * dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // scrub del cursor: lector de cualquier punto de la serie
      const si = scrubRef.current;
      if (si >= 0 && si < n) {
        ctx.beginPath();
        ctx.arc(X(si), Y(prices[si]), 2.2 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // el row superior sigue a la punta (o al scrub si hay cursor encima)
      const ri = si >= 0 ? si : Math.round(kf);
      if (priceRef.current) priceRef.current.textContent = prices[ri]?.toFixed(4) ?? "—";
      if (labelRef.current)
        labelRef.current.textContent =
          si >= 0 || p < 0.995 ? (labels?.[ri] ?? "USD/MXN · 6M") : "USD/MXN · HOY";
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // visible solo pasado el hero (mismo umbral que el fade del tape viejo)
        const past = window.scrollY > window.innerHeight * 0.55;
        wrap.style.opacity = past ? "1" : "0";
        wrap.style.pointerEvents = past ? "auto" : "none";
        wrap.style.transform = past ? "translateY(0)" : "translateY(8px)";
        if (past) draw();
      });
    }

    function onMove(e) {
      const d = dataRef.current;
      if (!d) return;
      const rect = canvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      scrubRef.current = Math.max(0, Math.min(d.prices.length - 1, Math.round(fx * (d.prices.length - 1))));
      draw();
    }
    function onLeave() {
      scrubRef.current = -1;
      draw();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    fetch("/api/history?range=180&symbol=USDMXN")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (dead || !j?.prices?.length) return;
        dataRef.current = { prices: j.prices, labels: j.labels };
        onScroll();
      })
      .catch(() => {}); // best-effort: sin datos el widget simplemente no aparece

    onScroll();

    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [color]);

  return (
    <a
      ref={wrapRef}
      href="/markets?pair=USDMXN"
      aria-label="USD/MXN últimos 6 meses — ver en Markets"
      style={{
        position: "fixed",
        bottom: 24,
        left: 20,
        zIndex: 200,
        display: "block",
        padding: "8px 10px",
        borderRadius: 12,
        background: "rgba(10, 10, 12, 0.92)",
        border: `1px solid ${color}44`,
        boxShadow: `0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px ${color}18`,
        opacity: 0,
        pointerEvents: "none",
        transform: "translateY(8px)",
        transition: "opacity 0.4s ease, transform 0.4s ease, border-color 0.3s ease",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 4,
          width: CW,
        }}
      >
        <span
          ref={labelRef}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#9CA3AF",
            whiteSpace: "nowrap",
          }}
        >
          USD/MXN · 6M
        </span>
        <span
          ref={priceRef}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            color,
          }}
        >
          —
        </span>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ display: "block", width: CW, height: CH, touchAction: "pan-y" }}
      />
    </a>
  );
}

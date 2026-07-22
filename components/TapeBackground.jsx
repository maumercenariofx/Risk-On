"use client";

import { useEffect, useRef } from "react";
import { riskBand } from "../lib/riskScore";

/*
  El tape de fondo — la serie REAL de USD/MXN de 6 meses (/api/history) se
  traza detrás del contenido conforme el lector baja por la página, teñida del
  color de banda del view del día. Decoración que comunica: el fondo ES el
  mercado, no un adorno inventado.
  - Canvas 2D fijo (sin Three.js), pointer-events none, tinte total ~10%.
  - Dormido mientras el hero (100svh) está a la vista; entra al pasarlo.
  - prefers-reduced-motion: línea completa estática, sin animación por scroll.
*/

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export default function TapeBackground({ score }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = Number(score);
    const color = isNaN(s) ? "#8B93A7" : riskBand(s).color;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let prices = null;
    let raf = 0;
    let dead = false;

    function progress() {
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      const start = vh * 0.55; // media pantalla del hero: antes de esto, dormido
      const end = Math.max(start + 1, max - vh * 0.25);
      return Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
    }

    function draw() {
      if (dead || !prices || prices.length < 2) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const vh = window.innerHeight;
      const fade = reduced
        ? 1
        : Math.min(1, Math.max(0, (window.scrollY - vh * 0.35) / (vh * 0.35)));
      canvas.style.opacity = String(fade);
      const p = reduced ? 1 : progress();
      if (fade === 0 || p === 0) return;

      // En pantallas angostas 128 cierres en 360px se apelmazan: re-muestrear
      // a ~1 punto por cada 5px CSS conservando los extremos.
      const maxPts = Math.max(40, Math.round(w / (5 * dpr)));
      let series = prices;
      if (prices.length > maxPts) {
        const step = (prices.length - 1) / (maxPts - 1);
        series = Array.from({ length: maxPts }, (_, i) => prices[Math.round(i * step)]);
      }

      const n = series.length;
      let min = Infinity;
      let max = -Infinity;
      for (const v of series) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const pad = (max - min) * 0.05 || 1;
      min -= pad;
      max += pad;
      const top = h * 0.2;
      const bot = h * 0.86;
      const X = (i) => (i / (n - 1)) * w;
      const Y = (v) => bot - ((v - min) / (max - min)) * (bot - top);

      // hasta dónde va trazada la cinta (punta interpolada entre cierres)
      const kf = p * (n - 1);
      const k = Math.floor(kf);
      const frac = kf - k;

      ctx.beginPath();
      ctx.moveTo(X(0), Y(series[0]));
      for (let i = 1; i <= k; i++) ctx.lineTo(X(i), Y(series[i]));
      let tipX = X(k);
      let tipY = Y(series[k]);
      if (k < n - 1 && frac > 0) {
        tipX += (X(k + 1) - tipX) * frac;
        tipY += (Y(series[k + 1]) - tipY) * frac;
        ctx.lineTo(tipX, tipY);
      }

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba(color, 0.05); // halo ancho
      ctx.lineWidth = 7 * dpr;
      ctx.stroke();
      ctx.strokeStyle = rgba(color, 0.13); // trazo fino
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();

      // punta viva de la cinta
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, 0.35);
      ctx.fill();
    }

    function resize() {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      draw();
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) window.addEventListener("scroll", onScroll, { passive: true });

    fetch("/api/history?range=180&symbol=USDMXN")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (dead || !j?.prices?.length) return;
        prices = j.prices;
        draw();
      })
      .catch(() => {}); // best-effort: sin datos no hay tape, la página vive igual

    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [score]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
        opacity: 0,
      }}
    />
  );
}

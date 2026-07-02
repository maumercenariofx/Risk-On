"use client";
// components/ReadingProgress.jsx
// Barra de progreso de lectura (2px, arriba de todo). El color es el de la
// banda del view que se está leyendo. Respeta reduced-motion (sin transición).
import { useEffect, useState } from "react";

export default function ReadingProgress({ color = "#19C39B" }) {
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? Math.min(h.scrollTop / max, 1) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0, zIndex: 120,
        height: 2, width: `${p * 100}%`,
        background: color,
        boxShadow: `0 0 8px ${color}66`,
        transition: "width 0.1s linear",
        pointerEvents: "none",
      }}
    />
  );
}

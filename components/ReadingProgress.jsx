"use client";
// components/ReadingProgress.jsx
// Barra de progreso de lectura (2px, arriba de todo). El color es el de la
// banda del view que se está leyendo.
//
// El comentario anterior afirmaba "Respeta reduced-motion (sin transición)" y el
// código tenía `transition: width 0.1s linear` INCONDICIONAL, en estilo inline —
// inalcanzable por el @media de globals.css. Además animaba `width`, que es
// propiedad de layout: cada scroll forzaba reflow en la página del artículo, que
// es justo donde más se scrollea. Ahora: transform (compositado), rAF-throttle y
// guarda real de reduced-motion (auditoría 2026-08-21).
import { useEffect, useState } from "react";

export default function ReadingProgress({ color = "#19C39B" }) {
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(!!mq?.matches);
    apply();
    mq?.addEventListener?.("change", apply);

    let frame = 0;
    const measure = () => {
      frame = 0;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? Math.min(h.scrollTop / max, 1) : 0);
    };
    // Un solo cálculo por frame: sin esto, setState corría en CADA evento de
    // scroll y el getBoundingClientRect implícito del reflow se disparaba igual.
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mq?.removeEventListener?.("change", apply);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0, zIndex: 120,
        height: 2, width: "100%",
        transformOrigin: "left center",
        transform: `scaleX(${p})`,
        background: color,
        boxShadow: `0 0 8px ${color}66`,
        transition: reduced ? "none" : "transform 0.1s linear",
        pointerEvents: "none",
      }}
    />
  );
}

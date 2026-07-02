// lib/useCountUp.js
// Cuenta de 0 al objetivo cuando el elemento entra al viewport (ease-out cúbico).
// Respeta prefers-reduced-motion (salta directo al valor). Devuelve [valor, ref]:
// engancha el ref al elemento que muestra el número.
import { useEffect, useRef, useState } from "react";

export function useCountUp(target, { duration = 900 } = {}) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    let raf;
    let started = false;

    const start = () => {
      if (started) return;
      started = true;
      if (
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setValue(target);
        return;
      }
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min((t - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(target * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (!el || !("IntersectionObserver" in window)) {
      start();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, duration]);

  return [value, ref];
}

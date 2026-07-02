"use client";
// components/RevealObserver.jsx
// Motor global del reveal por scroll. El script inline del layout ya puso
// html.io ANTES del primer paint (solo si hay IntersectionObserver y el usuario
// no pidió reduced-motion); aquí vive el observer que marca .in-view al entrar
// al viewport, con stagger por lote. El MutationObserver re-engancha los
// .reveal nuevos que aparecen al navegar entre páginas (App Router).
import { useEffect } from "react";

export default function RevealObserver() {
  useEffect(() => {
    if (!document.documentElement.classList.contains("io")) return;

    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          // Stagger por orden de aparición en el lote visible. A propósito NO se
          // respeta el animationDelay declarado: en listas largas (archivo) esos
          // delays por índice llegan a >1s y dejarían huecos al hacer scroll.
          el.style.transitionDelay = `${Math.min(i * 70, 280)}ms`;
          el.classList.add("in-view");
          el.addEventListener(
            "transitionend",
            () => { el.style.transitionDelay = ""; },
            { once: true }
          );
          io.unobserve(el);
          i++;
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    const observeTree = (node) => {
      if (node.nodeType !== 1) return;
      if (node.classList?.contains("reveal") && !node.classList.contains("in-view")) {
        io.observe(node);
      }
      node.querySelectorAll?.(".reveal:not(.in-view)").forEach((el) => io.observe(el));
    };

    observeTree(document.body);
    const mo = new MutationObserver((muts) =>
      muts.forEach((m) => m.addedNodes.forEach(observeTree))
    );
    mo.observe(document.body, { childList: true, subtree: true });

    return () => { io.disconnect(); mo.disconnect(); };
  }, []);

  return null;
}

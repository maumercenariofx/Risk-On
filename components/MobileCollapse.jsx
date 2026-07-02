"use client";
// components/MobileCollapse.jsx
// Acordeón SOLO en móvil: colapsa secciones densas (tablas, calendario) para
// evitar el scroll infinito en celular. En desktop (md+) muestra el contenido
// completo sin chrome extra. El header tappable solo aparece en móvil.
import { useState } from "react";
import { useLang } from "./Lang";

export default function MobileCollapse({ es, en, children, defaultOpen = false }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(defaultOpen);
  const title = lang === "en" ? en : es;

  return (
    <div>
      {/* Botón colapsable — solo móvil */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-b border-edge py-3 text-left md:hidden"
      >
        <span className="text-xs uppercase tracking-[3px] text-muted">{title}</span>
        <span
          className={`text-[10px] text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {/* Contenido: en móvil se despliega animado (grid-rows, sin medir alturas);
          en desktop siempre visible */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out md:block ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden md:overflow-visible">{children}</div>
      </div>
    </div>
  );
}

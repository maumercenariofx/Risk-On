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
      {/* Botón colapsable — solo móvil. Misma afordancia que Collapse.jsx:
          etiqueta hueso seminegrita + hint "Ver +" + chevron en círculo. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-3 border-b border-edge py-3 text-left md:hidden"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[2.5px] text-bone transition-colors group-hover:text-white">
          {title}
        </span>
        <span className="flex items-center gap-2.5">
          {!open && (
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted">
              {lang === "en" ? "Show" : "Ver"} +
            </span>
          )}
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300 ${
              open ? "rotate-180 border-bone/40 text-bone" : "border-edge text-muted"
            }`}
            style={{ fontSize: 9, lineHeight: 1 }}
          >
            ▼
          </span>
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

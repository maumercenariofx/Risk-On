"use client";
// components/Collapse.jsx
// Sección desplegable (todas las pantallas), colapsada por default. Afordancia
// visual deliberada — sin parpadeos: etiqueta en hueso seminegrita (no gris),
// chevron en círculo con borde que ROTA al abrir, hover que ilumina, y un
// hint "Ver +" que desaparece al abrir. Anima con grid-rows (sin medir alturas).
import { useState } from "react";
import { useLang } from "./Lang";

export default function Collapse({ es, en, hint_es, hint_en, defaultOpen = false, children }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(defaultOpen);
  const label = lang === "en" ? en : es;
  const hint = lang === "en" ? (hint_en ?? "Show") : (hint_es ?? "Ver");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-3 border-b border-edge py-3 text-left"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[2.5px] text-bone transition-colors group-hover:text-white">
          {label}
        </span>
        <span className="flex items-center gap-2.5">
          {!open && (
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-muted transition-colors group-hover:text-bone">
              {hint} +
            </span>
          )}
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300 ${
              open
                ? "rotate-180 border-bone/40 text-bone"
                : "border-edge text-muted group-hover:border-bone/40 group-hover:text-bone"
            }`}
            style={{ fontSize: 11, lineHeight: 1 }}
          >
            ▼
          </span>
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className={`min-h-0 overflow-hidden ${open ? "pt-4" : ""}`}>{children}</div>
      </div>
    </div>
  );
}

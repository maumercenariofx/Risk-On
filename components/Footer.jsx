"use client";
import Link from "next/link";
import { T } from "./Lang";

const NAV = [
  { href: "/archive", es: "Archivo", en: "Archive" },
  { href: "/learn",   es: "Aprende", en: "Learn"   },
  { href: "/about",   es: "Contacto", en: "Contact" },
];

// Icono X / Twitter (SVG inline)
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", justifyContent: "space-between", alignItems: "flex-start" }}>

          {/* Brand */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
            <Link href="/" className="font-serif text-lg font-medium text-bone hover:opacity-80 transition-opacity">
              Risk On
            </Link>
            <p className="text-xs text-muted/60 leading-relaxed" style={{ maxWidth: 200 }}>
              <T
                es="Inteligencia macro diaria para traders de MXN."
                en="Daily macro intelligence for MXN traders."
              />
            </p>
          </div>

          {/* Links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="text-[11px] uppercase tracking-[2.5px] text-muted/40">
              <T es="Secciones" en="Sections" />
            </span>
            {NAV.map((l) => (
              <Link key={l.href} href={l.href} className="text-xs text-muted/60 hover:text-bone transition-colors">
                <T es={l.es} en={l.en} />
              </Link>
            ))}
          </div>

          {/* Social */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="text-[11px] uppercase tracking-[2.5px] text-muted/40">
              <T es="Síguenos" en="Follow" />
            </span>
            <a
              href="https://x.com/risk_on_views"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted/60 hover:text-bone transition-colors"
            >
              <XIcon />
              @risk_on_views
            </a>
          </div>

        </div>

        {/* Legal — vivía en components/Disclaimer.jsx, que NUNCA se importó en
            ningún lado: el único aviso del repo no se renderizaba, y encima
            estaba en #3A3A40 (1.86:1) y solo en español. Se trae aquí, bilingüe
            y legible (auditoría 2026-08-21). */}
        <p className="mt-8 border-t border-edge pt-5 text-xs leading-relaxed text-muted" style={{ maxWidth: 620 }}>
          <T
            es="Contenido informativo y educativo. Opiniones propias, no constituyen asesoría de inversión ni recomendación de operar. Datos de mercado con posible retraso. Operar con divisas y derivados implica riesgo."
            en="Informational and educational content. Personal opinions; not investment advice or a recommendation to trade. Market data may be delayed. Trading currencies and derivatives involves risk."
          />
        </p>

        {/* Bottom bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted/70">
            © {new Date().getFullYear()} Risk On
          </span>
          <span className="text-xs text-muted/70 italic">
            Take risks or stay average
          </span>
        </div>
      </div>
    </footer>
  );
}

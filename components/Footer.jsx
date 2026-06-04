"use client";
// components/Footer.jsx
import { T } from "./Lang";

export default function Footer() {
  return (
    <footer className="border-t border-edge bg-ink2/60">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-4 font-serif text-xl font-medium text-bone">
          Risk On
        </div>
        <div className="mb-3 text-xs text-muted">
          <T es="FX y mercados explicados para todos" en="FX and markets explained for everyone" />
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          <T
            es="Contenido informativo y educativo. Opiniones propias, no constituyen asesoría de inversión ni recomendación de operar. Datos de mercado con posible retraso. Operar con divisas y derivados implica riesgo."
            en="Informational and educational content. Personal opinions, not investment advice or a recommendation to trade. Market data may be delayed. Trading FX and derivatives involves risk."
          />
        </p>
        <div className="mt-5 text-xs text-muted/70">
          © {new Date().getFullYear()} Risk On · Take risks or stay average
        </div>
      </div>
    </footer>
  );
}

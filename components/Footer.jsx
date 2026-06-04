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
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          <T
            es="Sitio personal de Mauricio Mercenario, con fines informativos y educativos. Las opiniones son propias y no representan a ninguna institución ni constituyen asesoría de inversión, oferta o recomendación de compra o venta de instrumentos financieros. Los datos de mercado pueden tener retraso. Operar con divisas y derivados implica riesgo de pérdida."
            en="Personal site by Mauricio Mercenario, for informational and educational purposes. Opinions are my own and represent no institution, nor do they constitute investment advice, an offer, or a recommendation to buy or sell financial instruments. Market data may be delayed. Trading FX and derivatives involves risk of loss."
          />
        </p>
        <div className="mt-5 text-xs text-muted/70">
          © {new Date().getFullYear()} Risk On · Take risks or stay average
        </div>
      </div>
    </footer>
  );
}

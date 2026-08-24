"use client";
// components/ProfileCard.jsx
import { T } from "./Lang";

const TAGS_FRONT = ["FX Forwards", "Dual Currency Notes", "Derivatives"];

export default function ProfileCard() {
  return (
    <div className="flip reveal" style={{ height: 280, animationDelay: "0.05s" }}>
      <div className="flip-inner">
        {/* Cara frontal */}
        <div className="flip-face flex flex-col justify-between border border-edge bg-gradient-to-br from-ink via-ink2 to-ink3 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#3A3A3E] bg-ink3 font-medium tracking-wide text-bone">
              MM
            </div>
            <div>
              {/* h2, no h1: /about ya tiene su propio h1 y este componente se monta
                  dentro de esa página — dos h1 rompen la jerarquía (2026-08-24). */}
              <h2 className="text-xl font-medium tracking-tight text-bone">
                Mauricio Mercenario Nieto
              </h2>
              <div className="text-sm font-medium tracking-wide text-muted">
                <T
                  es="Especialista FX · Transaccional, Mercados Globales"
                  en="FX Specialist · Global Markets Trading"
                />
              </div>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            <T
              es="+5 años en mercados FX, derivados y estrategias de inversión. Ciudad de México."
              en="+5 years across FX, derivatives and investment strategies. Mexico City."
            />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TAGS_FRONT.map((tag) => (
              <span key={tag} className="rounded-md border border-edge bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted">
                {tag}
              </span>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-[1.5px] text-muted/70">
            <T es="↺ Pasa el cursor" en="↺ Hover to flip" />
          </div>
        </div>

        {/* Cara trasera */}
        <div className="flip-face flip-back flex flex-col justify-center gap-3 border border-edge bg-gradient-to-br from-ink2 to-ink p-6">
          <div className="text-[11px] font-medium uppercase tracking-[1.5px] text-muted">
            <T es="Trayectoria" en="Track record" />
          </div>
          <p className="text-[12.5px] leading-relaxed text-bone/80">
            <T
              es="Profesional del sector financiero con 5 años de experiencia en gestión de riesgo, trading, sales y atención a clientes especializados. He desarrollado mi carrera en tres instituciones del medio."
              en="Financial industry professional with 5 years of experience in risk management, trading, sales, and specialized client coverage. I have built my career across three institutions in the sector."
            />
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md border border-edge bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted">
              <T es="Pricing & ejecución" en="Pricing & execution" />
            </span>
            <span className="rounded-md border border-edge bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted">
              Lic. Finanzas · Tec
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

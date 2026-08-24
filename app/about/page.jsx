"use client";
// app/about/page.jsx
import ProfileCard from "../../components/ProfileCard";
import { useLang, T } from "../../components/Lang";

const EMAIL = "mauriciomercenariofx@gmail.com";
const CALENDLY = "https://calendly.com/mauriciomercenariofx/30min";
const LINKEDIN = "https://www.linkedin.com/in/mauricio-mercenario-nieto-25a4b5204/";

const ICONS = {
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  mail: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  ),
  linkedin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.46-2.2 2.96V21h-4z" />
    </svg>
  ),
};

function CTA({ href, icon, title, sub }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="group flex items-center gap-3 rounded-xl border border-edge bg-ink2/40 p-4 transition-all hover:translate-x-1 hover:border-[#3A3A3E]">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/5 text-muted">
        {ICONS[icon] ?? icon}
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-medium text-bone">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className="text-muted transition-transform group-hover:translate-x-1">→</span>
    </a>
  );
}

export default function AboutPage() {
  const { lang } = useLang();
  return (
    <div className="space-y-7 pt-4">
      {/* h1 propio de la página. El único que había vivía dentro de
          ProfileCard con text-xl SANS, rompiendo la jerarquía de todas las
          demás rutas y dejando /about sin encabezado de nivel 1 real
          (auditoría 2026-08-21). */}
      <h1 className="reveal font-serif text-3xl font-medium leading-tight text-bone">
        <T es="Mauricio Mercenario" en="Mauricio Mercenario" />
      </h1>

      <ProfileCard />

      <section className="reveal" style={{ animationDelay: "0.15s" }}>
        <h2 className="font-serif text-2xl font-medium leading-tight text-bone">
          <T es="Contacto" en="Contact" />
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          <T es="Agenda una llamada sin compromiso para resolver dudas sobre FX, derivados o cómo leer el riesgo del mercado."
             en="Book a no-pressure call to clear up questions about FX, derivatives, or how to read market risk." />
        </p>
      </section>

      <div className="reveal space-y-2.5" style={{ animationDelay: "0.25s" }}>
        <CTA href={CALENDLY} icon="calendar"
             title={lang === "en" ? "Book a call" : "Agendar una llamada"} sub="Calendly · 30 min" />
        <CTA href={`mailto:${EMAIL}`} icon="mail"
             title={lang === "en" ? "Send an email" : "Enviar un correo"} sub={EMAIL} />
        <CTA href={LINKEDIN} icon="linkedin"
             title="LinkedIn" sub="Mauricio Mercenario Nieto" />
      </div>
    </div>
  );
}

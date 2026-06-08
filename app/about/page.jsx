"use client";
// app/about/page.jsx
import ProfileCard from "../../components/ProfileCard";
import { useLang, T } from "../../components/Lang";

const EMAIL = "mauriciomercenariofx@gmail.com";
const CALENDLY = "https://calendly.com/mauriciomercenariofx/30min";
const LINKEDIN = "https://www.linkedin.com/in/mauricio-mercenario-nieto-25a4b5204/";

function CTA({ href, icon, title, sub }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="group flex items-center gap-3 rounded-xl border border-edge bg-ink2/40 p-4 transition-all hover:translate-x-1 hover:border-[#3A3A3E]">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/5 text-muted text-lg">
        {icon}
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
        <CTA href={CALENDLY} icon="📅"
             title={lang === "en" ? "Book a call" : "Agendar una llamada"} sub="Calendly · 30 min" />
        <CTA href={`mailto:${EMAIL}`} icon="✉️"
             title={lang === "en" ? "Send an email" : "Enviar un correo"} sub={EMAIL} />
        <CTA href={LINKEDIN} icon="in"
             title="LinkedIn" sub="Mauricio Mercenario Nieto" />
      </div>
    </div>
  );
}

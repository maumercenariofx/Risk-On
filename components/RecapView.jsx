"use client";
// components/RecapView.jsx
// Presentación del recap semanal. Comparte la tipografía de artículo con el
// view diario (lib/articleStyle.js) pero se distingue a propósito: el recap se
// lee el viernes por la tarde con calma, no a las 7am en el celular.
import Link from "next/link";
import { useLang, T } from "./Lang";
import { ARTICLE_CLS } from "../lib/articleStyle";

function fmt(slug, lang) {
  return new Date(`${slug}T12:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-US" : "es-MX",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  );
}

export default function RecapView({ recap, prev, next }) {
  const { lang } = useLang();
  const en = lang === "en";
  const title = (en ? recap.title_en : recap.title_es) || recap.title_es || "";
  const body = en ? recap.html_en : recap.html_es;

  return (
    <article className="space-y-6 pt-4">
      <header className="reveal space-y-3">
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2.5,
          textTransform: "uppercase", color: "#8A8A8E",
        }}>
          <T es="Recap semanal" en="Weekly recap" /> · {fmt(recap.slug, lang)}
        </div>
        <h1 className="font-serif text-3xl font-medium leading-tight text-bone">{title}</h1>
        <p className="text-sm leading-relaxed text-muted" style={{ maxWidth: 640 }}>
          <T
            es="El cierre de la semana: qué hizo el peso, qué posturas maduraron y cuáles fallaron. Se publica los viernes."
            en="The week's close: what the peso did, which stances matured and which missed. Published on Fridays."
          />
        </p>
      </header>

      <div className={`reveal ${ARTICLE_CLS}`} dangerouslySetInnerHTML={{ __html: body }} />

      <nav className="reveal flex flex-wrap justify-between gap-4 border-t border-edge pt-5 text-sm">
        {prev ? (
          <Link href={`/recap/${prev.slug}`} className="text-muted transition-colors hover:text-bone">
            ← <T es="Semana anterior" en="Previous week" />
          </Link>
        ) : <span />}
        <Link href="/archive" className="text-muted transition-colors hover:text-bone">
          <T es="Todos los views" en="All views" />
        </Link>
        {next ? (
          <Link href={`/recap/${next.slug}`} className="text-muted transition-colors hover:text-bone">
            <T es="Semana siguiente" en="Next week" /> →
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}

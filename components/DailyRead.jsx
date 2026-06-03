"use client";
// components/DailyRead.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";

export default function DailyRead({ post }) {
  const { lang } = useLang();
  const title = lang === "en" ? post.title_en : post.title_es;
  const summary = lang === "en" ? post.summary_en : post.summary_es;

  return (
    <section className="reveal" style={{ animationDelay: "0.2s" }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-gold">
          <T es="La lectura del día" en="Today's read" />
        </span>
        <span className="text-xs text-muted">{post.date}</span>
      </div>
      <h2 className="mb-2 font-serif text-2xl font-medium leading-tight">{title}</h2>
      <p className="text-[15px] leading-relaxed text-bone/80">{summary}</p>
      <Link
        href={`/archive/${post.slug}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold transition-transform hover:translate-x-1"
      >
        <T es="Leer completa" en="Read full note" /> →
      </Link>
    </section>
  );
}

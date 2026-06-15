"use client";
// components/DailyRead.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";
import SubscribeForm from "./SubscribeForm";

export default function DailyRead({ post }) {
  const { lang } = useLang();
  const title = lang === "en" ? post.title_en : post.title_es;
  const summary = lang === "en" ? post.summary_en : post.summary_es;

  return (
    <section className="reveal" style={{ animationDelay: "0.2s" }}>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-serif text-3xl font-semibold tracking-tight text-bone">
          Pre-market
        </span>
        <span className="text-xs text-muted">{post.date}</span>
      </div>
      <h2 className="mb-1 font-serif text-2xl font-medium leading-tight text-bone">{title}</h2>
      <p className="mb-2 text-xs text-muted">
        <T es="El briefing matutino de mercados, antes de que abra Wall Street."
           en="The morning markets briefing, before Wall Street opens." />
      </p>
      <p className="text-[15px] leading-relaxed text-bone/80">{summary}</p>
      <Link
        href={`/archive/${post.slug}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-bone transition-transform hover:translate-x-1"
      >
        <T es="Leer completa" en="Read full note" /> →
      </Link>

      <SubscribeForm />
    </section>
  );
}

"use client";
// components/DailyRead.jsx
import { useState } from "react";
import { useLang, T } from "./Lang";
import SubscribeForm from "./SubscribeForm";
import ViewOverlay from "./ViewOverlay";
import InlineBold from "./InlineBold";

export default function DailyRead({ post }) {
  const { lang } = useLang();
  const [readerOpen, setReaderOpen] = useState(false);
  const title = lang === "en" ? post.title_en : post.title_es;
  const summary = lang === "en" ? post.summary_en : post.summary_es;

  return (
    <section className="reveal" style={{ animationDelay: "0.2s" }}>
      <div className="mb-3 flex items-baseline gap-3 flex-wrap">
        <span className="font-serif text-3xl font-semibold tracking-tight text-bone">
          El Pre-Market
        </span>
        <span className="text-xs text-muted">{post.date}</span>
        {post.score && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-mono)",
            fontSize: 11, color: post.score >= 58 ? "#3FA77E" : post.score < 42 ? "#A32D2D" : "#8A8A8E",
          }}>
            {post.score}
            <span style={{ fontSize: 9.5, letterSpacing: 2, color: "#8A8A8E" }}>
              <T es="OPINIÓN" en="EDITORIAL" />
            </span>
          </span>
        )}
      </div>
      <h2 className="mb-1 font-serif text-2xl font-medium leading-tight text-bone">{title}</h2>
      <p className="mb-2 text-xs text-muted">
        <T es="El briefing matutino de mercados, antes de que abra Wall Street."
           en="The morning markets briefing, before Wall Street opens." />
      </p>
      <p className="text-[15px] leading-relaxed text-bone/80"><InlineBold text={summary} /></p>

      {/* Abre el view completo en un overlay lector — sin navegar, así al
          cerrar sigues exactamente donde ibas (petición explícita del usuario:
          el link a /archive te regresaba al inicio de la landing). */}
      <button
        onClick={() => setReaderOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-bone transition-transform hover:translate-x-1"
      >
        <T es="Leer el view completo" en="Read the full view" /> →
      </button>

      <ViewOverlay post={post} open={readerOpen} onClose={() => setReaderOpen(false)} />

      <SubscribeForm />
    </section>
  );
}

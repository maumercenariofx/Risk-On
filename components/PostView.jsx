"use client";
// components/PostView.jsx
import { useState } from "react";
import Link from "next/link";
import { useLang, T } from "./Lang";
import ScoreGauge from "./ScoreGauge";
import RiskBands from "./RiskBands";

function ShareBar({ post, lang }) {
  const [copied, setCopied] = useState(false);
  const title  = lang === "en" ? post.title_en : post.title_es;
  const url    = `https://riskon.lat/archive/${post.slug}`;
  const tweet  = `Risk On ${post.score}/100 — ${title} ${url}`;
  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`;

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#4A4A50" }}>
        <T es="Compartir" en="Share" />
      </span>
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1,
          color: "#8A8A8E", border: "1px solid #2A2A2E", borderRadius: 6,
          padding: "5px 10px", textDecoration: "none",
          transition: "color .2s, border-color .2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "#F5F5F2"; e.currentTarget.style.borderColor = "#4A4A50"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#8A8A8E"; e.currentTarget.style.borderColor = "#2A2A2E"; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        X
      </a>
      <button
        onClick={copy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1,
          color: copied ? "#3FA77E" : "#8A8A8E",
          border: `1px solid ${copied ? "#3FA77E33" : "#2A2A2E"}`,
          borderRadius: 6, padding: "5px 10px", background: "none", cursor: "pointer",
          transition: "color .2s, border-color .2s",
        }}
      >
        {copied ? <T es="¡Copiado!" en="Copied!" /> : <T es="Copiar link" en="Copy link" />}
      </button>
    </div>
  );
}

export default function PostView({ post, prev, next }) {
  const { lang } = useLang();
  return (
    <article className="space-y-5 pt-4">
      <Link href="/" className="text-sm text-muted hover:text-bone inline-block transition-colors">
        ← <T es="Inicio" en="Home" />
      </Link>
      <div className="reveal">
        <div className="text-xs text-muted">{post.date}</div>
        <h1 className="mt-1 font-serif text-2xl font-medium leading-tight text-bone">
          {lang === "en" ? post.title_en : post.title_es}
        </h1>
      </div>

      {typeof post.score === "number" && (
        <div className="reveal" style={{ animationDelay: "0.06s" }}>
          <ScoreGauge score={post.score} signals={post.signals || []} />
        </div>
      )}

      <div className="reveal" style={{ animationDelay: "0.08s" }}>
        <RiskBands />
      </div>
      <div
        className="reveal prose-invert max-w-none text-[15px] leading-relaxed text-bone/85 [&>p]:mb-4 [&_strong]:text-bone [&>p:first-of-type]:text-[17px] [&>p:first-of-type]:text-bone [&>p:first-of-type]:font-medium [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:font-mono [&_h3]:text-[10px] [&_h3]:uppercase [&_h3]:tracking-[3px] [&_h3]:text-muted"
        style={{ animationDelay: "0.1s" }}
        dangerouslySetInnerHTML={{ __html: (lang === "en" ? post.html_en : post.html_es) ?? post.html }}
      />
      <div className="border-t border-edge pt-4">
        <ShareBar post={post} lang={lang} />
      </div>

      <p className="text-xs text-muted/60">
        <T
          es={`Índice al momento de esta nota (${post.date}) — el valor en vivo en la portada puede haber cambiado.`}
          en={`Index at the time of this note (${post.date}) — the live value on the homepage may have changed.`}
        />
      </p>

      {(prev || next) && (
        <div className="reveal flex items-center justify-between border-t border-edge pt-4 text-sm">
          {prev ? (
            <Link href={`/archive/${prev.slug}`} className="text-muted hover:text-bone transition-colors">
              ← {lang === "en" ? prev.title_en : prev.title_es}
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/archive/${next.slug}`} className="text-right text-muted hover:text-bone transition-colors">
              {lang === "en" ? next.title_en : next.title_es} →
            </Link>
          ) : <span />}
        </div>
      )}
    </article>
  );
}

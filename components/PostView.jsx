"use client";
// components/PostView.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";
import { riskLabel } from "../lib/riskIndex";

export default function PostView({ post, prev, next }) {
  const { lang } = useLang();
  const label = riskLabel(post.score || 50);
  return (
    <article className="space-y-5 pt-4">
      <Link href="/archive" className="text-sm text-muted hover:text-bone inline-block transition-colors">
        ← <T es="Archivo" en="Archive" />
      </Link>
      <div className="reveal flex items-center gap-4">
        <div className="flex flex-col items-center rounded-xl border border-edge px-4 py-2">
          <span className="font-mono text-2xl font-medium" style={{ color: label.color }}>{post.score}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted">Risk On</span>
        </div>
        <div>
          <div className="text-xs text-muted">{post.date}</div>
          <h1 className="font-serif text-2xl font-medium leading-tight text-bone">
            {lang === "en" ? post.title_en : post.title_es}
          </h1>
        </div>
      </div>
      <div
        className="reveal prose-invert max-w-none text-[15px] leading-relaxed text-bone/85 [&>p]:mb-4 [&_strong]:text-bone [&>p:first-of-type]:text-[17px] [&>p:first-of-type]:text-bone [&>p:first-of-type]:font-medium [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:font-mono [&_h3]:text-[10px] [&_h3]:uppercase [&_h3]:tracking-[3px] [&_h3]:text-muted"
        style={{ animationDelay: "0.1s" }}
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
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

"use client";
// components/PostView.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";
import { riskLabel } from "../lib/riskIndex";

export default function PostView({ post }) {
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
        className="reveal prose-invert max-w-none text-[15px] leading-relaxed text-bone/85 [&>p]:mb-4 [&_strong]:text-bone"
        style={{ animationDelay: "0.1s" }}
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </article>
  );
}

"use client";
// components/CaseView.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";

export default function CaseView({ caseData }) {
  const { lang } = useLang();
  const title = lang === "en" ? caseData.title_en : caseData.title_es;
  const bodyHtml = lang === "en" ? caseData.html_en : caseData.html_es;

  return (
    <article className="space-y-5 pt-4">
      <Link href="/" className="text-sm text-muted hover:text-bone inline-block transition-colors">
        ← <T es="Inicio" en="Home" />
      </Link>
      <div className="reveal">
        <div className="font-mono text-[11px] uppercase tracking-[3px] text-muted mb-2">
          {caseData.tags}
        </div>
        <h1 className="font-serif text-2xl font-medium leading-tight text-bone">{title}</h1>
      </div>
      <div
        className="reveal prose-invert max-w-none text-[15px] leading-relaxed text-bone/85 [&>p]:mb-4 [&_strong]:text-bone [&>p:first-of-type]:text-[17px] [&>p:first-of-type]:text-bone [&>p:first-of-type]:font-medium [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:font-mono [&_h3]:text-[11px] [&_h3]:uppercase [&_h3]:tracking-[3px] [&_h3]:text-muted"
        style={{ animationDelay: "0.1s" }}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  );
}

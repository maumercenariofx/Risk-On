"use client";
// components/ArchiveList.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";
import { riskBand } from "../lib/riskScore";

export default function ArchiveList({ posts }) {
  const { lang } = useLang();
  return (
    <div className="space-y-6 pt-4">
      <div className="reveal">
        <h1 className="font-serif text-3xl font-medium text-bone">
          <T es="Archivo" en="Archive" />
        </h1>
        <p className="mt-1 text-sm text-muted">
          <T es="Todas las ediciones diarias." en="Every daily edition." />
        </p>
      </div>
      <div className="space-y-3">
        {posts.map((p, i) => {
          const label = riskBand(p.score || 50);
          return (
            <Link key={p.slug} href={`/archive/${p.slug}`}
              className="reveal card-spot block rounded-xl border border-edge bg-ink2/40 p-4 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#3A3A3E] hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
              style={{ animationDelay: `${0.05 + i * 0.05}s` }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">{p.date}</div>
                  <div className="mt-0.5 font-serif text-lg font-medium text-bone">
                    {lang === "en" ? p.title_en : p.title_es}
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-center rounded-lg border border-edge px-3 py-1.5">
                  <span className="font-mono text-lg font-medium" style={{ color: label.color }}>
                    {p.score}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Risk On</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

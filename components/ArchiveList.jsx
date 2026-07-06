"use client";
// components/ArchiveList.jsx
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLang, T } from "./Lang";
import { riskBand, BANDS } from "../lib/riskScore";

// Normaliza para buscar sin acentos ("carcel" encuentra "cárcel").
const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ArchiveList({ posts }) {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [band, setBand] = useState(null); // key de BANDS o null = todas

  const shown = useMemo(() => {
    const nq = norm(q.trim());
    return posts.filter((p) => {
      if (band && riskBand(p.score ?? 50).key !== band) return false;
      if (!nq) return true;
      return (
        norm(p.title_es).includes(nq) ||
        norm(p.title_en).includes(nq) ||
        norm(p.summary_es).includes(nq) ||
        String(p.date ?? p.slug).includes(nq)
      );
    });
  }, [posts, q, band]);

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

      {/* Búsqueda + filtro por banda */}
      <div className="reveal flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === "en" ? "Search views…" : "Buscar views…"}
          aria-label={lang === "en" ? "Search views" : "Buscar views"}
          className="min-w-0 flex-1 rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-bone outline-none placeholder:text-muted focus:border-bone/50"
          style={{ maxWidth: 320 }}
        />
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBand(band === b.key ? null : b.key)}
              aria-pressed={band === b.key}
              style={{
                fontSize: 8, letterSpacing: 1.5, fontFamily: "var(--font-mono)",
                color: b.color, borderRadius: 20, padding: "4px 10px",
                border: `1px solid ${b.color}${band === b.key ? "" : "44"}`,
                background: band === b.key ? `${b.color}22` : "transparent",
                cursor: "pointer", transition: "all .2s",
              }}
            >
              {b.key}
            </button>
          ))}
        </div>
        {(q || band) && (
          <span className="text-xs text-muted">
            {shown.length} {lang === "en" ? "results" : "resultados"}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            <T es="Nada por aquí — prueba otra búsqueda." en="Nothing here — try another search." />
          </p>
        )}
        {shown.map((p, i) => {
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

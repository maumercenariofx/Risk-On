"use client";
// components/CountryNews.jsx
// Noticias de las últimas 48h del país enfocado en el globo. Se abre DEBAJO del
// hero, antes del ticker (2026-09-21: dentro del hero tapaba el globo). El
// 15-sep vivía en el lugar del título porque abajo del ticker y del termómetro
// quedaba fuera de pantalla y el chip parecía no hacer nada: por eso el hint
// del hero ahora dice "Noticias · país ▼" y baja hasta aquí.
import { T } from "./Lang";

function newsAge(pubDate, lang) {
  const t = new Date(pubDate).getTime();
  if (isNaN(t)) return "";
  const hrs = Math.round((Date.now() - t) / 3600000);
  if (hrs < 1) return lang === "en" ? "now" : "ahora";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function CountryNews({ country, color, items, loading, lang, onClose }) {
  const name = lang === "en" ? country?.name_en : country?.name_es;
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={lang === "en" ? `News · ${name}` : `Noticias · ${name}`}
      className="card-glass"
      style={{
        pointerEvents: "auto",
        display: "flex", flexDirection: "column",
        maxHeight: "100%",
        background: "rgba(8,10,14,0.82)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.12)", borderLeft: `3px solid ${color}`,
        borderRadius: 12, padding: "14px 16px",
        animation: "fadeInUp .25s ease both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#8A8A8E" }}>
          <T es={`Noticias · ${name ?? ""} · últimas 48h`} en={`News · ${name ?? ""} · last 48h`} />
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A8E", fontSize: 13, padding: 2, lineHeight: 1 }}
          aria-label={lang === "en" ? "Close news" : "Cerrar noticias"}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: "auto", minHeight: 0 }}>
        {loading && (
          <p style={{ fontSize: 12, color: "#8A8A8E", margin: 0 }}>
            <T es="Cargando…" en="Loading…" />
          </p>
        )}

        {!loading && items.length === 0 && (
          <p style={{ fontSize: 12, color: "#8A8A8E", margin: 0 }}>
            <T es="Sin noticias relevantes en las últimas 48 horas." en="No relevant news in the last 48 hours." />
          </p>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((n, i) => (
              <a
                key={`${i}-${n.link}`}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-bone"
                style={{
                  display: "flex", alignItems: "baseline", gap: 8,
                  fontSize: 13, lineHeight: 1.45, color: "#D5D5D2",
                  textDecoration: "none", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                  paddingBottom: 8,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8A8A8E", flexShrink: 0, minWidth: 28 }}>
                  {newsAge(n.pubDate, lang)}
                </span>
                <span style={{ flex: 1 }}>
                  {n.title}
                  {n.source && <span style={{ color: "#8A8A8E" }}> — {n.source}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

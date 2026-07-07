"use client";
// components/ViewOverlay.jsx
// Lector del view completo SIN salir de la página: sheet a pantalla completa
// sobre la landing. Al cerrar (X, Esc, click al fondo o botón ATRÁS del
// navegador) regresas exactamente donde estabas — nada de volver al inicio.
// El botón atrás funciona vía pushState/popstate: abrir el overlay mete un
// estado #view al historial; atrás lo saca y eso dispara el cierre.
import { useEffect, useRef } from "react";
import { useLang, T } from "./Lang";
import { riskBand } from "../lib/riskScore";
import { ARTICLE_CLS } from "../lib/articleStyle";

export default function ViewOverlay({ post, open, onClose }) {
  const { lang } = useLang();
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Bloquear el scroll del fondo mientras el lector está abierto, y GUARDAR
    // la posición para restaurarla exacta al cerrar (el contenido async puede
    // mover el layout mientras el lector está abierto).
    const savedY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Botón atrás = cerrar overlay (no abandonar la página).
    history.pushState({ viewOverlay: true }, "", "#view");
    pushedRef.current = true;
    const onPop = () => { pushedRef.current = false; onClose(); };
    window.addEventListener("popstate", onPop);

    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);

    function close() {
      // Si nuestro estado sigue en el historial, sácalo (dispara onPop→onClose).
      if (pushedRef.current) history.back();
      else onClose();
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      // Cierre por X/backdrop (sin popstate): limpia el #view del historial.
      if (pushedRef.current) {
        pushedRef.current = false;
        history.back();
      }
      // Volver EXACTO a donde estaba el lector (doble rAF: espera el reflow).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }))
      );
    };
  }, [open, onClose]);

  if (!open || !post) return null;

  const title = lang === "en" ? post.title_en : post.title_es;
  const html = (lang === "en" ? post.html_en : post.html_es) ?? post.html;
  const band = typeof post.score === "number" ? riskBand(post.score) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        overflowY: "auto", overscrollBehavior: "contain",
        animation: "pageFade 0.25s ease both",
      }}
    >
      <article
        className="view-sheet mx-auto my-[5vh] w-[min(94vw,760px)] rounded-2xl border border-edge px-5 py-8 sm:px-10 sm:py-10"
        style={{ background: "#0B0B0C", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}
      >
        {/* Header del lector */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{post.date}</span>
            {band && (
              <span style={{
                fontSize: 9.5, letterSpacing: 2, fontFamily: "var(--font-mono)",
                color: band.color, border: `1px solid ${band.color}44`,
                borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
              }}>
                {post.score} · {band.key}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={lang === "en" ? "Close reader" : "Cerrar lector"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted transition-colors hover:border-bone/40 hover:text-bone"
            style={{ fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <h1 className="mb-6 font-serif text-3xl font-medium leading-tight text-bone">
          {title}
        </h1>

        <div className={ARTICLE_CLS} dangerouslySetInnerHTML={{ __html: html }} />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5">
          <a
            href={`/archive/${post.slug}`}
            className="text-xs text-muted underline-offset-2 transition-colors hover:text-bone hover:underline"
          >
            <T es="Abrir página completa (para compartir) →" en="Open full page (to share) →" />
          </a>
          <button
            onClick={onClose}
            className="rounded-md border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-bone"
          >
            <T es="Cerrar" en="Close" />
          </button>
        </div>
      </article>
    </div>
  );
}

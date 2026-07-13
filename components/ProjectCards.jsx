"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useLang } from "./Lang";

// ── Data — replace / extend as needed ────────────────────────────────────────
const PROJECTS = [
  {
    tags: "FX · BANXICO · CARRY",
    title_es: "El peso en el ojo del huracán",
    title_en: "The Peso in the Eye of the Storm",
    desc_es:
      "Banxico sigue con tasas altas mientras la Fed ya empieza a bajarle. ¿Cuánto tiempo más le conviene esa diferencia al peso? Te explicamos el carry trade del MXN sin tecnicismos.",
    desc_en:
      "Banxico's holding rates high while the Fed starts cutting. How much longer can that gap keep favoring the peso? We break down the MXN carry trade in plain English.",
    href: "/casos/fx-banxico-carry",
  },
  {
    tags: "RIESGO · VIX · VOLATILIDAD",
    title_es: "Leer el miedo antes de que llegue",
    title_en: "Reading Fear Before It Arrives",
    desc_es:
      "El VIX y el MOVE son el termómetro del miedo en los mercados. Aquí te decimos cómo leerlos juntos para no agarrarte en curva cuando viene una sacudida.",
    desc_en:
      "VIX and MOVE are basically the market's fear gauge. Here's how to read them together so a sell-off doesn't catch you off guard.",
    href: "/casos/vix-move-fear",
  },
  {
    tags: "MACRO · FED · TASAS",
    title_es: "El juego de las tasas",
    title_en: "The Rate Game",
    desc_es:
      "Cada vez que la Fed mueve un cuarto de punto, se siente en el peso, en los bonos y en todo lo que diga 'mercado emergente'. Te explicamos esa cadena, paso a paso y sin rollo.",
    desc_en:
      "Every quarter-point move from the Fed ripples through MXN, bonds, and basically anything labeled 'emerging market.' Here's that chain reaction, explained simply.",
    href: "/casos/fed-rate-game",
  },
  {
    tags: "DERIVADOS · OPCIONES · COBERTURA",
    title_es: "Cobertura sin miedo",
    title_en: "Hedging Without Fear",
    desc_es:
      "Opciones explicadas desde cero, en español de a pie: qué es delta, qué es theta, y cuándo realmente conviene cubrirte si tienes exposición en divisas o materias primas.",
    desc_en:
      "Options 101 for normal people: what delta and theta actually mean, and when hedging your FX or commodity exposure is genuinely worth it.",
    href: "/casos/options-hedging",
  },
];

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ project, index, isActive, onActivate, isHoverDevice }) {
  const { lang } = useLang();

  const title = lang === "en" ? project.title_en : project.title_es;
  const desc  = lang === "en" ? project.desc_en  : project.desc_es;
  const hint  = isHoverDevice
    ? (lang === "en" ? "HOVER FOR MORE" : "HOVER PARA VER")
    : (lang === "en" ? "TAP FOR MORE"   : "TOCA PARA VER");
  const cta   = lang === "en" ? "READ CASE ↗" : "LEER CASO ↗";

  const handleClick = useCallback((e) => {
    if (isHoverDevice) return;
    e.stopPropagation();
    onActivate(isActive ? null : index);
  }, [isHoverDevice, isActive, index, onActivate]);

  return (
    // Sin role="button": adentro vive el Link del caso y un control interactivo
    // anidado en otro viola WCAG (axe: nested-interactive, auditoría 2026-07-13).
    // Teclado: el Link interno expande la tarjeta al recibir foco (onFocus).
    <div
      onClick={handleClick}
      onMouseEnter={() => isHoverDevice && onActivate(index)}
      onMouseLeave={() => isHoverDevice && onActivate(null)}
      style={{
        position: "relative",
        padding: "28px 24px",
        borderRadius: 12,
        cursor: isHoverDevice ? "default" : "pointer",
        outline: "none",
        border: `1px solid ${isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0)"}`,
        background: isActive
          ? "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 60%, transparent 100%)"
          : "transparent",
        transition: "border-color 0.35s ease, background 0.35s ease",
      }}
    >
      {/* Tag */}
      <div style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase",
        color: "#4A4A50", marginBottom: 10, textAlign: "center",
      }}>
        {project.tags}
      </div>

      {/* Title */}
      <h3 style={{
        fontFamily: "var(--font-serif, Georgia, serif)",
        fontSize: "clamp(17px, 2.2vw, 21px)", fontWeight: 500,
        color: "#F5F5F2", margin: 0, textAlign: "center", lineHeight: 1.3,
        transform: isActive ? "translateY(-3px)" : "translateY(0)",
        transition: "transform 0.35s ease",
      }}>
        {title}
      </h3>

      {/* Expanded content — grid-template-rows trick for smooth height */}
      <div style={{
        display: "grid",
        gridTemplateRows: isActive ? "1fr" : "0fr",
        marginTop: isActive ? 16 : 0,
        transition: "grid-template-rows 0.35s ease, margin-top 0.35s ease",
      }}>
        <div style={{ overflow: "hidden" }}>
          <p style={{
            fontSize: 13, lineHeight: 1.75, color: "#8A8A8E",
            margin: "0 0 14px", textAlign: "center",
          }}>
            {desc}
          </p>
          <div style={{ textAlign: "center" }}>
            <Link
              href={project.href}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => onActivate(index)}
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase",
                color: "#F5F5F2",
                borderBottom: "1px solid rgba(245,245,242,0.35)",
                paddingBottom: 2, textDecoration: "none",
                transition: "border-color 0.2s, color 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.borderColor = "rgba(245,245,242,0.9)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = "#F5F5F2";
                e.currentTarget.style.borderColor = "rgba(245,245,242,0.35)";
              }}
            >
              {cta}
            </Link>
          </div>
        </div>
      </div>

      {/* Collapsed hint */}
      <div style={{
        marginTop: isActive ? 0 : 14,
        maxHeight: isActive ? 0 : 20,
        overflow: "hidden",
        opacity: isActive ? 0 : 1,
        textAlign: "center",
        transition: "opacity 0.2s ease, max-height 0.35s ease, margin-top 0.35s ease",
      }}>
        <span style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase",
          color: "#2E2E34",
        }}>
          {hint}
        </span>
      </div>
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────
export default function ProjectCards() {
  const [activeIdx, setActiveIdx]         = useState(null);
  const [isHoverDevice, setIsHoverDevice] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    setIsHoverDevice(window.matchMedia("(hover: hover)").matches);
  }, []);

  // Tap-outside collapses card on touch devices
  useEffect(() => {
    if (isHoverDevice) return;
    const close = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveIdx(null);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [isHoverDevice]);

  return (
    <section className="reveal" ref={containerRef} style={{ animationDelay: "0.2s" }}>
      <div style={{
        fontSize: 10, letterSpacing: 3, textTransform: "uppercase",
        color: "#4A4A50", marginBottom: 14,
      }}>
        &mdash; <span lang="es">Casos</span>
      </div>

      {/*
        2-col desktop / 1-col mobile grid.
        Dividers: vertical line after left-column cards, horizontal between rows.
        We use a CSS class injected via <style> so it's responsive without JS.
      */}
      <style>{`
        .pc-grid {
          display: grid;
          grid-template-columns: 1fr;
        }
        .pc-cell {
          border-top: 1px solid #1E1E22;
        }
        .pc-cell:first-child {
          border-top: none;
        }
        @media (min-width: 640px) {
          .pc-grid {
            grid-template-columns: 1fr 1fr;
          }
          .pc-cell {
            border-top: none;
            border-right: none;
          }
          /* Top border for row 2 (indices 2,3) */
          .pc-cell:nth-child(n+3) {
            border-top: 1px solid #1E1E22;
          }
          /* Right border for left-column cards (odd children: 1,3) */
          .pc-cell:nth-child(odd) {
            border-right: 1px solid #1E1E22;
          }
        }
      `}</style>

      <div className="pc-grid">
        {PROJECTS.map((p, i) => (
          <div key={i} className="pc-cell">
            <Card
              project={p}
              index={i}
              isActive={activeIdx === i}
              onActivate={setActiveIdx}
              isHoverDevice={isHoverDevice}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

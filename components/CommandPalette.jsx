"use client";
// components/CommandPalette.jsx
// Terminal del sitio: ⌘K / Ctrl+K (o el botón del nav → evento riskon:palette)
// abre un buscador global — páginas, activos (deep-links de /markets y
// /analisis), views recientes (parseados de /feed.xml) y acciones (idioma,
// copiar link). Navegación con ↑↓ + ↵, Esc cierra. Los deep-links con query o
// hash navegan con location.assign (las páginas los leen de location.search al
// montar — un push del router sobre la misma ruta no remonta).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLang } from "./Lang";

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const PAGES = [
  { es: "Inicio", en: "Home", href: "/" },
  { es: "Archivo de views", en: "Views archive", href: "/archive" },
  { es: "Mercados", en: "Markets", href: "/markets" },
  { es: "Análisis técnico", en: "Technical analysis", href: "/analisis" },
  { es: "Índice · track record", en: "Index · track record", href: "/indice" },
  { es: "Aprende", en: "Learn", href: "/learn" },
  { es: "Contacto", en: "Contact", href: "/about" },
  { es: "Suscríbete al Pre-Market", en: "Subscribe to the Pre-Market", href: "/suscribete" },
  { es: "Las 4 bandas del índice", en: "The index's 4 bands", href: "/#bandas", hard: true },
];

const ASSETS = [
  { label: "USD/MXN", href: "/markets?pair=USDMXN", hard: true },
  { label: "EUR/MXN", href: "/markets?pair=EURMXN", hard: true },
  { label: "EUR/USD", href: "/markets?pair=EURUSD", hard: true },
  { label: "GBP/USD", href: "/markets?pair=GBPUSD", hard: true },
  { label: "USD/JPY", href: "/markets?pair=USDJPY", hard: true },
  { label: "S&P 500", href: "/analisis?symbol=^GSPC", hard: true },
  { label: "Nasdaq", href: "/analisis?symbol=^IXIC", hard: true },
  { label: "IPC México", href: "/analisis?symbol=^MXX", hard: true },
  { label: "Bitcoin", href: "/analisis?symbol=BTC-USD", hard: true },
  { label: "Oro · Gold", href: "/analisis?symbol=GC=F", hard: true },
  { label: "WTI", href: "/analisis?symbol=CL=F", hard: true },
  { label: "DXY", href: "/analisis?symbol=DX-Y.NYB", hard: true },
  { label: "US 10Y", href: "/analisis?symbol=^TNX", hard: true },
];

export default function CommandPalette() {
  const { lang, setLang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [views, setViews] = useState(null); // de /feed.xml, cache de la sesión
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── Apertura: atajo global + evento del botón del nav ──────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("riskon:palette", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("riskon:palette", onEvt);
    };
  }, []);

  // ── Al abrir: focus, scroll-lock, cargar views del feed una sola vez ──────
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    setCopied(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());

    if (views === null) {
      fetch("/feed.xml")
        .then((r) => (r.ok ? r.text() : null))
        .then((xml) => {
          if (!xml) return setViews([]);
          const doc = new DOMParser().parseFromString(xml, "text/xml");
          const items = [...doc.querySelectorAll("item")].slice(0, 10).map((it) => ({
            title: it.querySelector("title")?.textContent ?? "",
            href: new URL(it.querySelector("link")?.textContent ?? "/", location.origin).pathname,
          }));
          setViews(items);
        })
        .catch(() => setViews([]));
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, views]);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback(
    (item) => {
      close();
      if (item.action) return item.action();
      if (item.hard) location.assign(item.href);
      else router.push(item.href);
    },
    [close, router]
  );

  // ── Catálogo + filtro ──────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const t = (es, en) => (lang === "en" ? en : es);
    const actions = [
      {
        label: t("Cambiar idioma → EN", "Switch language → ES"),
        action: () => setLang(lang === "en" ? "es" : "en"),
        keywords: "idioma language english español",
      },
      {
        label: copied ? t("¡Link copiado!", "Link copied!") : t("Copiar link de esta página", "Copy this page's link"),
        action: () => {
          navigator.clipboard?.writeText(location.href).catch(() => {});
          setCopied(true);
          setTimeout(close, 650);
        },
        keep: true, // no cerrar de inmediato: muestra la confirmación
        keywords: "copiar copy link url compartir share",
      },
    ];
    const all = [
      { key: "pages", title: t("Páginas", "Pages"), items: PAGES.map((p) => ({ ...p, label: t(p.es, p.en) })) },
      { key: "assets", title: t("Activos", "Assets"), items: ASSETS },
      { key: "views", title: t("Views recientes", "Recent views"), items: views ?? [] },
      { key: "actions", title: t("Acciones", "Actions"), items: actions },
    ];
    const q = norm(query.trim());
    if (!q) {
      // Sin búsqueda: páginas + primeros views + acciones (catálogo navegable)
      return all
        .map((g) => ({ ...g, items: g.key === "views" ? g.items.slice(0, 3) : g.items }))
        .filter((g) => g.items.length);
    }
    return all
      .map((g) => ({
        ...g,
        items: g.items
          .filter((it) => norm(`${it.label} ${it.keywords ?? ""} ${it.href ?? ""}`).includes(q))
          .sort((a, b) => (norm(a.label).startsWith(q) ? -1 : 0) - (norm(b.label).startsWith(q) ? -1 : 0)),
      }))
      .filter((g) => g.items.length);
  }, [lang, query, views, copied, setLang, close]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // ── Teclado dentro del palette ─────────────────────────────────────────────
  const onKeyDown = (e) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && flat[sel]) {
      const item = flat[sel];
      if (item.keep) item.action();
      else go(item);
    }
  };

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  let idx = -1;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === "en" ? "Command palette" : "Paleta de comandos"}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        animation: "pageFade 0.18s ease both",
      }}
    >
      <div
        style={{
          margin: "12vh auto 0",
          width: "min(92vw, 560px)",
          borderRadius: 14,
          background: "#0B0B0C",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.85)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={lang === "en" ? "Search pages, assets, views…" : "Busca páginas, activos, views…"}
          aria-label={lang === "en" ? "Search" : "Buscar"}
          style={{
            width: "100%", padding: "16px 18px",
            background: "transparent", border: "none", outline: "none",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            color: "#F5F5F2", fontSize: 15, fontFamily: "var(--font-sans)",
          }}
        />
        <div ref={listRef} style={{ maxHeight: "48vh", overflowY: "auto", padding: "6px 0 8px" }}>
          {flat.length === 0 && (
            <div style={{ padding: "18px 18px 14px", fontSize: 13, color: "#8A8A8E" }}>
              {lang === "en" ? "Nothing matches — try an asset or a page." : "Nada coincide — prueba un activo o una página."}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{
                padding: "10px 18px 5px",
                fontFamily: "var(--font-mono)", fontSize: 11,
                letterSpacing: 2, textTransform: "uppercase", color: "#8A8A8E",
              }}>
                {g.title}
              </div>
              {g.items.map((item) => {
                idx++;
                const i = idx;
                const active = i === sel;
                return (
                  <button
                    key={`${g.key}-${item.href ?? item.label}`}
                    data-idx={i}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => (item.keep ? item.action() : go(item))}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "9px 18px", textAlign: "left",
                      background: active ? "rgba(255,255,255,0.06)" : "transparent",
                      border: "none",
                      borderLeft: `2px solid ${active ? "#F5F5F2" : "transparent"}`,
                      color: active ? "#F5F5F2" : "#B9BDC4",
                      fontSize: 13.5, cursor: "pointer",
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                    {item.href && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8A8A8E", flexShrink: 0 }}>
                        {item.href.split("?")[0]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{
          display: "flex", gap: 14, padding: "9px 18px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: "#8A8A8E",
        }}>
          <span>↑↓ {lang === "en" ? "navigate" : "navegar"}</span>
          <span>↵ {lang === "en" ? "open" : "abrir"}</span>
          <span>esc {lang === "en" ? "close" : "cerrar"}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

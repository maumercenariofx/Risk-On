"use client";
// components/Nav.jsx
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLang, T } from "./Lang";

export default function Nav() {
  const { lang, setLang } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // En la landing, arriba de todo, el nav flota TRANSPARENTE sobre el globo
  // (hero a pantalla completa); se vuelve sólido al scrollear o abrir el menú.
  const overlay = pathname === "/" && !scrolled && !open;

  // En páginas CON form en pantalla ("/" y "/suscribete") el CTA hace scroll al
  // form. En móvil el contenido async (cards, datos) carga DESPUÉS y empuja el
  // form hacia abajo, así que el hash nativo aterriza arriba → reintentos tras
  // el reflow. Desde cualquier otra página navega a la landing /suscribete.
  const handleSubscribe = (e) => {
    setOpen(false);
    if (pathname === "/" || pathname === "/suscribete") {
      e.preventDefault();
      const go = () => document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth", block: "start" });
      go();
      setTimeout(go, 300);
      setTimeout(go, 800);
    }
    // En otras páginas dejamos que el <Link> navegue a /suscribete.
  };

  const links = [
    { href: "/", es: "Inicio", en: "Home" },
    { href: "/archive", es: "Archivo", en: "Archive" },
    { href: "/markets", es: "Mercados", en: "Markets" },
    { href: "/analisis", es: "Análisis", en: "Analysis" },
    { href: "/indice", es: "Índice", en: "Index" },
    { href: "/learn", es: "Aprende", en: "Learn" },
    { href: "/about", es: "Contacto", en: "Contact" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-500 ${
        overlay ? "border-transparent bg-transparent" : "border-edge bg-black"
      }`}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex flex-col leading-tight" onClick={() => setOpen(false)}>
          <span className="font-serif text-2xl font-medium tracking-tight text-bone">Risk On</span>
          <span className="text-[10px] tracking-wide text-muted">
            <T es="Views diarios de Mauricio Mercenario" en="Daily views by Mauricio Mercenario" />
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`nav-link text-sm transition-colors hover:text-bone ${
                  active ? "is-active text-bone" : "text-muted"
                }`}
              >
                <T es={l.es} en={l.en} />
              </Link>
            );
          })}
          <Link
            href="/suscribete"
            onClick={handleSubscribe}
            className="rounded-md border border-bone/50 bg-white/10 px-3 py-1.5 text-sm font-medium text-bone transition-colors hover:bg-white/15"
          >
            <T es="Suscríbete" en="Subscribe" />
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Command palette: atajo visible en desktop, lupa en móvil */}
          <button
            onClick={() => window.dispatchEvent(new Event("riskon:palette"))}
            aria-label={lang === "en" ? "Open command palette" : "Abrir buscador"}
            className="mr-1 hidden items-center gap-1 rounded-md border border-edge px-2.5 py-[5px] font-mono text-[10px] tracking-widest text-muted transition-colors hover:border-[#3A3A3E] hover:text-bone md:flex"
          >
            {isMac ? "⌘" : "CTRL"} K
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("riskon:palette"))}
            aria-label={lang === "en" ? "Search" : "Buscar"}
            className="mr-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-edge text-muted transition-colors hover:text-bone md:hidden"
            style={{ fontSize: 15, lineHeight: 1 }}
          >
            ⌕
          </button>
          {["es", "en"].map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                lang === l
                  ? "border-bone/50 bg-white/10 text-bone"
                  : "border-edge text-muted hover:text-bone"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={lang === "en" ? "Toggle menu" : "Abrir menú"}
            aria-expanded={open}
            className="ml-1 flex h-8 w-8 flex-col items-center justify-center gap-[5px] rounded-md border border-edge transition-colors hover:border-[#3A3A3E] md:hidden"
          >
            <span className={`block h-px w-4 bg-bone transition-transform duration-300 ${open ? "translate-y-[6px] rotate-45" : ""}`} />
            <span className={`block h-px w-4 bg-bone transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`block h-px w-4 bg-bone transition-transform duration-300 ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown panel — grid-rows: se anima sin adivinar alturas
          (con maxHeight fijo el menú se cortaba al crecer la lista de links) */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out md:hidden ${
          open ? "grid-rows-[1fr] border-t border-edge" : "grid-rows-[0fr]"
        }`}
        style={{ opacity: open ? 1 : 0 }}
      >
        <div className={`mx-auto flex min-h-0 w-full max-w-5xl flex-col overflow-hidden px-5 ${open ? "py-2" : "py-0"}`}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`border-b border-edge/60 py-3 text-sm transition-colors last:border-none ${
                pathname === l.href ? "text-bone" : "text-muted hover:text-bone"
              }`}
            >
              <T es={l.es} en={l.en} />
            </Link>
          ))}
          <Link
            href="/suscribete"
            onClick={handleSubscribe}
            className="mt-3 rounded-md border border-bone/50 bg-white/10 py-2.5 text-center text-sm font-medium text-bone"
          >
            <T es="Suscríbete" en="Subscribe" />
          </Link>
        </div>
      </div>
    </header>
  );
}

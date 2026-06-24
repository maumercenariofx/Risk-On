"use client";
// components/Nav.jsx
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLang, T } from "./Lang";

export default function Nav() {
  const { lang, setLang } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Scroll al formulario de suscripción. En móvil el contenido async (cards,
  // datos) carga DESPUÉS y empuja el form hacia abajo, así que el hash nativo
  // aterriza arriba del form → reintentamos el scroll tras el reflow.
  const handleSubscribe = (e) => {
    setOpen(false);
    if (pathname === "/") {
      e.preventDefault();
      const go = () => document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth", block: "start" });
      go();
      setTimeout(go, 300);
      setTimeout(go, 800);
    }
    // En otras páginas dejamos que el <Link> navegue a /#subscribe.
  };

  const links = [
    { href: "/", es: "Inicio", en: "Home" },
    { href: "/archive", es: "Archivo", en: "Archive" },
    { href: "/markets", es: "Mercados", en: "Markets" },
    { href: "/learn", es: "Aprende", en: "Learn" },
    { href: "/about", es: "Contacto", en: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-black">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex flex-col leading-tight" onClick={() => setOpen(false)}>
          <span className="font-serif text-2xl font-medium tracking-tight text-bone">Risk On</span>
          <span className="text-[10px] tracking-wide text-muted">
            <T es="Views diarios de Mauricio Mercenario" en="Daily views by Mauricio Mercenario" />
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-bone"
            >
              <T es={l.es} en={l.en} />
            </Link>
          ))}
          <Link
            href="/#subscribe"
            onClick={handleSubscribe}
            className="rounded-md border border-bone/50 bg-white/10 px-3 py-1.5 text-sm font-medium text-bone transition-colors hover:bg-white/15"
          >
            <T es="Suscríbete" en="Subscribe" />
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
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

      {/* Mobile dropdown panel */}
      <div
        className="overflow-hidden border-t border-edge transition-[max-height,opacity] duration-300 ease-in-out md:hidden"
        style={{ maxHeight: open ? 280 : 0, opacity: open ? 1 : 0 }}
      >
        <div className="mx-auto flex max-w-5xl flex-col px-5 py-2">
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
            href="/#subscribe"
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

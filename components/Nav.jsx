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

  const links = [
    { href: "/", es: "Inicio", en: "Home" },
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
            <T es="vistas diarias por Mauricio Mercenario" en="daily views by Mauricio Mercenario" />
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
        </div>
      </div>
    </header>
  );
}

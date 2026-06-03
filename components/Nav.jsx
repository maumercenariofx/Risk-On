"use client";
// components/Nav.jsx
import Link from "next/link";
import { useLang, T } from "./Lang";

export default function Nav() {
  const { lang, setLang } = useLang();
  const links = [
    { href: "/", es: "Inicio", en: "Home" },
    { href: "/markets", es: "Mercados", en: "Markets" },
    { href: "/learn", es: "Aprende", en: "Learn" },
    { href: "/archive", es: "Archivo", en: "Archive" },
    { href: "/about", es: "Sobre mí", en: "About" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-gold/15 bg-ink/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link href="/" className="font-serif text-2xl font-medium tracking-tight">
          Risk<span className="text-gold"> On</span>
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
                  ? "border-gold bg-gold text-ink"
                  : "border-gold/30 text-muted hover:text-bone"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

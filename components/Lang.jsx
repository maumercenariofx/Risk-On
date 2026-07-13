"use client";
// components/Lang.jsx
// Manejo simple de idioma ES/EN compartido en todo el sitio.
import { createContext, useContext, useState, useEffect } from "react";

const LangContext = createContext({ lang: "es", setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage?.getItem("riskon-lang");
    if (saved === "en" || saved === "es") setLang(saved);
  }, []);
  // El <html lang> del SSR es "es" fijo; se sincroniza con el idioma real del
  // lector (screen readers y SEO — auditoría 2026-07-13).
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);
  const set = (l) => {
    setLang(l);
    try { window.localStorage.setItem("riskon-lang", l); } catch {}
  };
  return <LangContext.Provider value={{ lang, setLang: set }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

// Helper: <T es="Hola" en="Hi" />
export function T({ es, en }) {
  const { lang } = useLang();
  return <>{lang === "en" ? en : es}</>;
}

// Helper para strings (no JSX)
export function t(lang, es, en) {
  return lang === "en" ? en : es;
}

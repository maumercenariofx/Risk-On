"use client";
// components/Lang.jsx
// Manejo simple de idioma ES/EN compartido en todo el sitio.
import { createContext, useContext, useState, useEffect } from "react";

const LangContext = createContext({ lang: "es", setLang: () => {} });

// `force`: fija el idioma e ignora localStorage y navigator. Lo usan las rutas
// /en/*, que existen para que Google indexe el corpus en inglés — ahí el
// contenido ES inglés por definición y el toggle no debe poder cambiarlo
// (auditoría 2026-08-21: 59 views con body_en completo, ~25,700 palabras,
// invisibles porque vivían en una sola URL con un toggle de cliente).
export function LangProvider({ children, force = null }) {
  // Arranca en ES: el <html lang> del SSR es "es" y la audiencia declarada es
  // México. Estaba en "en" y todo visitante nuevo veía el sitio en inglés
  // mientras Google indexaba contenido EN bajo lang="es" (auditoría 2026-08-21).
  const [lang, setLang] = useState(force ?? "es");
  useEffect(() => {
    if (force) return; // ruta con idioma fijo: ni localStorage ni navigator mandan
    const saved = typeof window !== "undefined" && window.localStorage?.getItem("riskon-lang");
    if (saved === "en" || saved === "es") { setLang(saved); return; }
    // Sin preferencia guardada: respetamos el idioma del navegador. Solo un
    // navegador declarado en inglés cambia; cualquier otro se queda en ES.
    const nav = typeof navigator !== "undefined" ? navigator.language : "";
    if (typeof nav === "string" && nav.toLowerCase().startsWith("en")) setLang("en");
  }, []);
  // El <html lang> del SSR es "es" fijo; se sincroniza con el idioma real del
  // lector (screen readers y SEO — auditoría 2026-07-13).
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);
  const set = (l) => {
    if (force) return; // no-op donde el idioma es parte de la URL
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

// app/sitemap.js
// Sitemap dinámico: rutas fijas + cada view del archivo + cada caso educativo.
import { getAllPostsMeta, getAllRecapSlugs } from "../lib/posts";
import { getAllCaseSlugs } from "../lib/cases";

const SITE = "https://riskon.lat";

export default function sitemap() {
  const fixed = ["", "/archive", "/markets", "/analisis", "/learn", "/about", "/indice", "/metodologia", "/alertas", "/suscribete"].map(
    (p) => ({
      url: `${SITE}${p}`,
      changeFrequency: p === "" || p === "/archive" ? "daily" : "weekly",
      priority: p === "" ? 1 : p === "/suscribete" ? 0.8 : 0.7,
    })
  );

  // Cada view entra DOS veces, una por idioma, con sus alternates. Los 59
  // body_en (~25,700 palabras) llevaban meses sin poder indexarse porque solo
  // existía una URL (auditoría 2026-08-21).
  const alternates = (slug) => ({
    languages: {
      "es-MX": `${SITE}/archive/${slug}`,
      en: `${SITE}/en/archive/${slug}`,
    },
  });
  const posts = getAllPostsMeta().flatMap((p) => [
    {
      url: `${SITE}/archive/${p.slug}`,
      lastModified: new Date(`${p.slug}T13:00:00Z`),
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: alternates(p.slug),
    },
    {
      url: `${SITE}/en/archive/${p.slug}`,
      lastModified: new Date(`${p.slug}T13:00:00Z`),
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: alternates(p.slug),
    },
  ]);

  const cases = getAllCaseSlugs().map((slug) => ({
    url: `${SITE}/casos/${slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Los recaps semanales llevaban desde julio sin entrar aquí porque no
  // tenían URL (auditoría 2026-08-21). Prioridad 0.65: por encima de un view
  // diario, porque son evergreen y cierran el arco de la semana.
  const recaps = getAllRecapSlugs().map((slug) => ({
    url: `${SITE}/recap/${slug}`,
    lastModified: new Date(`${slug}T22:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  return [...fixed, ...posts, ...recaps, ...cases];
}

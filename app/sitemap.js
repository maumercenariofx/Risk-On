// app/sitemap.js
// Sitemap dinámico: rutas fijas + cada view del archivo + cada caso educativo.
import { getAllPostsMeta } from "../lib/posts";
import { getAllCaseSlugs } from "../lib/cases";

const SITE = "https://riskon.lat";

export default function sitemap() {
  const fixed = ["", "/archive", "/markets", "/analisis", "/learn", "/about", "/indice"].map(
    (p) => ({
      url: `${SITE}${p}`,
      changeFrequency: p === "" || p === "/archive" ? "daily" : "weekly",
      priority: p === "" ? 1 : 0.7,
    })
  );

  const posts = getAllPostsMeta().map((p) => ({
    url: `${SITE}/archive/${p.slug}`,
    lastModified: new Date(`${p.slug}T13:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const cases = getAllCaseSlugs().map((slug) => ({
    url: `${SITE}/casos/${slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...fixed, ...posts, ...cases];
}

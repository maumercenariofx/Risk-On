// lib/posts.js
// Lee las ediciones diarias escritas en Markdown desde /content.
// Cada archivo .md tiene front-matter: title_es, title_en, date, score.
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const DIR = path.join(process.cwd(), "content");

export function getAllSlugs() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

export function getAllPostsMeta() {
  return getAllSlugs()
    .map((slug) => {
      const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
      const { data } = matter(raw);
      return { slug, ...data };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPost(slug) {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
  const { data, content } = matter(raw);
  // Cuerpo ES = contenido markdown; cuerpo EN = front-matter body_en (artículo
  // completo en inglés). Las notas viejas sin body_en caen al ES (fallback).
  const html_es = (await remark().use(html).process(content)).toString();
  const html_en = String(data.body_en ?? "").trim()
    ? (await remark().use(html).process(String(data.body_en))).toString()
    : html_es;
  return { slug, ...data, html: html_es, html_es, html_en };
}

// Notas adyacentes (orden cronológico). posts[0] = más reciente.
export function getAdjacentPosts(slug) {
  const posts = getAllPostsMeta();
  const i = posts.findIndex((p) => p.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: posts[i + 1] ?? null, // más antigua
    next: posts[i - 1] ?? null, // más reciente
  };
}

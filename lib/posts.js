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
  const processed = await remark().use(html).process(content);
  return { slug, ...data, html: processed.toString() };
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

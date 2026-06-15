// lib/cases.js
// Lee los artículos de fondo ("Casos") desde /content/cases.
// Cada archivo .md tiene front-matter: tags, title_es/en, body_es/en (markdown).
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const DIR = path.join(process.cwd(), "content/cases");

export function getAllCaseSlugs() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

export async function getCase(slug) {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
  const { data } = matter(raw);
  const [es, en] = await Promise.all([
    remark().use(html).process(data.body_es || ""),
    remark().use(html).process(data.body_en || ""),
  ]);
  return { slug, ...data, html_es: es.toString(), html_en: en.toString() };
}

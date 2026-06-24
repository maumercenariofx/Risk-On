// app/api/backfill-en/route.js
// One-time / on-demand: traduce al inglés el CUERPO de los views existentes que
// aún no tienen `body_en`, y re-publica content/<slug>.md vía GitHub (dispara
// redeploy → la nota queda bilingüe en /archive). Protegido con CRON_SECRET.
// Procesa en lotes (?limit=N, máx 6) para caber en el límite de 60s de Vercel.
//   curl -X POST "https://riskon.lat/api/backfill-en?limit=4" -H "Authorization: Bearer <CRON_SECRET>"
// Repetir hasta que devuelva remaining: 0.

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import Anthropic from "@anthropic-ai/sdk";
import { publishToGitHub } from "../../../lib/dailyView";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIR = path.join(process.cwd(), "content");

const SYSTEM =
  "You are a professional financial translator (Spanish→English) for a markets newsletter. " +
  "Translate the given Markdown faithfully into natural, professional English. " +
  "Preserve ALL Markdown EXACTLY: '### ' headings, *italics*, blank lines, the leading italic " +
  "greeting and the closing '— *...*' sign-off. Keep every number, ticker, percentage and level " +
  "identical. Do NOT add or remove content. Output ONLY the translated Markdown — no preamble.";

async function translate(anthropic, esMarkdown) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: SYSTEM,
    messages: [{ role: "user", content: esMarkdown }],
  });
  return msg.content?.[0]?.text?.trim() ?? "";
}

async function handler(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 503 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "4", 10) || 4, 6);
  const onlySlug = url.searchParams.get("slug");

  const slugs = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  const pending = [];
  for (const slug of slugs) {
    const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8");
    const { data, content } = matter(raw);
    const hasEn = String(data.body_en ?? "").trim().length > 0;
    if (onlySlug ? slug === onlySlug : !hasEn) pending.push({ slug, data, content });
  }

  const batch = pending.slice(0, limit);
  if (!batch.length) return Response.json({ ok: true, done: true, remaining: 0 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const processed = await Promise.all(
    batch.map(async ({ slug, data, content }) => {
      try {
        const en = await translate(anthropic, content);
        if (!en) return { slug, ok: false, error: "empty translation" };
        // ES intacto en el cuerpo; EN completo en front-matter body_en (lo
        // renderiza lib/posts.js → html_en). Conserva el resto del front-matter.
        const md = matter.stringify(`\n${content.trim()}\n`, { ...data, body_en: en });
        const pub = await publishToGitHub(slug, md);
        return { slug, ok: pub.ok, error: pub.error };
      } catch (e) {
        return { slug, ok: false, error: String(e?.message ?? e) };
      }
    })
  );

  const okCount = processed.filter((r) => r.ok).length;
  return Response.json({ ok: true, processed, remaining: pending.length - okCount });
}

export { handler as GET, handler as POST };

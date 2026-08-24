// app/feed.xml/route.js
// RSS 2.0 de los views diarios — para lectores de feeds y agregadores.
// Se regenera con cada deploy (el cron diario redeploya al publicar).
import { getAllPostsMeta, getAllRecapsMeta } from "../../lib/posts";

const SITE = "https://riskon.lat";
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  // Views diarios + recaps semanales, mezclados por fecha. Los recaps
  // llevaban meses fuera del feed por no tener URL (auditoría 2026-08-21).
  const posts = getAllPostsMeta().slice(0, 30).map((p) => ({
    title: p.title_es,
    url: `${SITE}/archive/${p.slug}`,
    ts: new Date(`${p.slug}T13:00:00Z`),
    desc: `${esc(p.summary_es)} (Risk On score: ${esc(p.score)}/100)`,
  }));
  const recaps = getAllRecapsMeta().slice(0, 12).map((r) => ({
    title: `[Recap semanal] ${r.title_es}`,
    url: `${SITE}/recap/${r.slug}`,
    // 22:00 UTC = después del cierre del viernes: el recap va DESPUÉS del view
    // de ese mismo día en el orden del feed.
    ts: new Date(`${r.slug}T22:00:00Z`),
    desc: esc(r.summary_es ?? r.title_es ?? ""),
  }));
  const items = [...posts, ...recaps]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 40)
    .map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${p.ts.toUTCString()}</pubDate>
      <description>${p.desc}</description>
    </item>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Risk On — El Pre-Market</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>El view pre-market diario de Mauricio Mercenario: índice Risk On, contexto macro y foco en el peso mexicano.</description>
    <language>es-mx</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

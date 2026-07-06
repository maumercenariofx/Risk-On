// app/feed.xml/route.js
// RSS 2.0 de los views diarios — para lectores de feeds y agregadores.
// Se regenera con cada deploy (el cron diario redeploya al publicar).
import { getAllPostsMeta } from "../../lib/posts";

const SITE = "https://riskon.lat";
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const posts = getAllPostsMeta().slice(0, 30);
  const items = posts.map((p) => `    <item>
      <title>${esc(p.title_es)}</title>
      <link>${SITE}/archive/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/archive/${p.slug}</guid>
      <pubDate>${new Date(`${p.slug}T13:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.summary_es)} (Risk On score: ${esc(p.score)}/100)</description>
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

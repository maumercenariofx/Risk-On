// app/api/news/route.js
// Noticias recientes (últimas ~48h) por país, vía Google News RSS — sin API key.
export const revalidate = 1800;

const QUERIES = {
  mx: { es: "México economía OR peso OR Banxico mercados", en: "Mexico economy OR peso OR Banxico markets" },
  us: { es: "economía Estados Unidos OR Fed mercados",      en: "US economy OR Federal Reserve markets" },
  cn: { es: "China economía mercados",                       en: "China economy markets" },
  br: { es: "Brasil economía OR real mercados",              en: "Brazil economy OR real markets" },
  tr: { es: "Turquía economía OR lira mercados",             en: "Turkey economy OR lira markets" },
  jp: { es: "Japón economía OR yen OR BOJ mercados",         en: "Japan economy OR yen OR BOJ markets" },
  gb: { es: "Reino Unido economía OR libra mercados",        en: "UK economy OR pound OR BOE markets" },
  de: { es: "Alemania economía OR euro OR BCE mercados",     en: "Germany economy OR euro OR ECB markets" },
  in: { es: "India economía OR rupia mercados",              en: "India economy OR rupee markets" },
  kr: { es: "Corea del Sur economía OR won mercados",        en: "South Korea economy OR won markets" },
  za: { es: "Sudáfrica economía OR rand mercados",           en: "South Africa economy OR rand markets" },
  ar: { es: "Argentina economía OR peso argentino mercados", en: "Argentina economy OR peso markets" },
  cl: { es: "Chile economía OR peso chileno mercados",       en: "Chile economy OR peso markets" },
  co: { es: "Colombia economía OR peso colombiano mercados", en: "Colombia economy OR peso markets" },
};

const LOCALE = {
  es: { hl: "es-419", gl: "MX", ceid: "MX:es-419" },
  en: { hl: "en-US",  gl: "US", ceid: "US:en" },
};

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    let title     = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link    = decodeEntities((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    const source  = decodeEntities((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "");
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3));
    }
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "mx";
  const lang    = searchParams.get("lang") === "en" ? "en" : "es";

  const q = QUERIES[country]?.[lang] || QUERIES.mx[lang];
  const { hl, gl, ceid } = LOCALE[lang];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(String(res.status));
    const xml = await res.text();

    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const items = parseItems(xml)
      .filter((it) => {
        const t = new Date(it.pubDate).getTime();
        return isNaN(t) || t >= twoDaysAgo;
      })
      .slice(0, 5);

    return Response.json({ country, items }, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json({ country, items: [] }, { status: 200 });
  }
}

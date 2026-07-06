// app/api/news/route.js
// Noticias recientes (últimas ~48h) por país, vía Google News RSS — sin API key.
export const revalidate = 1800;

// Frases ENTRECOMILLADAS: sueltas, Google News en español mezclaba países
// (p.ej. pedías EU y llegaba el peso colombiano) o devolvía casi nada.
const QUERIES = {
  mx: { es: '"Banxico" OR "peso mexicano" OR "economía de México"',            en: "Mexico economy OR peso OR Banxico markets" },
  us: { es: '"Reserva Federal" OR "Wall Street" OR "economía de Estados Unidos"', en: "US economy OR Federal Reserve markets" },
  cn: { es: '"economía de China" OR "mercados chinos" OR "yuan"',              en: "China economy markets" },
  br: { es: '"economía de Brasil" OR "real brasileño" OR "banco central de Brasil"', en: "Brazil economy OR real markets" },
  tr: { es: '"economía de Turquía" OR "lira turca"',                           en: "Turkey economy OR lira markets" },
  jp: { es: '"Banco de Japón" OR "economía de Japón" OR "yen"',                en: "Japan economy OR yen OR BOJ markets" },
  gb: { es: '"economía de Reino Unido" OR "libra esterlina" OR "Banco de Inglaterra"', en: "UK economy OR pound OR BOE markets" },
  de: { es: '"economía de Alemania" OR "Banco Central Europeo" OR "zona euro"', en: "Germany economy OR euro OR ECB markets" },
  in: { es: '"economía de India" OR "rupia india"',                            en: "India economy OR rupee markets" },
  kr: { es: '"economía de Corea del Sur" OR "won surcoreano"',                 en: "South Korea economy OR won markets" },
  za: { es: '"economía de Sudáfrica" OR "rand sudafricano"',                   en: "South Africa economy OR rand markets" },
  ar: { es: '"economía argentina" OR "peso argentino" OR "banco central argentino"', en: "Argentina economy OR peso markets" },
  cl: { es: '"economía chilena" OR "peso chileno" OR "banco central de Chile"', en: "Chile economy OR peso markets" },
  co: { es: '"economía colombiana" OR "peso colombiano" OR "Banco de la República"', en: "Colombia economy OR peso markets" },
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

async function fetchFeed(country, lang) {
  const q = QUERIES[country]?.[lang] || QUERIES.mx[lang];
  const { hl, gl, ceid } = LOCALE[lang];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(String(res.status));
  const xml = await res.text();
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  return parseItems(xml).filter((it) => {
    const t = new Date(it.pubDate).getTime();
    return isNaN(t) || t >= twoDaysAgo;
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "mx";
  const lang    = searchParams.get("lang") === "en" ? "en" : "es";

  try {
    let items = await fetchFeed(country, lang);

    // La prensa en español cubre poco a varios países del radar: si el feed
    // ES viene flaco, completa con el feed EN (mejor una nota fresca en
    // inglés que un panel vacío o una nota de hace dos días).
    if (lang === "es" && items.length < 3) {
      try {
        const enItems = await fetchFeed(country, "en");
        const seen = new Set(items.map((i) => i.title.toLowerCase()));
        for (const it of enItems) {
          if (!seen.has(it.title.toLowerCase())) items.push(it);
        }
      } catch {}
    }

    // Más recientes primero, tope 5.
    items = items
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 5);

    return Response.json({ country, items }, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json({ country, items: [] }, { status: 200 });
  }
}

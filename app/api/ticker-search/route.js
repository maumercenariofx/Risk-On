// app/api/ticker-search/route.js
// Autocomplete for the portfolio builder's ticker input — proxies Yahoo
// Finance's search/autocomplete endpoint so typing "a" suggests Apple, AMD,
// etc. and typing "am" narrows down to symbols/names actually matching "am".

export const dynamic = "force-dynamic";

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 1) return Response.json({ results: [] });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
    const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
    if (!res.ok) return Response.json({ results: [] });

    const json   = await res.json();
    const quotes = json?.quotes ?? [];
    const results = quotes
      .filter((qt) => qt.symbol && (qt.shortname || qt.longname))
      .map((qt) => ({
        symbol: qt.symbol,
        name:   qt.shortname ?? qt.longname,
        type:   qt.quoteType ?? "",
        exch:   qt.exchange ?? "",
      }));

    return Response.json({ results }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ results: [] });
  }
}

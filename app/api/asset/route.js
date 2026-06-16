// app/api/asset/route.js
// On-demand historical data for any Yahoo Finance symbol.
// Used by the portfolio builder — user types a ticker, we fetch 1Y daily closes.

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(request) {
  const sym = new URL(request.url).searchParams
    .get("symbol")
    ?.trim()
    .toUpperCase();

  if (!sym) {
    return Response.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });

    if (!res.ok) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return Response.json({ error: "no data" }, { status: 404 });

    const meta   = result.meta ?? {};
    const ts     = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];

    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c)) continue;
      points.push({
        date:  new Date(ts[i] * 1000).toISOString().slice(0, 10),
        close: c,
      });
    }

    if (points.length < 5) {
      return Response.json({ error: "insufficient data" }, { status: 404 });
    }

    const name     = meta.longName ?? meta.shortName ?? sym;
    const currency = meta.currency ?? "USD";
    const current  = meta.regularMarketPrice ?? points[points.length - 1].close;

    return Response.json({ symbol: sym, name, currency, current, points }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ error: "fetch failed" }, { status: 500 });
  }
}

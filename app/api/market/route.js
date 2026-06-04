// app/api/market/route.js
// Fuentes: Yahoo Finance (indices, acciones, cripto, VIX, DXY)
//          Frankfurter (divisas FX)
//          Stooq (MOVE index, no disponible en Yahoo)
// Cache: 20 min (s-maxage=1200)

export const revalidate = 1200;

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahooQuotes(symbols) {
  try {
    const url =
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
      symbols.join(",") +
      "&fields=regularMarketPrice,regularMarketChangePercent";
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const map = {};
    for (const r of json?.quoteResponse?.result ?? []) {
      map[r.symbol] = {
        price: r.regularMarketPrice ?? null,
        chgPct: r.regularMarketChangePercent ?? null,
      };
    }
    return map;
  } catch {
    return {};
  }
}

async function stooqLast(symbol) {
  try {
    const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetch(url, { next: { revalidate } });
    const text = await res.text();
    const cols = text.trim().split("\n")[1]?.split(",") ?? [];
    const close = parseFloat(cols[6]);
    return isNaN(close) ? null : close;
  } catch {
    return null;
  }
}

async function fxRate(base, quote) {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${base}&to=${quote}`,
      { next: { revalidate } }
    );
    const d = await res.json();
    return d?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const YAHOO_SYMS = ["^GSPC", "^IXIC", "^VIX", "AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "DX-Y.NYB"];

  const [quotes, usdmxn, eurusd, moveRaw] = await Promise.all([
    yahooQuotes(YAHOO_SYMS),
    fxRate("USD", "MXN"),
    fxRate("EUR", "USD"),
    stooqLast("^move"),
  ]);

  const q = (sym) => quotes[sym] ?? {};

  const data = {
    asOf: new Date().toISOString(),
    delayed: false,
    // FX
    usdmxn:  usdmxn ?? 18.42,
    eurusd:  eurusd ?? 1.084,
    // Indices
    spx:     q("^GSPC").price   ?? 5412,
    spxChg:  q("^GSPC").chgPct  ?? null,
    ndx:     q("^IXIC").price   ?? 17890,
    ndxChg:  q("^IXIC").chgPct  ?? null,
    // Volatilidad
    vix:     q("^VIX").price    ?? 13.4,
    move:    moveRaw             ?? 98,
    dxy:     q("DX-Y.NYB").price ?? 104.3,
    // Acciones
    aapl:    q("AAPL").price    ?? null,
    aaplChg: q("AAPL").chgPct   ?? null,
    tsla:    q("TSLA").price    ?? null,
    tslaChg: q("TSLA").chgPct   ?? null,
    nvda:    q("NVDA").price    ?? null,
    nvdaChg: q("NVDA").chgPct   ?? null,
    // Cripto
    btc:     q("BTC-USD").price  ?? null,
    btcChg:  q("BTC-USD").chgPct ?? null,
    eth:     q("ETH-USD").price  ?? null,
    ethChg:  q("ETH-USD").chgPct ?? null,
    // Vol implícita MXN (sin fuente gratis; actualizar manualmente)
    mxnVol: 9.1,
  };

  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=1200, stale-while-revalidate=86400" },
  });
}

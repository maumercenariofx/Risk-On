// app/api/history/route.js
// Histórico de cierres diarios via Yahoo Finance v8 chart API
// Acepta: ?range=30|90|365  &symbol=USDMXN|EURMXN|CHFMXN|EURUSD|GBPUSD|USDJPY

export const revalidate = 3600;

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const RANGE_MAP  = { "30": "1mo", "90": "3mo", "365": "1y" };
const SYMBOL_MAP = {
  USDMXN: "MXN=X",
  EURMXN: "EURMXN=X",
  CHFMXN: "CHFMXN=X",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "JPY=X",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days   = searchParams.get("range")  || "30";
  const pair   = searchParams.get("symbol") || "USDMXN";
  const symbol = SYMBOL_MAP[pair]           || "MXN=X";
  const yRange = RANGE_MAP[days]            || "1mo";

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${yRange}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) return Response.json({ prices: [], labels: [] });

    const ts     = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];

    const prices = [];
    const labels = [];

    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c)) continue;
      const d     = new Date(ts[i] * 1000);
      const label = d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
      prices.push(Math.round(c * 10000) / 10000);
      labels.push(label);
    }

    return Response.json({ prices, labels }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ prices: [], labels: [] });
  }
}

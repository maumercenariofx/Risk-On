// app/api/correlation/route.js
// Fuente: Yahoo Finance v8 chart endpoint (mismo patron que /api/market).
// Empareja cierres diarios de VIX vs USD/MXN (3 meses) por fecha y calcula
// el coeficiente de correlacion de Pearson.

export const revalidate = 3600;

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function yahooCloses(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const ts     = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const map = new Map();
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c)) continue;
      const day = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      map.set(day, c);
    }
    return map;
  } catch {
    return null;
  }
}

function correlation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? null : Math.round((num / den) * 1000) / 1000;
}

export async function GET() {
  const [vix, mxn] = await Promise.all([
    yahooCloses("^VIX"),
    yahooCloses("MXN=X"),
  ]);
  if (!vix || !mxn) return Response.json({ points: [], corr: null });

  const points = [];
  for (const [day, vixVal] of vix) {
    const mxnVal = mxn.get(day);
    if (mxnVal != null) points.push({ x: vixVal, y: mxnVal, date: day });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));

  const corr = correlation(points.map((p) => p.x), points.map((p) => p.y));

  return Response.json(
    { points, corr },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
}

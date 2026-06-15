// app/api/portfolio/route.js
// Series 1Y (cierres diarios) para el chart de portafolio, normalizadas a
// base 100 y alineadas al calendario de NYSE (mismo que AAPL/SPX/JPM). El
// cliente combina estas series con los pesos elegidos por el usuario.

export const revalidate = 3600;

const YAHOO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// símbolos Yahoo -> clave de la serie devuelta
const ASSETS = {
  AAPL:   "AAPL",
  SPX:    "^GSPC",
  JPM:    "JPM",
  USDMXN: "MXN=X",
};

// Rendimiento anualizado asumido para la porción en T-bills (cash), usado
// para generar una serie sintética de crecimiento constante compuesto.
const TBILL_ANNUAL_YIELD = 0.05;

async function yahooDailyCloses(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const ts     = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c)) continue;
      out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
    }
    return out;
  } catch {
    return [];
  }
}

// Alinea una serie (date -> close) al calendario maestro, usando el último
// valor conocido <= cada fecha del calendario (forward-fill).
function alignToCalendar(series, calendarDates) {
  const out = [];
  let j = 0;
  let lastClose = series[0]?.close ?? null;
  for (const date of calendarDates) {
    while (j < series.length && series[j].date <= date) {
      lastClose = series[j].close;
      j++;
    }
    out.push(lastClose);
  }
  return out;
}

// Normaliza una serie a base 100 (primer valor válido = 100).
function normalize(values) {
  const base = values.find((v) => v != null);
  if (!base) return values.map(() => 100);
  return values.map((v) => (v == null ? null : (v / base) * 100));
}

export async function GET() {
  const [aapl, spx, jpm, usdmxn] = await Promise.all([
    yahooDailyCloses(ASSETS.AAPL),
    yahooDailyCloses(ASSETS.SPX),
    yahooDailyCloses(ASSETS.JPM),
    yahooDailyCloses(ASSETS.USDMXN),
  ]);

  // Calendario maestro: días de bolsa de NYSE (AAPL). Si por alguna razón
  // viene vacío, no hay nada que graficar.
  const calendarDates = aapl.map((p) => p.date);
  if (calendarDates.length === 0) {
    return Response.json({ labels: [], series: {} });
  }

  const labels = calendarDates.map((d) =>
    new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
  );

  const dailyRate = Math.pow(1 + TBILL_ANNUAL_YIELD, 1 / 252) - 1;
  const tbill = calendarDates.map((_, i) => 100 * Math.pow(1 + dailyRate, i));

  const series = {
    AAPL:   normalize(aapl.map((p) => p.close)),
    SPX:    normalize(alignToCalendar(spx, calendarDates)),
    JPM:    normalize(alignToCalendar(jpm, calendarDates)),
    USDMXN: normalize(alignToCalendar(usdmxn, calendarDates)),
    TBILL:  tbill,
  };

  return Response.json({ labels, series }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}

// app/api/curve/route.js
// Fuente: FRED API — curva de rendimientos del Tesoro de EE.UU. (DGS series).
// Misma clave que /api/rates (FRED_KEY).

export const revalidate = 3600;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

const SERIES = [
  { term: "1M",  id: "DGS1MO", years: 0.083 },
  { term: "3M",  id: "DGS3MO", years: 0.25 },
  { term: "6M",  id: "DGS6MO", years: 0.5 },
  { term: "1Y",  id: "DGS1",   years: 1 },
  { term: "2Y",  id: "DGS2",   years: 2 },
  { term: "5Y",  id: "DGS5",   years: 5 },
  { term: "10Y", id: "DGS10",  years: 10 },
  { term: "30Y", id: "DGS30",  years: 30 },
];

async function fredLast(seriesId) {
  try {
    const key = process.env.FRED_KEY;
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${key}&sort_order=desc&limit=1&file_type=json`;
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const val = json?.observations?.[0]?.value;
    return val && val !== "." ? parseFloat(val) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const values = await Promise.all(SERIES.map((s) => fredLast(s.id)));
  const points = SERIES
    .map((s, i) => ({ term: s.term, years: s.years, yield: values[i] }))
    .filter((p) => p.yield != null);

  const y2  = points.find((p) => p.term === "2Y")?.yield ?? null;
  const y10 = points.find((p) => p.term === "10Y")?.yield ?? null;
  const spread2s10s = (y2 != null && y10 != null) ? Math.round((y10 - y2) * 100) / 100 : null;

  return Response.json(
    {
      asOf: new Date().toISOString(),
      points,
      spread2s10s,
      inverted: spread2s10s != null ? spread2s10s < 0 : null,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
}

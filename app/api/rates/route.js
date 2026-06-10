// app/api/rates/route.js
// Fuentes:
//   Banxico SIE API  → TIIE 28d (SF43783) y Tasa objetivo (SF61745)
//   FRED API         → Fed Funds upper limit (DFEDTARU) y lower (DFEDTARL)
// Revalida cada 4 horas; las tasas cambian solo en reuniones (~cada 6-8 semanas).

export const revalidate = 1800;

const BANXICO_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1/series";
const FRED_BASE    = "https://api.stlouisfed.org/fred/series/observations";

async function banxicoLast(series) {
  try {
    const token = process.env.BANXICO_TOKEN;
    const res = await fetch(`${BANXICO_BASE}/${series}/datos/oportuno`, {
      headers: { "Bmx-Token": token },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const dato = json?.bmx?.series?.[0]?.datos?.[0]?.dato;
    return dato ? parseFloat(dato) : null;
  } catch {
    return null;
  }
}

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
  const [tiie28, banxico, fedUpper, fedLower] = await Promise.all([
    banxicoLast("SF43783"),
    banxicoLast("SF61745"),
    fredLast("DFEDTARU"),
    fredLast("DFEDTARL"),
  ]);

  // Fed Funds se expresa como el punto medio del rango objetivo
  const fed = (fedUpper != null && fedLower != null)
    ? Math.round(((fedUpper + fedLower) / 2) * 100) / 100
    : null;

  const data = {
    asOf: new Date().toISOString(),
    tiie28:  tiie28  ?? 6.60,
    banxico: banxico ?? 6.50,
    fed:     fed     ?? 3.625,
    fedRange: fedUpper != null ? `${fedLower}–${fedUpper}%` : null,
  };

  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=86400" },
  });
}

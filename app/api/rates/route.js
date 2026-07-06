// app/api/rates/route.js
// Fuentes:
//   Banxico SIE API  → TIIE 28d (SF43783), Tasa objetivo (SF61745) y FIX (SF43718)
//   FRED API         → Fed Funds upper limit (DFEDTARU) y lower (DFEDTARL)
// La RUTA revalida cada hora (el FIX es diario); las tasas de política guardan
// su caché semanal en el data cache (cambian solo en reuniones).

export const revalidate = 3600;
const RATES_TTL = 604800; // tasas de política: caché semanal (inner fetch)

const BANXICO_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1/series";
const FRED_BASE    = "https://api.stlouisfed.org/fred/series/observations";

async function banxicoLast(series, ttl = RATES_TTL) {
  try {
    const token = process.env.BANXICO_TOKEN;
    const res = await fetch(`${BANXICO_BASE}/${series}/datos/oportuno`, {
      headers: { "Bmx-Token": token },
      next: { revalidate: ttl },
    });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const d = json?.bmx?.series?.[0]?.datos?.[0];
    return d?.dato ? { value: parseFloat(d.dato), fecha: d.fecha ?? null } : null;
  } catch {
    return null;
  }
}

async function fredLast(seriesId) {
  try {
    const key = process.env.FRED_KEY;
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${key}&sort_order=desc&limit=1&file_type=json`;
    const res = await fetch(url, { next: { revalidate: RATES_TTL } });
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const val = json?.observations?.[0]?.value;
    return val && val !== "." ? parseFloat(val) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [tiie28, banxico, fix, fedUpper, fedLower] = await Promise.all([
    banxicoLast("SF43783"),
    banxicoLast("SF61745"),
    banxicoLast("SF43718", 3600), // FIX es diario → caché de 1h
    fredLast("DFEDTARU"),
    fredLast("DFEDTARL"),
  ]);

  // Fed Funds se expresa como el punto medio del rango objetivo
  const fed = (fedUpper != null && fedLower != null)
    ? Math.round(((fedUpper + fedLower) / 2) * 100) / 100
    : null;

  // Veracidad: sin fallbacks inventados. Si una fuente falla, va null y el
  // front muestra "—" — nunca un número viejo disfrazado de actual.
  const data = {
    asOf: new Date().toISOString(),
    tiie28:  tiie28?.value  ?? null,
    banxico: banxico?.value ?? null,
    fed,
    fedRange: fedUpper != null ? `${fedLower}–${fedUpper}%` : null,
    // FIX oficial de Banxico (SF43718) con su fecha de publicación —
    // el tipo de cambio "de a de veras" para liquidar obligaciones en México.
    fix: fix?.value ?? null,
    fixDate: fix?.fecha ?? null,
  };

  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}

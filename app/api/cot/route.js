// app/api/cot/route.js
// Fuente: CFTC Commitment of Traders (Legacy, Futures Only Combined) — API pública
// Socrata, sin clave. Posicionamiento de no-comerciales (especuladores) en
// futuros del Peso Mexicano (CME). Se publica los viernes con datos al martes.

export const revalidate = 86400;

const CFTC_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";

export async function GET() {
  try {
    const params = new URLSearchParams({
      "$where": "market_and_exchange_names='MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE'",
      "$order": "report_date_as_yyyy_mm_dd DESC",
      "$limit": "2",
    });
    const res = await fetch(`${CFTC_URL}?${params}`, { next: { revalidate } });
    if (!res.ok) throw new Error(res.status);
    const rows = await res.json();
    if (!rows.length) return Response.json({ available: false });

    const parse = (r) => {
      const long  = parseFloat(r.noncomm_positions_long_all);
      const short = parseFloat(r.noncomm_positions_short_all);
      return {
        date: r.report_date_as_yyyy_mm_dd.slice(0, 10),
        long,
        short,
        net: long - short,
        openInterest: parseFloat(r.open_interest_all),
      };
    };

    const latest = parse(rows[0]);
    const prev   = rows[1] ? parse(rows[1]) : null;

    return Response.json(
      {
        available: true,
        date: latest.date,
        prevDate: prev?.date ?? null,
        long: latest.long,
        short: latest.short,
        net: latest.net,
        netChange: prev ? Math.round(latest.net - prev.net) : null,
        openInterest: latest.openInterest,
      },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json({ available: false });
  }
}

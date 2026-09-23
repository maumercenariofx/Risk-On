// app/api/spot/route.js
// Spot USD/MXN en vivo para el portafolio simulado de /indice (2026-09-23):
// último candle de 1 minuto de MXN=X en Yahoo, el mismo dato que usa
// /api/market?live=1 para el correo. Respuesta mínima ({px, ts}) porque se
// consulta cada 30s desde el navegador; la caché de 30s en el edge hace que
// N lectores cuesten una sola llamada a Yahoo.
// Best-effort: si Yahoo falla responde 503 y la tarjeta se queda con el JSON
// del bot (nunca rompe la página de credibilidad, lección del 2026-08-21).

export const dynamic = "force-dynamic";
const REVALIDATE = 30;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/MXN=X?range=1d&interval=1m";
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const r = (await res.json())?.chart?.result?.[0];
    const closes = r?.indicators?.quote?.[0]?.close ?? [];
    const ts = r?.timestamp ?? [];
    let i = closes.length - 1;
    while (i >= 0 && (closes[i] == null || isNaN(closes[i]))) i--;
    if (i < 0) throw new Error("sin candles");
    return Response.json(
      { px: Math.round(closes[i] * 10000) / 10000, ts: new Date(ts[i] * 1000).toISOString() },
      { headers: { "Cache-Control": `s-maxage=${REVALIDATE}, stale-while-revalidate=120` } },
    );
  } catch (e) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

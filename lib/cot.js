// lib/cot.js — Posicionamiento especulativo en el peso (CFTC COT, semanal).
// Fuente gratuita: reporte legacy "Futures Only" que la CFTC publica cada
// viernes ~3:30pm ET con datos del martes. Formato CSV con el nombre del
// mercado entre comillas; para "MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE":
//   f[2]  = fecha del reporte (YYYY-MM-DD, siempre martes)
//   f[8]  = posiciones largas no comerciales (especuladores)
//   f[9]  = posiciones cortas no comerciales
//   f[38] = cambio semanal en largas · f[39] = cambio semanal en cortas
// Contrato CME = 500,000 MXN. Best-effort: null si la CFTC no responde.

const COT_URL = "https://www.cftc.gov/dea/newcot/deafut.txt";

export async function fetchCotMxn({ usdmxn = null } = {}) {
  try {
    const res = await fetch(COT_URL, {
      cache: "no-store",
      headers: { "User-Agent": "riskon.lat daily view (view@riskon.lat)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const line = text.split("\n").find((l) => l.toUpperCase().includes("MEXICAN PESO"));
    if (!line) throw new Error("línea MEXICAN PESO no encontrada");
    // El primer campo va entre comillas y contiene comas — sepáralo primero.
    const m = line.match(/^"([^"]*)",(.*)/);
    if (!m) throw new Error("formato inesperado");
    const f = [m[1], ...m[2].split(",").map((s) => s.trim())];
    const long = Number(f[8]), short = Number(f[9]);
    const dLong = Number(f[38]), dShort = Number(f[39]);
    if (!isFinite(long) || !isFinite(short)) throw new Error("posiciones no numéricas");
    const net = long - short;                 // >0 = especuladores largos en MXN
    const dNet = isFinite(dLong) && isFinite(dShort) ? dLong - dShort : null;
    // Nocional aproximado en USD (contrato = 500k MXN), solo si hay spot.
    const usdBn = usdmxn ? Math.round((Math.abs(net) * 500000 / usdmxn) / 1e8) / 10 : null;
    return { date: f[2], long, short, net, dNet, usdBn };
  } catch (e) {
    console.error(`[cot] no disponible (sigo sin él): ${e?.message ?? e}`);
    return null;
  }
}

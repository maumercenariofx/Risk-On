// app/api/calendar/route.js
// Calendario económico de alto impacto para USD/MXN.
// Estrategia: eventos recurrentes calculados algorítmicamente (NFP, Jobless
// Claims) + agendas oficiales anuales de FOMC y Banxico (16 fechas/año,
// se actualizan una vez en enero). Devuelve los próximos N días.
// Cache: 6 horas (los datos no cambian infra-día).

export const revalidate = 21600;

// ─── AGENDAS OFICIALES 2026 ──────────────────────────────────────────────────
// Fed publica la agenda en: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
// Banxico publica la agenda en: https://www.banxico.org.mx/publicaciones-y-prensa/calendario-de-politica-monetaria

const FOMC_2026 = [
  "2026-01-28", "2026-03-18", "2026-05-07",
  "2026-06-18", "2026-07-30", "2026-09-17",
  "2026-10-29", "2026-12-11",
];

const BANXICO_2026 = [
  "2026-02-06", "2026-03-27", "2026-05-15",
  "2026-06-26", "2026-08-14", "2026-10-02",
  "2026-11-06", "2026-12-18",
];

// CPI del BLS — aprox. segundo miércoles del mes siguiente al de referencia
// Fechas del BLS 2026: https://www.bls.gov/schedule/news_release/cpi.htm
const CPI_2026 = [
  "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-10",
  "2026-05-13", "2026-06-11", "2026-07-15", "2026-08-12",
  "2026-09-10", "2026-10-14", "2026-11-12", "2026-12-10",
];

// Nóminas No Agrícolas (NFP) — primer viernes del mes
function nfpDates(fromDate, count = 4) {
  const dates = [];
  const d = new Date(fromDate);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (dates.length < count) {
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
  }
  return dates;
}

// Jobless Claims — cada jueves
function claimsDates(fromDate, toDate) {
  const dates = [];
  const d = new Date(fromDate);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  while (d.toISOString().slice(0, 10) <= toDate) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

// ─── MAPEO DE EVENTOS ────────────────────────────────────────────────────────
function buildEvents(today, days) {
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + days);
  const to = toDate.toISOString().slice(0, 10);

  const inRange = (d) => d >= today && d <= to;

  const events = [];

  FOMC_2026.filter(inRange).forEach((d) =>
    events.push({ date: d, time: "14:00", impact: "high",
      event_es: "Decisión de tasas Fed (FOMC)",
      event_en: "FOMC Rate Decision" })
  );

  BANXICO_2026.filter(inRange).forEach((d) =>
    events.push({ date: d, time: "14:00", impact: "high",
      event_es: "Decisión de tasas Banxico",
      event_en: "Banxico Rate Decision" })
  );

  CPI_2026.filter(inRange).forEach((d) =>
    events.push({ date: d, time: "08:30", impact: "high",
      event_es: "IPC / CPI (EE.UU.)",
      event_en: "CPI Inflation (US)" })
  );

  nfpDates(today, 3).filter(inRange).forEach((d) =>
    events.push({ date: d, time: "08:30", impact: "high",
      event_es: "Nóminas No-Agrícolas / NFP",
      event_en: "Nonfarm Payrolls (NFP)" })
  );

  claimsDates(today, to).forEach((d) =>
    events.push({ date: d, time: "08:30", impact: "medium",
      event_es: "Solicitudes de desempleo (EE.UU.)",
      event_en: "Jobless Claims (US)" })
  );

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "14", 10);
  const today = new Date().toISOString().slice(0, 10);
  const events = buildEvents(today, days);

  return Response.json(events, {
    headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" },
  });
}

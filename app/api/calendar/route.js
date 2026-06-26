export const revalidate = 3600;

// ─── AGENDAS OFICIALES 2026 ───────────────────────────────────────────────────

// FOMC — Fed (anuncio el 2º día, miércoles 14:00 ET). Fuente: federalreserve.gov
const FOMC_2026 = [
  "2026-01-28","2026-03-18","2026-04-29",
  "2026-06-17","2026-07-29","2026-09-16",
  "2026-10-28","2026-12-09",
];

// BANXICO — anuncios de decisión (jueves 13:00 hora CDMX). Fuente: calendario oficial Banxico 2026.
const BANXICO_2026 = [
  "2026-02-05","2026-03-26","2026-05-07",
  "2026-06-25","2026-08-06","2026-09-24",
  "2026-11-05","2026-12-17",
];

// ECB — Banco Central Europeo (jueves 14:15 CET). Fuente: ecb.europa.eu
const ECB_2026 = [
  "2026-02-05","2026-03-19","2026-04-30",
  "2026-06-11","2026-07-23","2026-09-10",
  "2026-10-29","2026-12-17",
];

// BOE — Banco de Inglaterra (jueves 12:00 UK). Fuente: bankofengland.co.uk
const BOE_2026 = [
  "2026-02-19","2026-03-19","2026-04-30",
  "2026-06-18","2026-07-30","2026-09-17",
  "2026-11-05","2026-12-17",
];

// BOJ — Banco de Japón (anuncio el 2º día de cada reunión). Fuente: boj.or.jp
const BOJ_2026 = [
  "2026-01-23","2026-03-19","2026-04-28",
  "2026-06-16","2026-07-31","2026-09-18",
  "2026-10-30","2026-12-18",
];

// CPI BLS (EE.UU.) — fecha de publicación, 08:30 ET. Fuente: bls.gov
const CPI_US_2026 = [
  "2026-01-13","2026-02-13","2026-03-11","2026-04-10",
  "2026-05-12","2026-06-10","2026-07-14","2026-08-12",
  "2026-09-11","2026-10-14","2026-11-10","2026-12-10",
];

// PCE (EE.UU.) — Personal Income & Outlays, 08:30 ET. Fuente: bea.gov
const PCE_US_2026 = [
  "2026-01-30","2026-02-27","2026-03-27","2026-04-30",
  "2026-05-28","2026-06-25","2026-07-30","2026-08-26",
  "2026-09-30","2026-10-29","2026-11-25","2026-12-23",
];

// INEGI CPI México — INPC mensual (día 9, o hábil anterior si cae en finde). Fuente: regla INEGI.
const CPI_MX_2026 = [
  "2026-01-09","2026-02-09","2026-03-09","2026-04-09",
  "2026-05-08","2026-06-09","2026-07-09","2026-08-07",
  "2026-09-09","2026-10-09","2026-11-09","2026-12-09",
];

// IPC Flash Eurozona — último día hábil del mes de referencia. Fuente: Eurostat.
const CPI_EU_2026 = [
  "2026-01-30","2026-02-27","2026-03-31","2026-04-30",
  "2026-05-29","2026-06-30","2026-07-31","2026-08-31",
  "2026-09-30","2026-10-30","2026-11-30","2026-12-31",
];

// Ventas al Menudeo EE.UU. — Advance Retail Sales (~día 16). Fuente: census.gov
const RETAIL_US_2026 = [
  "2026-01-15","2026-02-17","2026-03-16","2026-04-16",
  "2026-05-14","2026-06-17","2026-07-16","2026-08-14",
  "2026-09-16","2026-10-15","2026-11-16","2026-12-16",
];

// ─── EVENTOS ALGORÍTMICOS ────────────────────────────────────────────────────

// NFP — primer viernes del mes
function nfpDates(from, count = 4) {
  const dates = [];
  const d = new Date(from);
  d.setDate(1); d.setMonth(d.getMonth() + 1);
  while (dates.length < count) {
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
    d.setMonth(d.getMonth() + 1); d.setDate(1);
  }
  return dates;
}

// Jobless Claims — cada jueves
function claimsDates(from, to) {
  const dates = [];
  const d = new Date(from);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  while (d.toISOString().slice(0, 10) <= to) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

// ISM Manufacturing PMI — primer día hábil del mes
function ismDates(from, count = 3) {
  const dates = [];
  const d = new Date(from);
  d.setDate(1); d.setMonth(d.getMonth() + 1);
  while (dates.length < count) {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
    d.setMonth(d.getMonth() + 1); d.setDate(1);
  }
  return dates;
}

// ─── BUILDER ─────────────────────────────────────────────────────────────────
function buildEvents(today, days) {
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + days);
  const to = toDate.toISOString().slice(0, 10);
  const inRange = (d) => d >= today && d <= to;

  const ev = (date, time, impact, flag, event_es, event_en) =>
    ({ date, time, impact, flag, event_es, event_en });

  const events = [
    ...FOMC_2026.filter(inRange).map((d) =>
      ev(d, "14:00", "high", "🇺🇸", "Decisión de tasas Fed (FOMC)", "FOMC Rate Decision")),

    ...BANXICO_2026.filter(inRange).map((d) =>
      ev(d, "13:00", "high", "🇲🇽", "Decisión de tasas Banxico", "Banxico Rate Decision")),

    ...ECB_2026.filter(inRange).map((d) =>
      ev(d, "14:15", "high", "🇪🇺", "Decisión de tasas BCE", "ECB Rate Decision")),

    ...BOE_2026.filter(inRange).map((d) =>
      ev(d, "12:00", "high", "🇬🇧", "Decisión de tasas Banco de Inglaterra", "BOE Rate Decision")),

    ...BOJ_2026.filter(inRange).map((d) =>
      ev(d, "03:00", "high", "🇯🇵", "Decisión de tasas Banco de Japón", "BOJ Rate Decision")),

    ...CPI_US_2026.filter(inRange).map((d) =>
      ev(d, "08:30", "high", "🇺🇸", "IPC / CPI (EE.UU.)", "CPI Inflation (US)")),

    ...PCE_US_2026.filter(inRange).map((d) =>
      ev(d, "08:30", "high", "🇺🇸", "PCE (gasto personal EE.UU.)", "PCE Deflator (US)")),

    ...CPI_MX_2026.filter(inRange).map((d) =>
      ev(d, "08:00", "high", "🇲🇽", "Inflación CPI (México · INEGI)", "CPI Inflation (Mexico)")),

    ...CPI_EU_2026.filter(inRange).map((d) =>
      ev(d, "10:00", "medium", "🇪🇺", "IPC Flash Eurozona", "Eurozone CPI Flash")),

    ...RETAIL_US_2026.filter(inRange).map((d) =>
      ev(d, "08:30", "medium", "🇺🇸", "Ventas al menudeo (EE.UU.)", "US Retail Sales")),

    ...nfpDates(today, 3).filter(inRange).map((d) =>
      ev(d, "08:30", "high", "🇺🇸", "Nóminas No-Agrícolas / NFP", "Nonfarm Payrolls (NFP)")),

    ...claimsDates(today, to).map((d) =>
      ev(d, "08:30", "medium", "🇺🇸", "Solicitudes de desempleo (EE.UU.)", "Jobless Claims (US)")),

    ...ismDates(today, 3).filter(inRange).map((d) =>
      ev(d, "10:00", "medium", "🇺🇸", "PMI Manufacturero ISM (EE.UU.)", "ISM Manufacturing PMI")),
  ];

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days  = parseInt(searchParams.get("days") || "14", 10);
  const today = new Date().toISOString().slice(0, 10);
  return Response.json(buildEvents(today, days), {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}

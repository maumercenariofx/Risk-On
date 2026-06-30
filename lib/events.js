// lib/events.js
// Eventos macro de alto impacto → modulan la CONVICCIÓN del índice técnico (en
// días de Fed/CPI/Banxico el chart es poco fiable, hay riesgo de latigazo).
// Fechas 2026 oficiales (mismas fuentes que app/api/calendar/route.js).
// NOTA: a futuro conviene unificar esta lista con la del calendario en un solo
// lugar; por ahora se mantiene mínima y enfocada a los eventos market-moving.

const FOMC    = ["2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-09"];
const BANXICO = ["2026-02-05","2026-03-26","2026-05-07","2026-06-25","2026-08-06","2026-09-24","2026-11-05","2026-12-17"];
const CPI_US  = ["2026-01-13","2026-02-13","2026-03-11","2026-04-10","2026-05-12","2026-06-10","2026-07-14","2026-08-12","2026-09-11","2026-10-14","2026-11-10","2026-12-10"];
const PCE_US  = ["2026-01-30","2026-02-27","2026-03-27","2026-04-30","2026-05-28","2026-06-25","2026-07-30","2026-08-26","2026-09-30","2026-10-29","2026-11-25","2026-12-23"];
const CPI_MX  = ["2026-01-09","2026-02-09","2026-03-09","2026-04-09","2026-05-08","2026-06-09","2026-07-09","2026-08-07","2026-09-09","2026-10-09","2026-11-09","2026-12-09"];
const ECB     = ["2026-02-05","2026-03-19","2026-04-30","2026-06-11","2026-07-23","2026-09-10","2026-10-29","2026-12-17"];

// Alto impacto (impacto 2): mueven a todo el mercado global.
const HIGH = new Set([...FOMC, ...CPI_US, ...PCE_US, ...BANXICO]);
// Impacto medio (1): relevantes pero más locales.
const MED = new Set([...CPI_MX, ...ECB]);

const NAME = (d) =>
  FOMC.includes(d) ? "FOMC (Fed)" : CPI_US.includes(d) ? "CPI EE.UU." :
  PCE_US.includes(d) ? "PCE EE.UU." : BANXICO.includes(d) ? "Banxico" :
  CPI_MX.includes(d) ? "INPC México" : ECB.includes(d) ? "BCE" : null;

// Hoy en hora de México (alineado con el resto del sitio).
export function todayMX() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
}

// Multiplicador de convicción según severidad y cercanía (en días hábiles).
// El mercado se des-arriesga ANTES del evento, así que la confianza baja
// gradualmente conforme se acerca, no solo el día.
function multiplier(severity, daysUntil) {
  if (severity >= 2) return [0.45, 0.6, 0.75, 0.85][Math.min(daysUntil, 3)] ?? 1; // alto
  if (severity === 1) return [0.7, 0.8, 0.9, 0.95][Math.min(daysUntil, 3)] ?? 1;  // medio
  return 1;
}

// Busca el evento de mayor impacto en los próximos `windowBiz` días HÁBILES
// (incluye hoy). Devuelve severidad, nombre, días hábiles que faltan y el
// multiplicador de convicción ya calculado.
export function eventContext(fromISO = todayMX(), windowBiz = 3) {
  let d = new Date(fromISO + "T12:00:00Z");
  let biz = 0;
  for (let i = 0; i < 14 && biz <= windowBiz; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) { // día hábil
      const severity = HIGH.has(iso) ? 2 : MED.has(iso) ? 1 : 0;
      if (severity > 0) {
        return { severity, name: NAME(iso), date: iso, daysUntil: biz, multiplier: multiplier(severity, biz) };
      }
      biz++;
    }
    d = new Date(d.getTime() + 86400000);
  }
  return { severity: 0, name: null, date: null, daysUntil: null, multiplier: 1 };
}

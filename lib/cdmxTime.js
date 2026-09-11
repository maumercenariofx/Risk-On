// lib/cdmxTime.js
// Convierte la hora LOCAL de un evento (la de su fuente oficial) a hora de la
// Ciudad de México. Existe porque el calendario guardaba cada evento en la hora
// de su país (BCE 14:15 de Frankfurt, CPI 08:30 de Nueva York) y el correo las
// imprimía bajo "AGENDA DE HOY (CDMX)": el 2026-09-10 dijo que el BCE decidía a
// las 14:15 cuando fue a las 6:15, y el redactor, que no recibía horas, las
// adivinaba ("el CPI imprime a las 7:30", cuando son las 6:30).
//
// Respeta el horario de verano de cada zona vía Intl (CDMX no tiene desde 2022)
// y puede mover la fecha: el mediodía de Tokio es la noche anterior en México.
const CDMX = "America/Mexico_City";

function partes(instante, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return Object.fromEntries(fmt.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
}

// enCdmx("2026-09-10", "14:15", "Europe/Berlin") → { date: "2026-09-10", time: "06:15" }
export function enCdmx(date, hhmm, tz) {
  if (tz === CDMX) return { date, time: hhmm };
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const pared = Date.UTC(Y, M - 1, D, h, m);
  // Desfase de la zona en ese momento: su hora de pared menos UTC, en ms.
  const p = partes(pared, tz);
  const desfase = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - pared;
  const q = partes(pared - desfase, CDMX);
  return { date: `${q.year}-${q.month}-${q.day}`, time: `${q.hour}:${q.minute}` };
}

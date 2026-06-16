// app/api/meetings/route.js
// Retorna la próxima reunión de Fed y Banxico después de ahora.
// Actualizar las listas una vez por año cuando publiquen el calendario oficial.
export const revalidate = 3600;

// FOMC 2026-2027 — decisión siempre el miércoles a las 14:00 ET
// Verano: -04:00  |  Invierno: -05:00
const FED = [
  "2026-06-18T14:00:00-04:00",
  "2026-07-29T14:00:00-04:00",
  "2026-09-16T14:00:00-04:00",
  "2026-10-28T14:00:00-04:00",
  "2026-12-09T14:00:00-05:00",
  "2027-01-27T14:00:00-05:00",
  "2027-03-17T14:00:00-04:00",
  "2027-04-28T14:00:00-04:00",
];

// Banxico Junta de Gobierno 2026-2027 — anuncio ~13:00 CDMX (-06:00)
const BANXICO = [
  "2026-06-26T13:00:00-06:00",
  "2026-08-13T13:00:00-06:00",
  "2026-09-24T13:00:00-06:00",
  "2026-11-12T13:00:00-06:00",
  "2026-12-17T13:00:00-06:00",
  "2027-02-04T13:00:00-06:00",
  "2027-03-25T13:00:00-06:00",
];

function next(list) {
  const now = Date.now();
  return list.map((s) => new Date(s)).find((d) => d.getTime() > now) ?? null;
}

export async function GET() {
  const fed     = next(FED);
  const banxico = next(BANXICO);
  return Response.json({
    fed:     fed?.toISOString()     ?? null,
    banxico: banxico?.toISOString() ?? null,
  });
}
